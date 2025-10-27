const { Pool } = require('pg');
const functions = require('firebase-functions');
const DATABASE_URL = "postgresql://postgres:-Zn%2Fam2h94_Nhj%60l@34.93.200.175:5432/postgres";

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Required for some hosting platforms
  }
});

// Test the connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Database connection failed:', err);
  } else {
    console.log('Database connected successfully');
  }
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool
}; 