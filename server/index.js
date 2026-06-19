// Load env deterministically (needed for local + hosted environments)
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Ensure we load the correct .env file from the server/ directory.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (process.env.NODE_ENV !== 'production') {
  dotenv.config({ path: path.join(__dirname, '.env') });
}

import express from 'express';

import cors from 'cors';
import mysql from 'mysql2/promise';

import fetch from 'node-fetch';

const app = express();

const allowedOrigin = process.env.ALLOWED_ORIGIN;
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests without an Origin (like mobile apps, curl, server-to-server)
    if (!origin) return callback(null, true);
    if (!allowedOrigin) return callback(new Error('ALLOWED_ORIGIN is not configured'));
    if (origin === allowedOrigin) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: false
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '1mb' }));



const {
  AIVEN_DB_HOST,
  AIVEN_DB_PORT,
  AIVEN_DB_USER,
  AIVEN_DB_PASSWORD,
  AIVEN_DB_NAME,
  API_PORT,
  AIVEN_AD_USERS_TABLE,
  AIVEN_AD_HEALTH_TABLE,
  AIVEN_M365_LICENSE_TABLE,
  AIVEN_DHCP_HEALTH_TABLE,
  FORMSPREE_ENDPOINT,
  ALLOWED_ORIGIN
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
  if (s === 'inactive' || s === 'disabled' || s === 'deleted') return 'inactive';
  if (s === 'pending') return 'pending';
  if (s === 'active' || s === 'enabled') return 'active';
  return 'inactive';
}

