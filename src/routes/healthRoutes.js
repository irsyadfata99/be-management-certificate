const express = require("express");
const router = express.Router();
const { pool } = require("../config/database");
const fs = require("fs");
const path = require("path");

const UPLOAD_DIR =
  process.env.UPLOAD_DIR || path.join(__dirname, "../../uploads");
const PDF_SUBDIR = path.join(UPLOAD_DIR, "certificates");
const BACKUP_DIR =
  process.env.BACKUP_DIR || path.join(__dirname, "../../backups");

/**
 * FIX POINT 6: Ganti testConnection() dengan SELECT 1 langsung dari pool.
 * testConnection() membuka koneksi baru setiap request → boros resource.
 * pool.query("SELECT 1") menggunakan koneksi yang sudah ada di pool.
 */
async function checkDatabase() {
  try {
    await pool.query("SELECT 1");
    return { status: "healthy", message: "Database connected" };
  } catch (error) {
    return { status: "unhealthy", message: error.message };
  }
}

function checkDirectory(dirPath) {
  try {
    if (!fs.existsSync(dirPath)) {
      return { status: "unhealthy", message: "Directory does not exist" };
    }

    const stats = fs.statSync(dirPath);
    if (!stats.isDirectory()) {
      return {
        status: "unhealthy",
        message: "Path exists but is not a directory",
      };
    }

    const testFile = path.join(dirPath, ".health_check");
    fs.writeFileSync(testFile, "test");
    fs.unlinkSync(testFile);

    return { status: "healthy", message: "Directory accessible and writable" };
  } catch (error) {
    return { status: "unhealthy", message: error.message };
  }
}

/**
 * GET /health
 */
router.get("/", async (req, res) => {
  const [dbResult, uploadsResult, backupsResult] = await Promise.all([
    checkDatabase(),
    Promise.resolve(checkDirectory(PDF_SUBDIR)),
    Promise.resolve(checkDirectory(BACKUP_DIR)),
  ]);

  const checks = {
    api: { status: "healthy", message: "API is running" },
    database: dbResult,
    filesystem: {
      uploads: uploadsResult,
      backups: backupsResult,
    },
  };

  const isHealthy = [dbResult, uploadsResult, backupsResult].every(
    (r) => r.status === "healthy",
  );

  const overallStatus = isHealthy ? "healthy" : "degraded";

  res.status(isHealthy ? 200 : 503).json({
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
 */
router.get("/database", async (req, res) => {
  const result = await checkDatabase();
  res.status(result.status === "healthy" ? 200 : 503).json({
    ...result,
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /health/ready
 */
router.get("/ready", async (req, res) => {
  const dbResult = await checkDatabase();
  const uploadsExist = fs.existsSync(PDF_SUBDIR);
  const isReady = dbResult.status === "healthy" && uploadsExist;

  res.status(isReady ? 200 : 503).json({
    status: isReady ? "ready" : "not ready",
    database: dbResult.status === "healthy",
    uploads: uploadsExist,
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /health/live
 */
router.get("/live", (req, res) => {
  res.json({
    status: "alive",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

module.exports = router;
