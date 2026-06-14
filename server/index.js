// Load env deterministically (needed for local + hosted environments)
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Ensure we load the correct .env file from the server/ directory.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

import express from 'express';

import cors from 'cors';
import mysql from 'mysql2/promise';

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

const {
  AIVEN_DB_HOST,
  AIVEN_DB_PORT,
  AIVEN_DB_USER,
  AIVEN_DB_PASSWORD,
  AIVEN_DB_NAME,
  API_PORT,
  AIVEN_AD_USERS_TABLE
} = process.env;

if (!AIVEN_DB_HOST || !AIVEN_DB_USER || !AIVEN_DB_PASSWORD || !AIVEN_DB_NAME) {
  console.warn('Missing DB env vars. Please copy server/.env.example to server/.env and set connection values.');
}

// Fail fast if env is missing; avoids hanging/500s later.
const hasDb = Boolean(AIVEN_DB_HOST && AIVEN_DB_USER && AIVEN_DB_PASSWORD && AIVEN_DB_NAME);
if (!hasDb) {
  console.warn('[Admin API] DB is not configured; endpoints will return 503 until .env is fixed.');
}


const pool = mysql.createPool({
  host: AIVEN_DB_HOST,
  port: Number(AIVEN_DB_PORT || 3306),
  user: AIVEN_DB_USER,
  password: AIVEN_DB_PASSWORD,
  database: AIVEN_DB_NAME,
  waitForConnections: true,
  connectionLimit: 10
});

function pickStatusColor(status) {
  const s = String(status || '').toLowerCase();
  if (s.includes('active') || s === 'enabled') return 'active';
  if (s.includes('disabled') || s.includes('inactive') || s === 'disabled') return 'inactive';
  if (s.includes('pending')) return 'pending';
  return 'inactive';
}

app.get('/api/ad/users', async (req, res) => {
  if (!hasDb) return res.status(503).json({ ok: false, error: 'DB env vars missing' });
  try {
    const search = String(req.query.search || '').trim();
    const table = AIVEN_AD_USERS_TABLE || 'ad_users';

    // Minimal, resilient query:
    // - If columns differ, you can edit this query to match your schema.
    // - We try a few common column names.
    // If your schema is known, replace this query with exact columns.

    const baseSQL = `SELECT * FROM \`${table}\``;

    // Try to find a reasonable text search column.
    // NOTE: MySQL won't let us parameterize column names; we choose a common set.
    // We use COALESCE/CASE to avoid errors if some columns don't exist.
    // If your schema doesn't contain these columns, update the query.

    let whereSQL = '';
    const params = [];

    if (search) {
      const candidateCols = ['uid', 'username', 'cn', 'email', 'department', 'title', 'samAccountName', 'displayName', 'userPrincipalName', 'orgUnit', 'jobTitle', 'id', 'user_id'];

      // Determine which columns exist in the table so we don't error on unknown columns.
      const [colsRows] = await pool.query(`SHOW COLUMNS FROM \`${table}\``);
      const existingCols = new Set((colsRows || []).map((r) => r.Field));

      const usedCols = candidateCols.filter((c) => existingCols.has(c));

      if (usedCols.length) {
        // Build OR list using only columns that exist.
        const orParts = usedCols.map((col) => ` (CAST(\`${col}\` AS CHAR) LIKE ?) `);
        whereSQL = ` WHERE ${orParts.join(' OR ')} `;
        for (let i = 0; i < usedCols.length; i++) params.push(`%${search}%`);
      } else {
        // No searchable columns exist; skip WHERE clause.
        whereSQL = '';
      }

      // DEBUG (safe): if still failing due to unknown columns, uncomment and restart.
      // console.log('search=', search, 'existingCols=', Array.from(existingCols));

    }


    // Limit for demo performance
    const limit = Number(req.query.limit || 200);

    const sql = `${baseSQL}${whereSQL} ORDER BY department IS NULL, department ASC, cn ASC LIMIT ?`;
    params.push(limit);

    const [rows] = await pool.query(sql, params);

    // Normalize to a predictable shape for the UI
    const users = rows.map((r) => {
      const status = r.status ?? r.enabled ?? r.accountStatus ?? null;
      return {
        uid: r.uid ?? r.id ?? r.user_id ?? null,
        username: r.username ?? r.samAccountName ?? null,
        cn: r.cn ?? r.displayName ?? r.name ?? null,
        email: r.email ?? r.userPrincipalName ?? null,
        department: r.department ?? r.orgUnit ?? null,
        title: r.title ?? r.jobTitle ?? null,
        status: status ?? 'unknown',
        last_logon: r.last_logon ?? r.lastLogon ?? r.lastLogin ?? null,
        _statusClass: pickStatusColor(status)
      };
    });

    res.json({ ok: true, count: users.length, users });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err?.message || 'Server error' });
  }
});

app.get('/api/ad/tree', async (_req, res) => {
  if (!hasDb) return res.status(503).json({ ok: false, error: 'DB env vars missing' });
  try {
    // Build a simple AD-like tree from departments.
    const table = AIVEN_AD_USERS_TABLE || 'ad_users';
    const [rows] = await pool.query(`SELECT DISTINCT department FROM \`${table}\` ORDER BY department IS NULL, department ASC`);

    const departments = rows
      .map((r) => r.department)
      .filter(Boolean)
      .slice(0, 50);

    res.json({
      ok: true,
      domain: 'corp.local',
      tree: {
        label: 'corp.local',
        children: [
          {
            label: 'Users',
            children: departments.map((d) => ({ label: d, children: [] }))
          }
        ]
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err?.message || 'Server error' });
  }
});

app.get('/api/health', (_req, res) => {
  if (!hasDb) return res.status(503).json({ ok: false, error: 'DB env vars missing' });
  return res.json({ ok: true });
});

const port = Number(API_PORT || 3001);
app.listen(port, () => {
  console.log(`Admin API listening on http://localhost:${port}`);
});

