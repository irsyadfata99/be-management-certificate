require("dotenv").config();
const app = require("./src/app");
const { testConnection, pool } = require("./src/config/database");
const { setupCronJob } = require("./src/utils/certificateCronJob");
const { setupCleanupJobs } = require("./src/utils/fileCleanUpJob");
const { setupAuthCleanupJob } = require("./src/utils/authCleanupJob");
const { setupBruteForceCleanupJob } = require("./src/utils/bruteForceCleanupJob");
const logger = require("./src/utils/logger");

// ─── Server ───────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
let server;

const startServer = async () => {
  try {
    logger.info("Testing database connection...");
    const dbConnected = await testConnection();

    if (!dbConnected) {
      logger.error("Failed to connect to database. Please check your configuration.");
      process.exit(1);
    }

    // ─── Cron Jobs ─────────────────────────────────────────────────────────
    // Diinisialisasi setelah DB terkoneksi agar cron yang langsung query DB
    // tidak berjalan sebelum koneksi tersedia.
    setupCronJob();
    setupCleanupJobs();
    setupAuthCleanupJob();
    setupBruteForceCleanupJob();

    server = app.listen(PORT, () => {
      logger.info("Server started successfully", {
        port: PORT,
        environment: process.env.NODE_ENV || "development",
        apiUrl: `http://localhost:${PORT}/api`,
        ipWhitelist: process.env.IP_WHITELIST_ENABLED === "true" ? "Enabled" : "Disabled",
      });
    });
  } catch (error) {
    logger.error("Failed to start server", { error: error.message });
    process.exit(1);
  }
};

// ─── Graceful Shutdown ────────────────────────────────────────────────────────
const gracefulShutdown = async (signal) => {
  logger.warn(`${signal} received. Starting graceful shutdown...`);

  const forceExit = setTimeout(() => {
    logger.error("Forced shutdown after timeout");
    process.exit(1);
  }, 10000);

  forceExit.unref();

  if (server) {
    server.close(async () => {
      logger.info("HTTP server closed");

      try {
        await pool.end();
        logger.info("Database connections closed");
        logger.info("Graceful shutdown completed");
      } catch (error) {
        logger.error("Error during shutdown", { error: error.message });
      } finally {
        clearTimeout(forceExit);
        process.exit(0);
      }
    });
  } else {
    clearTimeout(forceExit);
    process.exit(0);
  }
};

// ─── Process Events ───────────────────────────────────────────────────────────
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

process.on("uncaughtException", (error) => {
  logger.error("Uncaught Exception", {
    error: error.message,
    stack: error.stack,
  });
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled Rejection", {
    error: reason?.message || reason,
    stack: reason?.stack,
    promise,
  });
  gracefulShutdown("UNHANDLED_REJECTION");
});

startServer();
