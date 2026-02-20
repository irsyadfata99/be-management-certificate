const { query } = require("../config/database");
const logger = require("./logger");
const fs = require("fs");
const path = require("path");

const UPLOAD_DIR =
  process.env.UPLOAD_DIR || path.join(__dirname, "../../uploads");
const PDF_SUBDIR = path.join(UPLOAD_DIR, "certificates");

async function cleanupOrphanedFiles() {
  logger.info("Starting orphaned file cleanup");

  if (!fs.existsSync(PDF_SUBDIR)) {
    logger.warn("PDF directory does not exist, skipping cleanup", {
      path: PDF_SUBDIR,
    });
    return {
      scanned: 0,
      deleted: 0,
      errors: 0,
    };
  }

  try {
    const filesInDirectory = fs
      .readdirSync(PDF_SUBDIR)
      .filter((file) => file.endsWith(".pdf") && !file.startsWith("."));

    if (filesInDirectory.length === 0) {
      logger.info("No PDF files found in directory");
      return {
        scanned: 0,
        deleted: 0,
        errors: 0,
      };
    }

    const result = await query("SELECT filename FROM certificate_pdfs");
    const filesInDatabase = new Set(result.rows.map((row) => row.filename));

    logger.info("Scanned files", {
      filesystem: filesInDirectory.length,
      database: filesInDatabase.size,
    });

    const orphanedFiles = filesInDirectory.filter(
      (file) => !filesInDatabase.has(file),
    );

    if (orphanedFiles.length === 0) {
      logger.info("No orphaned files found");
      return {
        scanned: filesInDirectory.length,
        deleted: 0,
        errors: 0,
      };
    }

    logger.warn("Found orphaned files", { count: orphanedFiles.length });

    let deleted = 0;
    let errors = 0;

    for (const filename of orphanedFiles) {
      try {
        const filePath = path.join(PDF_SUBDIR, filename);

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
    logger.error("Cleanup job failed", {
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}

async function cleanupOldBackups(retentionDays = 30) {
  logger.info("Starting old backup cleanup", { retentionDays });

  const BACKUP_DIR =
    process.env.BACKUP_DIR || path.join(__dirname, "../../backups");

  // Resolve to absolute path to use as the safe boundary for path traversal checks
  const resolvedBackupDir = path.resolve(BACKUP_DIR);

  if (!fs.existsSync(resolvedBackupDir)) {
    logger.warn("Backup directory does not exist, skipping cleanup", {
      path: resolvedBackupDir,
    });
    return {
      scanned: 0,
      deleted: 0,
      errors: 0,
    };
  }

  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

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
        // FIX: Validate that file_path from DB is inside the designated backup
        // directory before deleting. Prevents path traversal attacks where a
        // manipulated DB record could point to arbitrary files on the filesystem.
        const resolvedFilePath = path.resolve(backup.file_path);
        if (!resolvedFilePath.startsWith(resolvedBackupDir + path.sep)) {
          logger.error("Path traversal attempt detected, skipping file", {
            filename: backup.filename,
            file_path: backup.file_path,
            resolved: resolvedFilePath,
            backupDir: resolvedBackupDir,
          });
          errors++;
          continue;
        }

        if (fs.existsSync(resolvedFilePath)) {
          fs.unlinkSync(resolvedFilePath);
        }

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

function setupCleanupJobs() {
  const cron = require("node-cron");

  cron.schedule("0 2 * * *", async () => {
    try {
      logger.info("Running daily file cleanup");
      await cleanupOrphanedFiles();
    } catch (error) {
      logger.error("File cleanup failed", { error: error.message });
    }
  });

  cron.schedule("0 3 * * 0", async () => {
    try {
      logger.info("Running weekly backup cleanup");
      const retentionDays =
        parseInt(process.env.BACKUP_RETENTION_DAYS, 10) || 30;
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
