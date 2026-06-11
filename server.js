/**
 * Lightweight Node.js server for Alam Mesra Project
 * - Serves static files (HTML, CSS, JS)
 * - Provides REST API to read/write MySQL Database
 */
require('dotenv').config();
const http = require('http');
const fs = require('fs');
const path = require('path');
const db = require('./db-connector');

const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'database.json');

// MIME types for static files
const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

// Helper to format date object to YYYY-MM-DD
function formatDate(d) {
  if (!d) return '';
  const date = new Date(d);
  if (isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Read the database from MySQL
async function readAllDB() {
  const users = await db.query('SELECT * FROM users');
  const settingsRows = await db.query('SELECT * FROM settings WHERE id = 1');
  const settings = settingsRows[0] ? {
    warningDays: settingsRows[0].warningDays,
    criticalDays: settingsRows[0].criticalDays,
    defaultEmails: settingsRows[0].defaultEmails,
    defaultWhatsapp: settingsRows[0].defaultWhatsapp
  } : {};

  const employeesRows = await db.query('SELECT * FROM employees');
  const employees = employeesRows.map(emp => ({
    id: emp.id,
    ql: formatDate(emp.ql),
    name: emp.name,
    passportNo: emp.passportNo,
    passportExpiry: formatDate(emp.passportExpiry),
    medicalExpiry: formatDate(emp.medicalExpiry),
    insuranceExpiry: formatDate(emp.insuranceExpiry),
    employmentPassExpiry: formatDate(emp.employmentPassExpiry),
    tanaExpiry: formatDate(emp.tanaExpiry),
    greenIcExpiry: formatDate(emp.greenIcExpiry),
    remarks: emp.remarks || '',
    contacts: typeof emp.contacts === 'string' ? JSON.parse(emp.contacts) : (emp.contacts || { emails: [], whatsappNumbers: [] })
  }));

  const notificationsRows = await db.query('SELECT * FROM notifications_log ORDER BY sentAt DESC');
  const notifications_log = notificationsRows.map(n => ({
    id: n.id,
    employeeId: n.employeeId,
    employeeName: n.employeeName,
    type: n.type,
    recipient: n.recipient,
    subject: n.subject,
    body: n.body,
    sentBy: n.sentBy,
    sentAt: n.sentAt ? new Date(n.sentAt).toISOString() : new Date().toISOString()
  }));

  const changeRows = await db.query('SELECT * FROM change_log ORDER BY timestamp ASC');
  const change_log = changeRows.map(c => ({
    timestamp: c.timestamp ? new Date(c.timestamp).toISOString() : new Date().toISOString(),
    user: c.user,
    action: c.action,
    details: typeof c.details === 'string' ? JSON.parse(c.details) : (c.details || {})
  }));

  return {
    users,
    settings,
    employees,
    notifications_log,
    change_log
  };
}

// Overwrite users table
async function updateUsers(usersArray) {
  await db.query('DELETE FROM users');
  for (const u of usersArray) {
    await db.query(
      'INSERT INTO users (id, email, name, password, role) VALUES (?, ?, ?, ?, ?)',
      [u.id, u.email, u.name, u.password, u.role]
    );
  }
}

// Overwrite settings table
async function updateSettings(settingsObj) {
  await db.query(
    `INSERT INTO settings (id, warningDays, criticalDays, defaultEmails, defaultWhatsapp)
     VALUES (1, ?, 7, ?, ?)
     ON DUPLICATE KEY UPDATE warningDays = VALUES(warningDays), defaultEmails = VALUES(defaultEmails), defaultWhatsapp = VALUES(defaultWhatsapp)`,
    [settingsObj.warningDays || 30, settingsObj.defaultEmails || '', settingsObj.defaultWhatsapp || '']
  );
}

// Overwrite employees table
async function updateEmployees(employeesArray) {
  await db.query('DELETE FROM employees');
  for (const emp of employeesArray) {
    const ql = emp.ql || null;
    const passportExpiry = emp.passportExpiry || null;
    const medicalExpiry = emp.medicalExpiry || null;
    const insuranceExpiry = emp.insuranceExpiry || null;
    const employmentPassExpiry = emp.employmentPassExpiry || null;
    const tanaExpiry = emp.tanaExpiry || null;
    const greenIcExpiry = emp.greenIcExpiry || null;
    const contacts = emp.contacts ? JSON.stringify(emp.contacts) : null;

    await db.query(
      `INSERT INTO employees (id, ql, name, passportNo, passportExpiry, medicalExpiry, insuranceExpiry, employmentPassExpiry, tanaExpiry, greenIcExpiry, remarks, contacts)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        emp.id, ql, emp.name, emp.passportNo, passportExpiry, medicalExpiry,
        insuranceExpiry, employmentPassExpiry, tanaExpiry, greenIcExpiry,
        emp.remarks || '', contacts
      ]
    );
  }
}

// Overwrite notifications log table
async function updateNotificationsLog(logArray) {
  await db.query('DELETE FROM notifications_log');
  for (const n of logArray) {
    const sentAt = n.sentAt ? new Date(n.sentAt) : new Date();
    await db.query(
      `INSERT INTO notifications_log (id, employeeId, employeeName, type, recipient, subject, body, sentBy, sentAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [n.id, n.employeeId, n.employeeName, n.type, n.recipient, n.subject, n.body, n.sentBy || '', sentAt]
    );
  }
}

// Overwrite change log table
async function updateChangeLog(logArray) {
  await db.query('DELETE FROM change_log');
  for (const c of logArray) {
    const id = 'chg_' + Math.random().toString(36).substr(2, 9);
    const timestamp = c.timestamp ? new Date(c.timestamp) : new Date();
    const details = c.details ? JSON.stringify(c.details) : null;
    await db.query(
      `INSERT INTO change_log (id, timestamp, user, action, details)
       VALUES (?, ?, ?, ?, ?)`,
      [id, timestamp, c.user, c.action, details]
    );
  }
}

// Migrate database.json to MySQL if it exists
async function migrateJsonToMysql() {
  if (fs.existsSync(DB_FILE)) {
    console.log('📂 Found database.json. Initiating data migration to MySQL...');
    try {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      const data = JSON.parse(raw);

      if (data.users && data.users.length) {
        await updateUsers(data.users);
        console.log(`- Migrated ${data.users.length} users.`);
      }
      if (data.settings) {
        await updateSettings(data.settings);
        console.log(`- Migrated settings.`);
      }
      if (data.employees && data.employees.length) {
        await updateEmployees(data.employees);
        console.log(`- Migrated ${data.employees.length} employees.`);
      }
      if (data.notifications_log && data.notifications_log.length) {
        await updateNotificationsLog(data.notifications_log);
        console.log(`- Migrated ${data.notifications_log.length} notifications log entries.`);
      }
      if (data.change_log && data.change_log.length) {
        await updateChangeLog(data.change_log);
        console.log(`- Migrated ${data.change_log.length} change log entries.`);
      }

      // Rename to database.json.bak
      const bakFile = DB_FILE + '.bak';
      fs.renameSync(DB_FILE, bakFile);
      console.log(`✅ Data migration completed. Renamed database.json to database.json.bak`);
    } catch (err) {
      console.error('❌ Error during data migration to MySQL:', err.message);
    }
  }
}

// Parse request body (JSON)
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

// Create the HTTP server
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  // --- API Routes ---
  if (pathname === '/api/db' && req.method === 'GET') {
    try {
      const data = await readAllDB();
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(data));
    } catch (e) {
      console.error('Error reading from MySQL:', e.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to read from MySQL server: ' + e.message }));
    }
    return;
  }

  if (pathname === '/api/db' && req.method === 'PUT') {
    try {
      const body = await parseBody(req);
      if (body.users) await updateUsers(body.users);
      if (body.settings) await updateSettings(body.settings);
      if (body.employees) await updateEmployees(body.employees);
      if (body.notifications_log) await updateNotificationsLog(body.notifications_log);
      if (body.change_log) await updateChangeLog(body.change_log);

      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ success: true }));
    } catch (e) {
      console.error('Error writing to MySQL:', e.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to write to MySQL server: ' + e.message }));
    }
    return;
  }

  if (pathname.startsWith('/api/db/') && req.method === 'PUT') {
    const table = pathname.replace('/api/db/', '');
    try {
      const body = await parseBody(req);
      let success = true;

      if (table === 'users') await updateUsers(body);
      else if (table === 'settings') await updateSettings(body);
      else if (table === 'employees') await updateEmployees(body);
      else if (table === 'notifications_log') await updateNotificationsLog(body);
      else if (table === 'change_log') await updateChangeLog(body);
      else success = false;

      res.writeHead(success ? 200 : 400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ success }));
    } catch (e) {
      console.error('Error writing table to MySQL:', e.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to write to MySQL server: ' + e.message }));
    }
    return;
  }

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }

  // --- Static File Serving ---
  let filePath = pathname === '/' ? '/index.html' : pathname;
  filePath = path.join(__dirname, filePath);

  // Security: prevent directory traversal
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const mimeType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404);
        res.end('File not found');
      } else {
        res.writeHead(500);
        res.end('Server error');
      }
      return;
    }
    res.writeHead(200, { 'Content-Type': mimeType });
    res.end(data);
  });
});

// Start
async function startServer() {
  try {
    await db.initDatabase();
    await migrateJsonToMysql();

    server.listen(PORT, () => {
      console.log(`\n🚀 Alam Mesra Server running at http://localhost:${PORT}\n`);
      console.log(`   MySQL Database connected and synchronized.`);
      console.log(`   Open your browser to: http://localhost:${PORT}\n`);
    });
  } catch (err) {
    console.error('❌ Failed to start server due to database error:', err.message);
    process.exit(1);
  }
}

startServer();
