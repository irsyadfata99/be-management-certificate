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
  console.log("[Cleanup] Starting orphaned file cleanup...");

  // Ensure directory exists
  if (!fs.existsSync(PDF_SUBDIR)) {
    console.log("[Cleanup] PDF directory does not exist, skipping cleanup");
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
      console.log("[Cleanup] No PDF files found in directory");
      return {
        scanned: 0,
        deleted: 0,
        errors: 0,
      };
    }

    // Get all PDF filenames from database
    const result = await query("SELECT filename FROM certificate_pdfs");
    const filesInDatabase = new Set(result.rows.map((row) => row.filename));

    console.log(`[Cleanup] Found ${filesInDirectory.length} files in filesystem`);
    console.log(`[Cleanup] Found ${filesInDatabase.size} files in database`);

    // Find orphaned files (in filesystem but not in database)
    const orphanedFiles = filesInDirectory.filter((file) => !filesInDatabase.has(file));

    if (orphanedFiles.length === 0) {
      console.log("[Cleanup] No orphaned files found");
      return {
        scanned: filesInDirectory.length,
        deleted: 0,
        errors: 0,
      };
    }

    console.log(`[Cleanup] Found ${orphanedFiles.length} orphaned files`);

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
          console.log(`[Cleanup] Deleted orphaned file: ${filename}`);
        }
      } catch (error) {
        errors++;
        console.error(`[Cleanup] Error deleting file ${filename}:`, error.message);
      }
    }

    console.log(`[Cleanup] Cleanup complete: ${deleted} deleted, ${errors} errors`);

    return {
      scanned: filesInDirectory.length,
      deleted,
      errors,
      orphaned: orphanedFiles.length,
    };
  } catch (error) {
    console.error("[Cleanup] Cleanup job failed:", error);
    throw error;
  }
}

/**
 * Clean up old backup files (older than retention days)
 * @param {number} retentionDays - Keep backups newer than this many days
 * @returns {Promise<Object>} Cleanup statistics
 */
async function cleanupOldBackups(retentionDays = 30) {
  console.log(`[Cleanup] Starting old backup cleanup (retention: ${retentionDays} days)...`);

  const BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, "../../backups");

  if (!fs.existsSync(BACKUP_DIR)) {
    console.log("[Cleanup] Backup directory does not exist, skipping cleanup");
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
      `SELECT id, filename, file_path, "createdAt"
       FROM database_backups
       WHERE "createdAt" < $1
       ORDER BY "createdAt" ASC`,
      [cutoffDate],
    );

    if (result.rows.length === 0) {
      console.log("[Cleanup] No old backups found");
      return {
        scanned: 0,
        deleted: 0,
        errors: 0,
      };
    }

    console.log(`[Cleanup] Found ${result.rows.length} backups older than ${retentionDays} days`);

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
        console.log(`[Cleanup] Deleted old backup: ${backup.filename} (${new Date(backup.createdAt).toLocaleDateString()})`);
      } catch (error) {
        errors++;
        console.error(`[Cleanup] Error deleting backup ${backup.filename}:`, error.message);
      }
    }

    console.log(`[Cleanup] Backup cleanup complete: ${deleted} deleted, ${errors} errors`);

    return {
      scanned: result.rows.length,
      deleted,
      errors,
    };
  } catch (error) {
    console.error("[Cleanup] Backup cleanup job failed:", error);
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
      console.log("\n[Cron] Running daily file cleanup...");
      await cleanupOrphanedFiles();
    } catch (error) {
      console.error("[Cron] File cleanup failed:", error);
    }
  });

  // Run old backup cleanup weekly on Sunday at 3 AM
  cron.schedule("0 3 * * 0", async () => {
    try {
      console.log("\n[Cron] Running weekly backup cleanup...");
      const retentionDays = parseInt(process.env.BACKUP_RETENTION_DAYS, 10) || 30;
      await cleanupOldBackups(retentionDays);
    } catch (error) {
      console.error("[Cron] Backup cleanup failed:", error);
    }
  });

  console.log("[Cron] File cleanup jobs scheduled:");
  console.log("  - Orphaned files: Daily at 2:00 AM");
  console.log("  - Old backups: Weekly (Sunday) at 3:00 AM");
}

module.exports = {
  cleanupOrphanedFiles,
  cleanupOldBackups,
  setupCleanupJobs,
};
