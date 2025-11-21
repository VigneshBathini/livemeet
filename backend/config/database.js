// config/database.js
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

const pool = mysql.createPool({
  host: process.env.DB_HOST,        
  user: process.env.DB_USER,        
  password: process.env.DB_PASSWORD,  
  database: process.env.DB_NAME,    
  port: process.env.DB_PORT,        
  waitForConnections: true,
  connectionLimit: 20,
  queueLimit: 0,
  ssl: {
    ca: fs.readFileSync(path.join(__dirname, 'ca.pem')),
  }
});

async function checkDatabaseConnection() {
  try {
    const connection = await pool.getConnection();
    console.log('Database connected successfully');
    connection.release();
  } catch (err) {
    console.error('Database connection failed:', err.message);
  }
}

module.exports = { pool, checkDatabaseConnection };
