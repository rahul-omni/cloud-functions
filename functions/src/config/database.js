const { Pool } = require('pg');
// DATABASE_URL from Secret Manager V2 only (bootstrap credential). No env, no config, no legacy Secret Manager.
const { getDatabaseUrlFromSecretManager } = require('./getOpenAiKeyFromSecretManager');

let poolPromise = null;

async function getPool() {
  if (!poolPromise) {
    poolPromise = (async () => {
      const connectionString = await getDatabaseUrlFromSecretManager(
        undefined,
        'DATABASE_URL',
        'tentativeDateSC-database'
      );

      const pool = new Pool({
        connectionString: connectionString.trim(),
        ssl: {
          rejectUnauthorized: false
        }
      });

      // Test the connection once on first creation
      pool.query('SELECT NOW()')
        .then(() => console.log('Database connected successfully'))
        .catch(err => console.error('Database connection failed:', err));

      return pool;
    })();
  }
  return poolPromise;
}

module.exports = {
  query: async (text, params) => {
    const pool = await getPool();
    return pool.query(text, params);
  },
  getPool,
};