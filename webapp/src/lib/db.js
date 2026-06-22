import sql from 'mssql';
import fs from 'fs';
import path from 'path';

const CONFIG_PATH = path.join(process.cwd(), 'db_config.json');

export function getDbConfig() {
  const defaults = {
    server: '192.168.123.100', // Default IP, user can change via UI
    database: 'TPPro',
    user: 'finalsolution',
    password: 'gmldnjs',
    port: 1433,
    trustServerCertificate: true,
  };

  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const saved = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
      return { ...defaults, ...saved };
    }
  } catch (err) {
    console.error('Error reading DB config:', err);
  }

  return defaults;
}

export async function saveDbConfig(config) {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
    // Force reconnect on next request
    global._mssqlPoolPromise = null;
    return true;
  } catch (err) {
    console.error('Error saving DB config:', err);
    return false;
  }
}

export async function getDbConnection() {
  // Use global variable to cache connection pool in development
  if (global._mssqlPoolPromise) {
    return global._mssqlPoolPromise;
  }

  const config = getDbConfig();
  const sqlConfig = {
    user: config.user,
    password: config.password,
    server: config.server,
    database: config.database,
    port: parseInt(config.port) || 1433,
    options: {
      encrypt: false,
      trustServerCertificate: config.trustServerCertificate,
      connectTimeout: 5000,
    },
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000
    }
  };

  global._mssqlPoolPromise = sql.connect(sqlConfig)
    .catch(err => {
      console.error('Database connection failed:', err);
      global._mssqlPoolPromise = null;
      throw err;
    });

  return global._mssqlPoolPromise;
}
