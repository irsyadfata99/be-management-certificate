require("dotenv").config();
const app = require("./src/app");
const { testConnection } = require("./src/config/database");
const { setupCronJob } = require("./src/utils/certificateCronJob");
const { setupCleanupJobs } = require("./src/utils/fileCleanUpJob");
const BruteForceProtection = require("./src/middleware/bruteForceMiddleware");
const logger = require("./src/utils/logger");
const cron = require("node-cron");

setupCronJob();
setupCleanupJobs();

cron.schedule("0 * * * *", () => {
  logger.info("Running brute force protection cleanup");
  BruteForceProtection.cleanup();
});

cron.schedule("0 3 * * *", async () => {
  const AuthService = require("./src/services/authService");
  await AuthService.cleanupExpiredTokens();
});

const PORT = process.env.PORT || 5000;
let server;

const startServer = async () => {
  try {
    logger.info("Testing database connection...");
    const dbConnected = await testConnection();

    if (!dbConnected) {
      logger.error(
        "Failed to connect to database. Please check your configuration.",
      );
      process.exit(1);
    }

    server = app.listen(PORT, () => {
      logger.info("Server started successfully", {
        port: PORT,
        environment: process.env.NODE_ENV || "development",
        apiUrl: `http://localhost:${PORT}/api`,
        ipWhitelist:
          process.env.IP_WHITELIST_ENABLED === "true" ? "Enabled" : "Disabled",
      });
    });
  } catch (error) {
    logger.error("Failed to start server", { error: error.message });
    process.exit(1);
  }
};

const gracefulShutdown = async (signal) => {
  logger.warn(`${signal} received. Starting graceful shutdown...`);

  if (server) {
    server.close(async () => {
      logger.info("HTTP server closed");

      try {
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
    setTimeout(() => {
      logger.error("Forced shutdown after timeout");
      process.exit(1);
    }, 10000);
  } else {
    process.exit(0);
  }
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

process.on("uncaughtException", (error) => {
  logger.error("Uncaught Exception", {
    error: error.message,
    stack: error.stack,
  });
  gracefulShutdown("UNCAUGHT_EXCEPTION");
});

process.on("unhandledRejection", (error) => {
  logger.error("Unhandled Rejection", {
    error: error.message,
    stack: error.stack,
  });
  gracefulShutdown("UNHANDLED_REJECTION");
});

startServer();
