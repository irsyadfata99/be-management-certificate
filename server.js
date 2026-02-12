require("dotenv").config();
const app = require("./src/app");
const { testConnection } = require("./src/config/database");
const { setupCronJob } = require("./src/utils/certificateCronJob");
const { setupCleanupJobs } = require("./src/utils/fileCleanupJob");
const BruteForceProtection = require("./src/middleware/bruteForceMiddleware");
const cron = require("node-cron");

// Setup certificate auto-release cron job
setupCronJob();

// Setup file cleanup cron jobs (orphaned files + old backups)
setupCleanupJobs();

// Setup brute force cleanup cron job (runs every hour)
cron.schedule("0 * * * *", () => {
  console.log("[Cron] Running brute force protection cleanup...");
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
    console.log("Testing database connection...");
    const dbConnected = await testConnection();

    if (!dbConnected) {
      console.error("Failed to connect to database. Please check your configuration.");
      process.exit(1);
    }

    // Start Express server
    server = app.listen(PORT, () => {
      console.log("=".repeat(50));
      console.log(`✓ Server is running on port ${PORT}`);
      console.log(`✓ Environment: ${process.env.NODE_ENV || "development"}`);
      console.log(`✓ API URL: http://localhost:${PORT}/api`);
      console.log(`✓ IP Whitelist: ${process.env.IP_WHITELIST_ENABLED === "true" ? "Enabled" : "Disabled"}`);
      console.log("=".repeat(50));
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

/**
 * Graceful shutdown handler
 * Closes server and database connections cleanly
 */
const gracefulShutdown = async (signal) => {
  console.log(`\n${signal} received. Starting graceful shutdown...`);

  // Stop accepting new connections
  if (server) {
    server.close(async () => {
      console.log("✓ HTTP server closed");

      try {
        // Close database pool
        const { pool } = require("./src/config/database");
        await pool.end();
        console.log("✓ Database connections closed");

        console.log("✓ Graceful shutdown completed");
        process.exit(0);
      } catch (error) {
        console.error("✗ Error during shutdown:", error);
        process.exit(1);
      }
    });

    // Force shutdown after 10 seconds
    setTimeout(() => {
      console.error("✗ Forced shutdown after timeout");
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
  console.error("Uncaught Exception:", error);
  gracefulShutdown("UNCAUGHT_EXCEPTION");
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (error) => {
  console.error("Unhandled Rejection:", error);
  gracefulShutdown("UNHANDLED_REJECTION");
});

// Start the server
startServer();
