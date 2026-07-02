require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');

async function run() {
  try {
    const conn = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_DATABASE
    });
    const [rows] = await conn.execute('SELECT * FROM users');
    fs.writeFileSync('db-output.txt', JSON.stringify(rows, null, 2));
  } catch(e) {
    fs.writeFileSync('db-output.txt', 'Error: ' + e.message);
  }
  process.exit(0);
}
run();
