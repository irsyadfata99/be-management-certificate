/**
 * File Cleanup Cron Job
 *
 * Removes orphaned PDF files that exist in filesystem but not in database.
 * This can happen if:
 * 1. File upload succeeded but DB insert failed
 * 2. Manual file deletion from DB without removing file
 * 3. Application crash between upload and DB write
 *
 * Run this daily (e.g., 2 AM) to keep filesystem clean
 */

const { query } = require("../config/database");
const logger = require("./logger");
const fs = require("fs");
const path = require("path");

// Get upload directory
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, "../../uploads");
const PDF_SUBDIR = path.join(UPLOAD_DIR, "certificates");

/**
 * Clean up orphaned PDF files
 * @returns {Promise<Object>} Cleanup statistics
 */
async function cleanupOrphanedFiles() {
  logger.info("Starting orphaned file cleanup");

  // Ensure directory exists
  if (!fs.existsSync(PDF_SUBDIR)) {
    logger.warn("PDF directory does not exist, skipping cleanup", { path: PDF_SUBDIR });
    return {
      scanned: 0,
      deleted: 0,
      errors: 0,
    };
  }

  try {
    // Get all PDF files from filesystem
    const filesInDirectory = fs.readdirSync(PDF_SUBDIR).filter((file) => file.endsWith(".pdf") && !file.startsWith(".")); // Ignore hidden files

    if (filesInDirectory.length === 0) {
      logger.info("No PDF files found in directory");
      return {
        scanned: 0,
        deleted: 0,
        errors: 0,
      };
    }

    // Get all PDF filenames from database
    const result = await query("SELECT filename FROM certificate_pdfs");
    const filesInDatabase = new Set(result.rows.map((row) => row.filename));

    logger.info("Scanned files", {
      filesystem: filesInDirectory.length,
      database: filesInDatabase.size,
    });

    // Find orphaned files (in filesystem but not in database)
    const orphanedFiles = filesInDirectory.filter((file) => !filesInDatabase.has(file));

    if (orphanedFiles.length === 0) {
      logger.info("No orphaned files found");
      return {
        scanned: filesInDirectory.length,
        deleted: 0,
        errors: 0,
      };
    }

    logger.warn("Found orphaned files", { count: orphanedFiles.length });

    // Delete orphaned files
    let deleted = 0;
    let errors = 0;

    for (const filename of orphanedFiles) {
      try {
        const filePath = path.join(PDF_SUBDIR, filename);

        // Double-check file exists before deleting
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          deleted++;
          logger.info("Deleted orphaned file", { filename });
        }
      } catch (error) {
        errors++;
        logger.error("Error deleting orphaned file", {
          filename,
          error: error.message,
        });
      }
    }

    logger.info("Cleanup complete", { deleted, errors });

    return {
      scanned: filesInDirectory.length,
      deleted,
      errors,
      orphaned: orphanedFiles.length,
    };
  } catch (error) {
    logger.error("Cleanup job failed", { error: error.message, stack: error.stack });
    throw error;
  }
}

/**
 * Clean up old backup files (older than retention days)
 * @param {number} retentionDays - Keep backups newer than this many days
 * @returns {Promise<Object>} Cleanup statistics
 */
async function cleanupOldBackups(retentionDays = 30) {
  logger.info("Starting old backup cleanup", { retentionDays });

  const BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, "../../backups");

  if (!fs.existsSync(BACKUP_DIR)) {
    logger.warn("Backup directory does not exist, skipping cleanup", { path: BACKUP_DIR });
    return {
      scanned: 0,
      deleted: 0,
      errors: 0,
    };
  }

  try {
    // Calculate cutoff date
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    // Get old backups from database
    const result = await query(
      `SELECT id, filename, file_path, created_at AS "createdAt"
       FROM database_backups
       WHERE created_at < $1
       ORDER BY created_at ASC`,
      [cutoffDate],
    );

    if (result.rows.length === 0) {
      logger.info("No old backups found");
      return {
        scanned: 0,
        deleted: 0,
        errors: 0,
      };
    }

    logger.info("Found old backups", {
      count: result.rows.length,
      olderThan: retentionDays + " days",
    });

    let deleted = 0;
    let errors = 0;

    for (const backup of result.rows) {
      try {
        // Delete file from disk
        if (fs.existsSync(backup.file_path)) {
          fs.unlinkSync(backup.file_path);
        }

        // Delete database record
        await query("DELETE FROM database_backups WHERE id = $1", [backup.id]);

        deleted++;
        logger.info("Deleted old backup", {
          filename: backup.filename,
          date: new Date(backup.createdAt).toLocaleDateString(),
        });
      } catch (error) {
        errors++;
        logger.error("Error deleting backup", {
          filename: backup.filename,
          error: error.message,
        });
      }
    }

    logger.info("Backup cleanup complete", { deleted, errors });

    return {
      scanned: result.rows.length,
      deleted,
      errors,
    };
  } catch (error) {
    logger.error("Backup cleanup job failed", {
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}

/**
 * Setup cleanup cron schedules
 */
function setupCleanupJobs() {
  const cron = require("node-cron");

  // Run orphaned file cleanup daily at 2 AM
  cron.schedule("0 2 * * *", async () => {
    try {
      logger.info("Running daily file cleanup");
      await cleanupOrphanedFiles();
    } catch (error) {
      logger.error("File cleanup failed", { error: error.message });
    }
  });

  // Run old backup cleanup weekly on Sunday at 3 AM
  cron.schedule("0 3 * * 0", async () => {
    try {
      logger.info("Running weekly backup cleanup");
      const retentionDays = parseInt(process.env.BACKUP_RETENTION_DAYS, 10) || 30;
      await cleanupOldBackups(retentionDays);
    } catch (error) {
      logger.error("Backup cleanup failed", { error: error.message });
    }
  });

  logger.info("File cleanup jobs scheduled", {
    orphanedFiles: "Daily at 2:00 AM",
    oldBackups: "Weekly (Sunday) at 3:00 AM",
  });
}

module.exports = {
  cleanupOrphanedFiles,
  cleanupOldBackups,
  setupCleanupJobs,
};
