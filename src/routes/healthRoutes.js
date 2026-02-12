const express = require("express");
const router = express.Router();
const { testConnection } = require("../config/database");
const fs = require("fs");
const path = require("path");

// Get upload directory from env or default
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, "../../uploads");
const PDF_SUBDIR = path.join(UPLOAD_DIR, "certificates");
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, "../../backups");

/**
 * GET /health
 * Comprehensive health check endpoint
 * Checks: API, Database, Filesystem
 */
router.get("/", async (req, res) => {
  const checks = {
    api: { status: "healthy", message: "API is running" },
    database: { status: "unknown", message: "" },
    filesystem: {
      uploads: { status: "unknown", message: "" },
      backups: { status: "unknown", message: "" },
    },
  };

  let overallStatus = "healthy";

  // Check database connection
  try {
    const dbConnected = await testConnection();
    if (dbConnected) {
      checks.database.status = "healthy";
      checks.database.message = "Database connected";
    } else {
      checks.database.status = "unhealthy";
      checks.database.message = "Database connection failed";
      overallStatus = "degraded";
    }
  } catch (error) {
    checks.database.status = "unhealthy";
    checks.database.message = error.message;
    overallStatus = "degraded";
  }

  // Check upload directory
  try {
    if (fs.existsSync(PDF_SUBDIR)) {
      const stats = fs.statSync(PDF_SUBDIR);
      if (stats.isDirectory()) {
        // Try to write a test file
        const testFile = path.join(PDF_SUBDIR, ".health_check");
        fs.writeFileSync(testFile, "test");
        fs.unlinkSync(testFile);

        checks.filesystem.uploads.status = "healthy";
        checks.filesystem.uploads.message = "Upload directory accessible and writable";
      } else {
        checks.filesystem.uploads.status = "unhealthy";
        checks.filesystem.uploads.message = "Upload path exists but is not a directory";
        overallStatus = "degraded";
      }
    } else {
      checks.filesystem.uploads.status = "unhealthy";
      checks.filesystem.uploads.message = "Upload directory does not exist";
      overallStatus = "degraded";
    }
  } catch (error) {
    checks.filesystem.uploads.status = "unhealthy";
    checks.filesystem.uploads.message = error.message;
    overallStatus = "degraded";
  }

  // Check backup directory
  try {
    if (fs.existsSync(BACKUP_DIR)) {
      const stats = fs.statSync(BACKUP_DIR);
      if (stats.isDirectory()) {
        // Try to write a test file
        const testFile = path.join(BACKUP_DIR, ".health_check");
        fs.writeFileSync(testFile, "test");
        fs.unlinkSync(testFile);

        checks.filesystem.backups.status = "healthy";
        checks.filesystem.backups.message = "Backup directory accessible and writable";
      } else {
        checks.filesystem.backups.status = "unhealthy";
        checks.filesystem.backups.message = "Backup path exists but is not a directory";
        overallStatus = "degraded";
      }
    } else {
      checks.filesystem.backups.status = "unhealthy";
      checks.filesystem.backups.message = "Backup directory does not exist";
      overallStatus = "degraded";
    }
  } catch (error) {
    checks.filesystem.backups.status = "unhealthy";
    checks.filesystem.backups.message = error.message;
    overallStatus = "degraded";
  }

  // Determine HTTP status code
  const statusCode = overallStatus === "healthy" ? 200 : 503;

  res.status(statusCode).json({
    status: overallStatus,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || "development",
    version: "1.0.0",
    checks,
  });
});

/**
 * GET /health/database
 * Database-only health check (quick check)
 */
router.get("/database", async (req, res) => {
  try {
    const connected = await testConnection();
    if (connected) {
      res.json({
        status: "healthy",
        message: "Database connected",
        timestamp: new Date().toISOString(),
      });
    } else {
      res.status(503).json({
        status: "unhealthy",
        message: "Database connection failed",
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    res.status(503).json({
      status: "unhealthy",
      message: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /health/ready
 * Readiness probe (for Kubernetes/Docker)
 * Returns 200 only if all systems are operational
 */
router.get("/ready", async (req, res) => {
  try {
    const dbConnected = await testConnection();
    const uploadsExist = fs.existsSync(PDF_SUBDIR);

    if (dbConnected && uploadsExist) {
      res.json({
        status: "ready",
        timestamp: new Date().toISOString(),
      });
    } else {
      res.status(503).json({
        status: "not ready",
        database: dbConnected,
        uploads: uploadsExist,
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    res.status(503).json({
      status: "not ready",
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /health/live
 * Liveness probe (for Kubernetes/Docker)
 * Returns 200 if server is running (doesn't check dependencies)
 */
router.get("/live", (req, res) => {
  res.json({
    status: "alive",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

module.exports = router;
