const mysql = require('mysql2/promise');
require('dotenv').config();

/*const config = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
};*/

/*const config = {
  host: process.env.MYSQLHOST || "yamabiko.proxy.rlwy.net",
  port: parseInt(process.env.MYSQLPORT, 10) || 43143,
  user: process.env.MYSQLUSER || "root",
  password: process.env.MYSQLPASSWORD || "cJvqatUoJXOBUXpVCRgCcNzrmVZlcBya",
};*/

/*const config = {
  host: 'yamabiko.proxy.rlwy.net',
  port: 43143,
  user: 'root',
  password: 'cJvqatUoJXOBUXpVCRgCcNzrmVZlcBya'
};*/

const config = {
  host: process.env.hostname || "erzyli.h.filess.io",
  port: parseInt(process.env.port, 10) || 3307,
  user: process.env.username || "alam_mesra_db_different",
  password: process.env.password || "4b9db4e1af5306a4bea1c381d0f47aff143bdfbe",
};

let pool = null;

async function initDatabase() {
  let connection;
  try {
    connection = await mysql.createConnection(config);
    //const dbName = process.env.DB_DATABASE || 'alam_mesra_db';
    const dbName = process.env.database || "alam_mesra_db_different";
    //await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
    console.log(`✅ Database "${dbName}" ensured.`);
  } catch (err) {
    console.error('❌ Failed to connect to MySQL during initial setup check:', err.message);
    throw err;
  } finally {
    if (connection) await connection.end();
  }

  // Create connection pool with database selected
  pool = mysql.createPool({
    ...config,
    //database: process.env.DB_DATABASE || 'alam_mesra_db',
    database: process.env.database || "alam_mesra_db_different",
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });

  await createTables();
}

async function createTables() {
  const queries = [
    `CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(64) PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      name VARCHAR(255) NOT NULL,
      password VARCHAR(255) NOT NULL,
      role VARCHAR(32) NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS settings (
      id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      warningDays INT NOT NULL DEFAULT 30,
      criticalDays INT NOT NULL DEFAULT 7,
      defaultEmails TEXT,
      defaultWhatsapp TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS employees (
      id VARCHAR(64) PRIMARY KEY,
      ql DATE NULL,
      name VARCHAR(255) NOT NULL,
      passportNo VARCHAR(64) NOT NULL UNIQUE,
      passportExpiry DATE NULL,
      medicalExpiry DATE NULL,
      insuranceExpiry DATE NULL,
      employmentPassExpiry DATE NULL,
      tanaExpiry DATE NULL,
      greenIcExpiry DATE NULL,
      remarks TEXT,
      contacts JSON NULL
    )`,
    `CREATE TABLE IF NOT EXISTS notifications_log (
      id VARCHAR(64) PRIMARY KEY,
      employeeId VARCHAR(64) NOT NULL,
      employeeName VARCHAR(255) NOT NULL,
      type VARCHAR(32) NOT NULL,
      recipient VARCHAR(255) NOT NULL,
      subject VARCHAR(255) NOT NULL,
      body TEXT NOT NULL,
      sentBy VARCHAR(255),
      sentAt DATETIME NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS change_log (
      id VARCHAR(64) PRIMARY KEY,
      timestamp DATETIME NOT NULL,
      user VARCHAR(255) NOT NULL,
      action VARCHAR(64) NOT NULL,
      details JSON NULL
    )`,
    `INSERT INTO users (id, email, name, password, role)
     VALUES ('u_super', 'superadmin@system.com', 'Super Administrator', 'superadmin123', 'superadmin')
     ON DUPLICATE KEY UPDATE id=id`,
    `INSERT INTO settings (id, warningDays, criticalDays, defaultEmails, defaultWhatsapp)
     VALUES (1, 30, 7, 'manager1@system.com, safety@system.com', '+60123456789, +60198765432')
     ON DUPLICATE KEY UPDATE id=id`
  ];

  for (const query of queries) {
    try {
      await pool.query(query);
    } catch (err) {
      console.error('Error running table initialization query:', query, err.message);
      throw err;
    }
  }
  console.log('✅ MySQL tables checked/created.');
}

module.exports = {
  initDatabase,
  query: async (sql, params) => {
    if (!pool) {
      throw new Error("Database pool not initialized. Call initDatabase() first.");
    }
    const [results] = await pool.execute(sql, params);
    return results;
  }
};
