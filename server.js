require("dotenv").config();
const app = require("./src/app");
const { testConnection } = require("./src/config/database");
const { setupCronJob } = require("./src/utils/certificateCronJob");
const { setupCleanupJobs } = require("./src/utils/fileCleanUpJob");
const BruteForceProtection = require("./src/middleware/bruteForceMiddleware");
const logger = require("./src/utils/logger");
const cron = require("node-cron");

// Setup certificate auto-release cron job
setupCronJob();

// Setup file cleanup cron jobs (orphaned files + old backups)
setupCleanupJobs();

// Setup brute force cleanup cron job (runs every hour)
cron.schedule("0 * * * *", () => {
  logger.info("Running brute force protection cleanup");
  BruteForceProtection.cleanup();
});

// Cleanup expired tokens 1x sehari (jam 3 pagi)
cron.schedule("0 3 * * *", async () => {
  const AuthService = require("./src/services/authService");
  await AuthService.cleanupExpiredTokens();
});

const PORT = process.env.PORT || 5000;
let server;

/**
 * Start server
 */
const startServer = async () => {
  try {
    // Test database connection
    logger.info("Testing database connection...");
    const dbConnected = await testConnection();

    if (!dbConnected) {
      logger.error("Failed to connect to database. Please check your configuration.");
      process.exit(1);
    }

    // Start Express server
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

/**
 * Graceful shutdown handler
 * Closes server and database connections cleanly
 */
const gracefulShutdown = async (signal) => {
  logger.warn(`${signal} received. Starting graceful shutdown...`);

  // Stop accepting new connections
  if (server) {
    server.close(async () => {
      logger.info("HTTP server closed");

      try {
        // Close database pool
        const { pool } = require("./src/config/database");
        await pool.end();
        logger.info("Database connections closed");

        logger.info("Graceful shutdown completed");
        process.exit(0);
      } catch (error) {
        logger.error("Error during shutdown", { error: error.message });
        process.exit(1);
      }
    });

    // Force shutdown after 10 seconds
    setTimeout(() => {
      logger.error("Forced shutdown after timeout");
      process.exit(1);
    }, 10000);
  } else {
    process.exit(0);
  }
};

// Handle graceful shutdown signals
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  logger.error("Uncaught Exception", { error: error.message, stack: error.stack });
  gracefulShutdown("UNCAUGHT_EXCEPTION");
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (error) => {
  logger.error("Unhandled Rejection", { error: error.message, stack: error.stack });
  gracefulShutdown("UNHANDLED_REJECTION");
});

// Start the server
startServer();
