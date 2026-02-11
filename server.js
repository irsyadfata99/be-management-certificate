require("dotenv").config();
const app = require("./src/app");
const { testConnection } = require("./src/config/database");
const { setupCronJob } = require("./src/utils/certificateCronJob");
setupCronJob();

const PORT = process.env.PORT || 5000;

/**
 * Start server
 */
const startServer = async () => {
  try {
    // Test database connection
    console.log("Testing database connection...");
    const dbConnected = await testConnection();

    if (!dbConnected) {
      console.error(
        "Failed to connect to database. Please check your configuration.",
      );
      process.exit(1);
    }

    // Start Express server
    app.listen(PORT, () => {
      console.log("=".repeat(50));
      console.log(`✓ Server is running on port ${PORT}`);
      console.log(`✓ Environment: ${process.env.NODE_ENV || "development"}`);
      console.log(`✓ API URL: http://localhost:${PORT}/api`);
      console.log("=".repeat(50));
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (error) => {
  console.error("Unhandled Rejection:", error);
  process.exit(1);
});

// Start the server
startServer();
