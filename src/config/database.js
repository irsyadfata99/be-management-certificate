const { Pool } = require("pg");
require("dotenv").config();

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || "saas_certificate",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "",
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 8000,
};

// Create connection pool
const pool = new Pool(dbConfig);

pool.on("error", (err) => {
  console.error("[DB Pool] Unexpected error on idle client:", err.message);
});

// Test database connection
const testConnection = async () => {
  try {
    const client = await pool.connect();
    console.log("✓ Database connected successfully");
    client.release();
    return true;
  } catch (error) {
    console.error("✗ Database connection failed:", error.message);
    return false;
  }
};

// Query helper function
const query = async (text, params) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);

    if (process.env.NODE_ENV === "development") {
      const duration = Date.now() - start;
      console.log("Executed query", { text, duration, rows: res.rowCount });
    }

    return res;
  } catch (error) {
    console.error("Query error:", error);
    throw error;
  }
};

// Get a client from pool for transactions
const getClient = async () => {
  try {
    const client = await pool.connect();
    return client;
  } catch (error) {
    console.error("Error getting client from pool:", error);
    throw error;
  }
};

module.exports = {
  pool,
  query,
  getClient,
  testConnection,
};