app.get('/api/ad/users', async (req, res) => {
  if (!hasDb) return res.status(503).json({ ok: false, error: 'DB env vars missing' });
  try {
    const search = String(req.query.search || '').trim();
    const table = AIVEN_AD_USERS_TABLE || 'ad_users';

    const baseSQL = `SELECT * FROM \`${table}\``;
    let whereSQL = '';
    const params = [];

    if (search) {
      const candidateCols = ['uid', 'username', 'cn', 'email', 'department', 'title', 'samAccountName', 'displayName', 'userPrincipalName', 'orgUnit', 'jobTitle', 'id', 'user_id'];
      const [colsRows] = await pool.query(`SHOW COLUMNS FROM \`${table}\``);
      const existingCols = new Set((colsRows || []).map((r) => r.Field));
      const usedCols = candidateCols.filter((c) => existingCols.has(c));

      if (usedCols.length) {
        const orParts = usedCols.map((col) => ` (CAST(\`${col}\` AS CHAR) LIKE ?) `);
        whereSQL = ` WHERE ${orParts.join(' OR ')} `;
        for (let i = 0; i < usedCols.length; i++) params.push(`%${search}%`);
      }
    }

    const limit = Number(req.query.limit || 200);
    const sql = `${baseSQL}${whereSQL} ORDER BY department IS NULL, department ASC, cn ASC LIMIT ?`;
    params.push(limit);

    const [rows] = await pool.query(sql, params);

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

app.post('/api/ad/users', async (req, res) => {
  if (!hasDb) return res.status(503).json({ ok: false, error: 'DB env vars missing' });
  try {
    const table = AIVEN_AD_USERS_TABLE || 'ad_users';
    const { name, department, title, email, manager } = req.body || {};

    if (!name) {
      return res.status(400).json({ ok: false, error: 'name is required' });
    }

    const [colsRows] = await pool.query(`SHOW COLUMNS FROM \`${table}\``);
    const existingCols = new Set((colsRows || []).map((r) => r.Field));

    const insertFields = {};
    const username = (name || '').toLowerCase().replace(/\s+/g, '.');

    if (existingCols.has('cn')) insertFields.cn = name;
    if (existingCols.has('username')) insertFields.username = username;
    if (existingCols.has('uid')) insertFields.uid = username;
    if (existingCols.has('email') && email) insertFields.email = email;
    if (existingCols.has('department') && department) insertFields.department = department;
    if (existingCols.has('title') && title) insertFields.title = title;
    if (existingCols.has('status')) {
      const validStatus = await findValidStatusValue(table, 'status', ['Active', 'active']);
      insertFields.status = validStatus;
    }
    if (existingCols.has('role') && title) insertFields.role = title;
    if (existingCols.has('manager') && manager) insertFields.manager = manager;
    if (existingCols.has('created_at')) insertFields.created_at = new Date().toISOString().slice(0, 19).replace('T', ' ');

    const colNames = Object.keys(insertFields);
    if (!colNames.length) {
      return res.status(500).json({ ok: false, error: 'No writable columns found on table' });
    }

    const placeholders = colNames.map(() => '?').join(', ');
    const values = colNames.map((c) => insertFields[c]);

    const sql = `INSERT INTO \`${table}\` (${colNames.map((c) => '`' + c + '`').join(', ')}) VALUES (${placeholders})`;
    const [result] = await pool.query(sql, values);

    res.json({ ok: true, id: result.insertId, message: `User ${name} created successfully.` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err?.message || 'Server error' });
  }
});

async function findValidStatusValue(table, statusCol, candidates) {
  try {
    const [colInfo] = await pool.query(`SHOW COLUMNS FROM \`${table}\` WHERE Field = ?`, [statusCol]);
    if (!colInfo || !colInfo.length || !colInfo[0].Type) {
      return candidates[0];
    }
    const typeDef = colInfo[0].Type;
    const match = typeDef.match(/^enum\((.*)\)$/i);
    if (!match) return candidates[0];
    const enumValues = match[1].split(',').map((v) => v.replace(/^'|'$/g, ''));
    for (const candidate of candidates) {
      const found = enumValues.find((ev) => ev.toLowerCase() === candidate.toLowerCase());
      if (found) return found;
    }
    return enumValues[0] || candidates[0];
  } catch {
    return candidates[0];
  }
}

app.put('/api/ad/users/:id/disable', async (req, res) => {
  if (!hasDb) return res.status(503).json({ ok: false, error: 'DB env vars missing' });
  try {
    const table = AIVEN_AD_USERS_TABLE || 'ad_users';
    const { id } = req.params;

    const [colsRows] = await pool.query(`SHOW COLUMNS FROM \`${table}\``);
    const existingCols = new Set((colsRows || []).map((r) => r.Field));

    let statusCol = null;
    if (existingCols.has('status')) statusCol = 'status';
    else if (existingCols.has('enabled')) statusCol = 'enabled';

    if (!statusCol) {
      return res.status(500).json({ ok: false, error: 'No status column found on table' });
    }

    const idCol = existingCols.has('id') ? 'id' : existingCols.has('user_id') ? 'user_id' : null;
    if (!idCol) {
      return res.status(500).json({ ok: false, error: 'No ID column found on table' });
    }

    let setValue;
    if (statusCol === 'enabled') {
      setValue = 0;
    } else {
      setValue = await findValidStatusValue(table, statusCol, ['Inactive', 'Disabled', 'disabled', 'inactive']);
    }
    await pool.query(`UPDATE \`${table}\` SET \`${statusCol}\` = ? WHERE \`${idCol}\` = ?`, [setValue, id]);

    res.json({ ok: true, message: `User ${id} disabled.` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err?.message || 'Server error' });
  }
});

app.put('/api/ad/users/:id/enable', async (req, res) => {
  if (!hasDb) return res.status(503).json({ ok: false, error: 'DB env vars missing' });
  try {
    const table = AIVEN_AD_USERS_TABLE || 'ad_users';
    const { id } = req.params;

    const [colsRows] = await pool.query(`SHOW COLUMNS FROM \`${table}\``);
    const existingCols = new Set((colsRows || []).map((r) => r.Field));

    let statusCol = null;
    if (existingCols.has('status')) statusCol = 'status';
    else if (existingCols.has('enabled')) statusCol = 'enabled';

    if (!statusCol) {
      return res.status(500).json({ ok: false, error: 'No status column found on table' });
    }

    const idCol = existingCols.has('id') ? 'id' : existingCols.has('user_id') ? 'user_id' : null;
    if (!idCol) {
      return res.status(500).json({ ok: false, error: 'No ID column found on table' });
    }

    let setValue;
    if (statusCol === 'enabled') {
      setValue = 1;
    } else {
      setValue = await findValidStatusValue(table, statusCol, ['Active', 'active', 'Enabled']);
    }
    await pool.query(`UPDATE \`${table}\` SET \`${statusCol}\` = ? WHERE \`${idCol}\` = ?`, [setValue, id]);

    res.json({ ok: true, message: `User ${id} enabled.` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err?.message || 'Server error' });
  }
});

app.put('/api/ad/users/:id/reset-password', async (req, res) => {
  if (!hasDb) return res.status(503).json({ ok: false, error: 'DB env vars missing' });
  try {
    const table = AIVEN_AD_USERS_TABLE || 'ad_users';
    const { id } = req.params;

    const [colsRows] = await pool.query(`SHOW COLUMNS FROM \`${table}\``);
    const existingCols = new Set((colsRows || []).map((r) => r.Field));

    const idCol = existingCols.has('id') ? 'id' : existingCols.has('user_id') ? 'user_id' : null;
    if (!idCol) {
      return res.status(500).json({ ok: false, error: 'No ID column found on table' });
    }

    if (existingCols.has('password_last_set')) {
      await pool.query(`UPDATE \`${table}\` SET \`password_last_set\` = NOW() WHERE \`${idCol}\` = ?`, [id]);
    }

    res.json({ ok: true, message: `Password reset for user ${id}. Temporary password sent.` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err?.message || 'Server error' });
  }
});

app.delete('/api/ad/users/:id', async (req, res) => {
  if (!hasDb) return res.status(503).json({ ok: false, error: 'DB env vars missing' });
  try {
    const table = AIVEN_AD_USERS_TABLE || 'ad_users';
    const { id } = req.params;

    const [colsRows] = await pool.query(`SHOW COLUMNS FROM \`${table}\``);
    const existingCols = new Set((colsRows || []).map((r) => r.Field));

    const idCol = existingCols.has('id') ? 'id' : existingCols.has('user_id') ? 'user_id' : null;
    if (!idCol) {
      return res.status(500).json({ ok: false, error: 'No ID column found on table' });
    }

    try {
      await pool.query(`DELETE FROM \`${table}\` WHERE \`${idCol}\` = ?`, [id]);
    } catch (deleteErr) {
      if (existingCols.has('status')) {
        await pool.query(`UPDATE \`${table}\` SET \`status\` = 'deleted' WHERE \`${idCol}\` = ?`, [id]);
      } else {
        throw deleteErr;
      }
    }

    res.json({ ok: true, message: `User ${id} deleted.` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err?.message || 'Server error' });
  }
});

app.get('/api/ad/tree', async (_req, res) => {
  if (!hasDb) return res.status(503).json({ ok: false, error: 'DB env vars missing' });
  try {
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

app.get('/api/ad/health-check', async (req, res) => {
  if (!hasDb) return res.status(503).json({ ok: false, error: 'DB env vars missing' });
  try {
    const table = AIVEN_AD_HEALTH_TABLE || 'ADHealthCheck';

    const [tables] = await pool.query("SHOW TABLES LIKE ?", [table]);
    if (!tables || tables.length === 0) {
      return res.json({ ok: true, count: 0, records: [], message: 'No health check data available' });
    }

    const [rows] = await pool.query(`SELECT * FROM \`${table}\` ORDER BY LastChecked DESC`);
    res.json({ ok: true, count: rows.length, records: rows });
  } catch (err) {
    console.error('[AD Health Check] Error:', err);
    res.status(500).json({ ok: false, error: err?.message || 'Server error' });
  }
});

app.get('/api/health', (_req, res) => {
  if (!hasDb) return res.status(503).json({ ok: false, error: 'DB env vars missing' });
  return res.json({ ok: true });
});

app.post('/api/ad/health-check/scan', async (req, res) => {
  if (!hasDb) return res.status(503).json({ ok: false, error: 'DB env vars missing' });
  try {
    const table = AIVEN_AD_HEALTH_TABLE || 'ADHealthCheck';

    const [tables] = await pool.query("SHOW TABLES LIKE ?", [table]);
    if (!tables || tables.length === 0) {
      return res.status(404).json({ ok: false, error: 'Health check table not found' });
    }

    const [colsRows] = await pool.query(`SHOW COLUMNS FROM \`${table}\``);
    const existingCols = new Set((colsRows || []).map((r) => r.Field));
    
    if (!existingCols.has('LastChecked')) {
      return res.status(500).json({ ok: false, error: 'LastChecked column not found in table' });
    }

    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const [result] = await pool.query(
      `UPDATE \`${table}\` SET \`LastChecked\` = ?`,
      [now]
    );

    console.log(`[AD Health Check] Scan performed at ${now}. Updated ${result.affectedRows} records.`);

    res.json({ 
      ok: true, 
      message: 'Scan completed successfully',
      scanTime: now,
      recordsUpdated: result.affectedRows
    });
  } catch (err) {
    console.error('[AD Health Check] Scan error:', err);
    res.status(500).json({ ok: false, error: err?.message || 'Server error' });
  }
});

app.post('/api/contact', async (req, res) => {
  const endpoint = process.env.FORMSPREE_ENDPOINT;
  if (!endpoint) return res.status(500).json({ ok: false, error: 'FORMSPREE_ENDPOINT is not configured' });

  const { name, email, message } = req.body || {};

  const nameStr = String(name || '').trim();
  const emailStr = String(email || '').trim();
  const messageStr = String(message || '').trim();

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!nameStr) return res.status(400).json({ ok: false, error: 'name is required' });
  if (!emailStr || !emailRegex.test(emailStr)) return res.status(400).json({ ok: false, error: 'A valid email is required' });
  if (!messageStr || messageStr.length < 10) return res.status(400).json({ ok: false, error: 'message must be at least 10 characters' });

  try {
    // Forward as JSON (Formspree supports JSON + form fields)
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        name: nameStr,
        email: emailStr,
        message: messageStr
      })
    });


    if (!resp.ok) {
      return res.status(502).json({ ok: false, error: 'Formspree request failed' });
    }

    return res.json({ ok: true, message: 'Thank you for contacting! I will get back to you soon.' });
  } catch (err) {
    console.error('[Contact] Error:', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

app.post('/api/ad/health-check/scan/:dcName', async (req, res) => {
  if (!hasDb) return res.status(503).json({ ok: false, error: 'DB env vars missing' });
  try {

    const table = AIVEN_AD_HEALTH_TABLE || 'ADHealthCheck';
    const { dcName } = req.params;

    const [tables] = await pool.query("SHOW TABLES LIKE ?", [table]);
    if (!tables || tables.length === 0) {
      return res.status(404).json({ ok: false, error: 'Health check table not found' });
    }

    const [colsRows] = await pool.query(`SHOW COLUMNS FROM \`${table}\``);
    const existingCols = new Set((colsRows || []).map((r) => r.Field));
    
    if (!existingCols.has('LastChecked')) {
      return res.status(500).json({ ok: false, error: 'LastChecked column not found in table' });
    }

    let dcCol = null;
    if (existingCols.has('DCName')) dcCol = 'DCName';
    else if (existingCols.has('dc_name')) dcCol = 'dc_name';
    else if (existingCols.has('name')) dcCol = 'name';
    
    if (!dcCol) {
      return res.status(500).json({ ok: false, error: 'DC name column not found in table' });
    }

    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const [result] = await pool.query(
      `UPDATE \`${table}\` SET \`LastChecked\` = ? WHERE \`${dcCol}\` = ?`,
      [now, dcName]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ ok: false, error: `DC '${dcName}' not found` });
    }

    console.log(`[AD Health Check] Scan performed for ${dcName} at ${now}`);

    res.json({ 
      ok: true, 
      message: `Scan completed for ${dcName}`,
      scanTime: now,
      dcName: dcName
    });
  } catch (err) {
    console.error('[AD Health Check] Scan error:', err);
    res.status(500).json({ ok: false, error: err?.message || 'Server error' });
  }
});

// ============================================================
// M365 License Usage Alert
// ============================================================

app.get('/api/m365/licenses', async (req, res) => {
  if (!hasDb) return res.status(503).json({ ok: false, error: 'DB env vars missing' });
  try {
    const table = AIVEN_M365_LICENSE_TABLE || 'm365_licenses';

    const [tables] = await pool.query("SHOW TABLES LIKE ?", [table]);
    if (!tables || tables.length === 0) {
      return res.json({ ok: true, count: 0, licenses: [], message: 'No license data available' });
    }

    const [rows] = await pool.query(`SELECT * FROM \`${table}\` ORDER BY skuName ASC`);
    res.json({ ok: true, count: rows.length, licenses: rows });
  } catch (err) {
    console.error('[M365 Licenses] Error:', err);
    res.status(500).json({ ok: false, error: 'M365 licenses error: ' + (err?.message || 'Server error') });
  }
});

app.get('/api/m365/licenses/summary', async (req, res) => {
  if (!hasDb) return res.status(503).json({ ok: false, error: 'DB env vars missing' });
  try {
    const table = AIVEN_M365_LICENSE_TABLE || 'm365_licenses';

    const [tables] = await pool.query("SHOW TABLES LIKE ?", [table]);
    if (!tables || tables.length === 0) {
      return res.json({ ok: true, summary: { total: 0, healthy: 0, warning: 0, critical: 0, activeAlerts: 0, totalAssigned: 0, totalAvailable: 0, overallUsagePct: 0 } });
    }

    const [rows] = await pool.query(`SELECT * FROM \`${table}\``);

    let healthy = 0, warning = 0, critical = 0;
    let activeAlerts = 0;
    let totalAssigned = 0, totalAvailable = 0;
    let totalUsagePct = 0;

    for (const r of rows) {
      const assigned = Number(r.totalAssigned || 0);
      const available = Number(r.totalAvailable || 0);
      const capacity = assigned + available;
      const usagePct = capacity > 0 ? (assigned / capacity) * 100 : 0;
      const availablePct = capacity > 0 ? (available / capacity) * 100 : 0;
      const threshold = Number(r.thresholdPercent || 80);
      const alertEnabled = Boolean(r.alertEnabled);

      // Status based on available capacity (remaining licenses)
      if (availablePct > 70) healthy++;
      else if (availablePct >= 20) warning++;
      else critical++;

      // Active alerts: alertEnabled AND available <= threshold
      if (alertEnabled && availablePct <= threshold) activeAlerts++;

      totalAssigned += assigned;
      totalAvailable += available;
      totalUsagePct += usagePct;
    }

    const overallUsagePct = rows.length > 0 ? Math.round(totalUsagePct / rows.length) : 0;

    res.json({
      ok: true,
      summary: {
        total: rows.length,
        healthy,
        warning,
        critical,
        activeAlerts,
        totalAssigned,
        totalAvailable,
        overallUsagePct
      }
    });
  } catch (err) {
    console.error('[M365 Licenses Summary] Error:', err);
    res.status(500).json({ ok: false, error: 'M365 summary error: ' + (err?.message || 'Server error') });
  }
});

app.post('/api/m365/licenses/scan', async (req, res) => {
  if (!hasDb) return res.status(503).json({ ok: false, error: 'DB env vars missing' });
  try {
    const table = AIVEN_M365_LICENSE_TABLE || 'm365_licenses';

    const [tables] = await pool.query("SHOW TABLES LIKE ?", [table]);
    if (!tables || tables.length === 0) {
      return res.status(404).json({ ok: false, error: 'License table not found' });
    }

    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

    const [result] = await pool.query(
      `UPDATE \`${table}\` SET \`lastChecked\` = ?, \`totalAssigned\` = \`totalAssigned\` + FLOOR(RAND() * 3) WHERE \`totalAssigned\` < \`totalAvailable\``,
      [now]
    );

    res.json({
      ok: true,
      message: 'License scan completed',
      scanTime: now,
      recordsUpdated: result.affectedRows
    });
  } catch (err) {
    console.error('[M365 Licenses Scan] Error:', err);
    res.status(500).json({ ok: false, error: err?.message || 'Server error' });
  }
});

// ============================================================
// DHCP Health Check Automation
// ============================================================

app.get('/api/dhcp-health', async (req, res) => {
  if (!hasDb) return res.status(503).json({ success: false, error: 'DB env vars missing' });
  try {
    const table = AIVEN_DHCP_HEALTH_TABLE || 'DHCP_Health_Check';

    const [tables] = await pool.query("SHOW TABLES LIKE ?", [table]);
    if (!tables || tables.length === 0) {
      return res.json({ success: true, data: [], message: 'No DHCP health data available' });
    }

    const [rows] = await pool.query(`SELECT Id, DHCPServer, PingStatus, DHCPServiceStatus, ScopeCount, UsagePercentage, FailoverPartner, FailoverMode, LastChecked FROM \`${table}\` ORDER BY DHCPServer ASC`);
    const data = rows.map((row) => ({
      id: row.Id,
      dhcpServer: row.DHCPServer,
      pingStatus: row.PingStatus,
      dhcpServiceStatus: row.DHCPServiceStatus,
      scopeCount: row.ScopeCount,
      usagePercentage: Number(row.UsagePercentage),
      failoverPartner: row.FailoverPartner,
      failoverMode: row.FailoverMode,
      lastChecked: row.LastChecked,
    }));
    res.json({ success: true, data });
  } catch (err) {
    console.error('[DHCP Health] Error:', err);
    res.status(500).json({ success: false, error: err?.message || 'Server error' });
  }
});

app.get('/api/dhcp-health/summary', async (req, res) => {
  if (!hasDb) return res.status(503).json({ success: false, error: 'DB env vars missing' });
  try {
    const table = AIVEN_DHCP_HEALTH_TABLE || 'DHCP_Health_Check';

    const [tables] = await pool.query("SHOW TABLES LIKE ?", [table]);
    if (!tables || tables.length === 0) {
      return res.json({ success: true, summary: { totalServers: 0, reachableServers: 0, runningServices: 0, warningServers: 0, criticalServers: 0, avgScopeUtilization: 0 } });
    }

    const [rows] = await pool.query(`SELECT * FROM \`${table}\``);

    let totalServers = rows.length;
    let reachableServers = 0;
    let runningServices = 0;
    let warningServers = 0;
    let criticalServers = 0;
    let totalUsage = 0;

    for (const r of rows) {
      const ping = String(r.PingStatus || '').toLowerCase() === 'true' || r.PingStatus === 1 || r.PingStatus === '1';
      const service = String(r.DHCPServiceStatus || '').toLowerCase() === 'running';
      const usage = Number(r.UsagePercentage || 0);

      if (ping) reachableServers++;
      if (service) runningServices++;
      totalUsage += usage;

      if (!ping || !service || usage > 90) {
        criticalServers++;
      } else if (usage >= 80) {
        warningServers++;
      }
    }

    const avgScopeUtilization = totalServers > 0 ? Math.round(totalUsage / totalServers) : 0;

    res.json({
      success: true,
      summary: {
        totalServers,
        reachableServers,
        runningServices,
        warningServers,
        criticalServers,
        avgScopeUtilization
      }
    });
  } catch (err) {
    console.error('[DHCP Health Summary] Error:', err);
    res.status(500).json({ success: false, error: err?.message || 'Server error' });
  }
});

const port = Number(API_PORT || 3001);
app.listen(port, () => {
  console.log(`Admin API listening on http://localhost:${port}`);
});
