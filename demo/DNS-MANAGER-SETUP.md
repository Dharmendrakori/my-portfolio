# DNS Manager Setup Guide

This guide explains how to set up the DNS Manager feature to use Aiven MySQL instead of hardcoded demo data.

## Files Created/Modified

1. **`demo/dns-mysql-setup.sql`** - MySQL table schema and sample data
2. **`server/index.js`** - Added 4 DNS API endpoints (GET, POST, PUT, DELETE)
3. **`demo/admin-tasks-demo.html`** - DNS Manager UI with API integration

---

## Step 1: Create MySQL Table

Run the SQL from `demo/dns-mysql-setup.sql` in your Aiven MySQL database:

```bash
# Option A: Using MySQL command line
mysql -h your-host.aivencloud.com -u avnadmin -p your-database < demo/dns-mysql-setup.sql

# Option B: Using Aiven Console
# 1. Go to Aiven Console → Your MySQL Service → Query Editor
# 2. Copy and paste the contents of demo/dns-mysql-setup.sql
# 3. Execute the query
```

### Table Structure

```sql
CREATE TABLE IF NOT EXISTS `dns_records` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `zone` VARCHAR(255) NOT NULL DEFAULT 'corp.local',
  `name` VARCHAR(255) NOT NULL,
  `type` ENUM('A','CNAME','MX','TXT','NS','PTR','SRV','AAAA') NOT NULL DEFAULT 'A',
  `value` TEXT NOT NULL,
  `ttl` INT NOT NULL DEFAULT 3600,
  `priority` INT DEFAULT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_zone` (`zone`),
  INDEX `idx_zone_name` (`zone`, `name`),
  INDEX `idx_type` (`type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### Sample Data

The SQL file includes 10 sample records across 3 zones:
- **corp.local**: 6 records (A, MX, CNAME, TXT)
- **corp.internal**: 2 records (A)
- **corp.external**: 2 records (A)

---

## Step 2: Configure Environment Variable

Add to your `server/.env` file:

```env
AIVEN_DNS_TABLE=dns_records
```

**Note:** If not set, the API defaults to `dns_records`.

---

## Step 3: Deploy Server Changes

The following endpoints have been added to `server/index.js`:

### GET `/api/dns/records`
Fetch DNS records for a specific zone.

**Query Parameters:**
- `zone` (required): DNS zone name (e.g., `corp.local`)

**Response:**
```json
{
  "ok": true,
  "records": [
    {
      "id": 1,
      "zone": "corp.local",
      "name": "@",
      "type": "A",
      "value": "10.0.0.10",
      "ttl": 3600,
      "priority": null,
      "is_active": true,
      "created_at": "2024-01-01 00:00:00",
      "updated_at": "2024-01-01 00:00:00"
    }
  ]
}
```

### POST `/api/dns/records`
Create a new DNS record.

**Request Body:**
```json
{
  "zone": "corp.local",
  "name": "www",
  "type": "A",
  "value": "10.0.0.50",
  "ttl": 3600,
  "priority": null
}
```

**Response:**
```json
{
  "ok": true,
  "id": 11,
  "message": "DNS record created: www (A)"
}
```

### PUT `/api/dns/records/:id`
Update an existing DNS record.

**Request Body:**
```json
{
  "name": "www",
  "type": "A",
  "value": "10.0.0.51",
  "ttl": 1800
}
```

**Response:**
```json
{
  "ok": true,
  "message": "DNS record 11 updated"
}
```

### DELETE `/api/dns/records/:id`
Delete a DNS record.

**Query Parameters:**
- `zone` (required): DNS zone name

**Response:**
```json
{
  "ok": true,
  "message": "DNS record 11 deleted"
}
```

---

## Step 4: Restart Server

```bash
cd server
npm start
```

You should see:
```
Admin API listening on http://localhost:3001
```

---

## Step 5: Test the Frontend

1. Open `demo/admin-tasks-demo.html` in your browser
2. Go to **Active Directory** tab
3. Double-click **DNS Manager**
4. Select a zone from the dropdown
5. Records will load from MySQL

### Features:
- ✅ View DNS records in a table
- ✅ Add new records (A, CNAME, MX, TXT)
- ✅ Edit existing records
- ✅ Delete records
- ✅ Zone selector (corp.local, corp.internal, corp.external)
- ✅ Refresh button
- ✅ PowerShell log integration

---

## Supported DNS Record Types

- **A** - IPv4 address
- **CNAME** - Canonical name (alias)
- **MX** - Mail exchange
- **TXT** - Text record
- **NS** - Name server
- **PTR** - Pointer (reverse DNS)
- **SRV** - Service locator
- **AAAA** - IPv6 address

---

## Troubleshooting

### "No DNS records table found"
- Ensure you've run the SQL schema in Aiven MySQL
- Check that `AIVEN_DNS_TABLE` env var is set correctly

### "DB env vars missing"
- Verify `server/.env` has all required Aiven MySQL credentials
- Check that the server has been restarted after adding env vars

### CORS errors
- Ensure `ALLOWED_ORIGIN` is set to your GitHub Pages URL
- Check that the API is running and accessible

### Records not loading
- Open browser DevTools → Console → Check for errors
- Check PowerShell log in the demo for error messages
- Verify API health: `https://portfolio-api-3sx8.onrender.com/api/health`

---

## API Response Codes

- `200 OK` - Success
- `400 Bad Request` - Missing required fields
- `404 Not Found` - Record not found
- `500 Internal Server Error` - Server/database error
- `503 Service Unavailable` - Database not configured

---

## Security Notes

- All API endpoints validate input and use parameterized queries to prevent SQL injection
- The `priority` field is optional (used for MX records)
- The `is_active` field allows soft deletion
- CORS is configured to allow only specified origins

---

## Next Steps

1. ✅ Table created in Aiven MySQL
2. ✅ API endpoints deployed
3. ✅ Frontend connected to API
4. 🔄 Test with real data
5. 🔄 Add more zones as needed
6. 🔄 Implement additional DNS record types if required