const { Pool } = require("pg");
require("dotenv").config();

// Lazy-load logger to avoid circular dependency issues at startup
// (logger → winston → transport → fs, database loads very early)
let _logger = null;
const getLogger = () => {
  if (!_logger) {
    try {
      _logger = require("../utils/logger");
    } catch {
      _logger = console; // fallback during very early boot
    }
  }
  return _logger;
};

const dbConfig = {
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  database: process.env.DB_NAME || "saas_certificate",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "",
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 8000,
};

const pool = new Pool(dbConfig);

pool.on("error", (err) => {
  getLogger().error("[DB Pool] Unexpected error on idle client", {
    error: err.message,
    stack: err.stack,
  });
});

const testConnection = async () => {
  try {
    const client = await pool.connect();
    getLogger().info("Database connected successfully");
    client.release();
    return true;
  } catch (error) {
    getLogger().error("Database connection failed", { error: error.message });
    return false;
  }
};

const query = async (text, params) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);

    if (process.env.NODE_ENV === "development") {
      const duration = Date.now() - start;
      getLogger().debug("Executed query", {
        text,
        duration: `${duration}ms`,
        rows: res.rowCount,
      });
    }

    return res;
  } catch (error) {
    getLogger().error("Query error", {
      error: error.message,
      query: text,
      code: error.code,
    });
    throw error;
  }
};

const getClient = async () => {
  try {
    const client = await pool.connect();
    return client;
  } catch (error) {
    getLogger().error("Error getting client from pool", {
      error: error.message,
    });
    throw error;
  }
};

module.exports = {
  pool,
  query,
  getClient,
  testConnection,
};
