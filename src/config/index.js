import dotenv from 'dotenv';
dotenv.config();

const config = {
  // Server configuration
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',

  // SQL Server configuration
  sqlServer: {
    server: process.env.SQL_SERVER || 'localhost',
    database: process.env.SQL_DATABASE || 'university_db',
    user: process.env.SQL_USERNAME || 'sa',
    password: process.env.SQL_PASSWORD || '',
    port: parseInt(process.env.SQL_PORT || '1433'),
    options: {
      encrypt: process.env.SQL_ENCRYPT === 'true',
      trustServerCertificate: process.env.SQL_TRUST_SERVER_CERTIFICATE === 'true',
      enableArithAbort: true,
      connectionTimeout: 30000,
      requestTimeout: 30000
    },
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000
    }
  },

  sqlServer_gv: {
    server: process.env.SQL_SERVER || 'localhost',
    // database: process.env.SQL_DATABASE_GV || 'university_db',
    database:'HRM_NUCE',
    user: process.env.SQL_USERNAME || 'sa',
    password: process.env.SQL_PASSWORD || '',
    port: parseInt(process.env.SQL_PORT || '1433'),
    options: {
      encrypt: process.env.SQL_ENCRYPT === 'true',
      trustServerCertificate: process.env.SQL_TRUST_SERVER_CERTIFICATE === 'true',
      enableArithAbort: true,
      connectionTimeout: 30000,
      requestTimeout: 30000
    },
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000
    }
  },


  // Moodle configuration
  moodle: {
    url: process.env.MOODLE_URL || 'https://your-moodle-site.com',
    token: process.env.MOODLE_TOKEN || 'your_token',
    service: process.env.MOODLE_SERVICE || 'moodle_mobile_app'
  },

  // Sync configuration
  sync: {
    intervalMinutes: parseInt(process.env.SYNC_INTERVAL_MINUTES || '60'),
    enableAutoSync: process.env.ENABLE_AUTO_SYNC === 'true'
  },

  // Logging configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    maxFiles: process.env.LOG_MAX_FILES || '30',
    maxSize: process.env.LOG_MAX_SIZE || '10m'
  }
};

export default config;