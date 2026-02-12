const BackupService = require("../services/backupService");
const ResponseHelper = require("../utils/responseHelper");

class BackupController {
  /**
   * POST /backup/create
   * Create database backup (Admin - Head Branch only)
   */
  static async createBackup(req, res, next) {
    try {
      const adminId = req.user.userId;
      const { description } = req.body;

      const result = await BackupService.createBackup(adminId, description);

      return ResponseHelper.success(res, 201, "Database backup created successfully", result);
    } catch (error) {
      const clientErrors = ["Admin does not have an assigned branch", "Only head branch admins can create backups", "Branch is inactive", "pg_dump command not found"];

      if (clientErrors.some((msg) => error.message.includes(msg)) || error.message.startsWith("Backup failed")) {
        return ResponseHelper.error(res, 400, error.message);
      }

      next(error);
    }
  }

  /**
   * GET /backup/list
   * Get list of available backups (Admin - Head Branch only)
   */
  static async listBackups(req, res, next) {
    try {
      const adminId = req.user.userId;

      const backups = await BackupService.listBackups(adminId);

      return ResponseHelper.success(res, 200, "Backups retrieved successfully", backups);
    } catch (error) {
      if (error.message === "Admin does not have an assigned branch" || error.message === "Only head branch admins can view backups") {
        return ResponseHelper.error(res, 400, error.message);
      }

      next(error);
    }
  }

  /**
   * POST /backup/restore
   * Restore database from backup (Admin - Head Branch only)
   */
  static async restoreBackup(req, res, next) {
    try {
      const adminId = req.user.userId;
      const { backupId, confirmPassword } = req.body;

      const result = await BackupService.restoreBackup(adminId, backupId, confirmPassword);

      return ResponseHelper.success(res, 200, "Database restored successfully", result);
    } catch (error) {
      const clientErrors = [
        "Admin does not have an assigned branch",
        "Only head branch admins can restore backups",
        "Backup not found",
        "Backup file does not exist",
        "Password confirmation is required",
        "Invalid password",
        "pg_restore command not found",
      ];

      if (clientErrors.some((msg) => error.message.includes(msg)) || error.message.startsWith("Restore failed")) {
        return ResponseHelper.error(res, 400, error.message);
      }

      next(error);
    }
  }

  /**
   * DELETE /backup/:id
   * Delete a backup file (Admin - Head Branch only)
   */
  static async deleteBackup(req, res, next) {
    try {
      const adminId = req.user.userId;
      const backupId = parseInt(req.params.id, 10);

      if (isNaN(backupId)) {
        return ResponseHelper.error(res, 400, "Invalid backup ID");
      }

      await BackupService.deleteBackup(adminId, backupId);

      return ResponseHelper.success(res, 200, "Backup deleted successfully");
    } catch (error) {
      if (error.message === "Admin does not have an assigned branch" || error.message === "Only head branch admins can delete backups" || error.message === "Backup not found" || error.message === "Access denied to this backup") {
        return ResponseHelper.error(res, 400, error.message);
      }

      next(error);
    }
  }

  /**
   * GET /backup/download/:id
   * Download backup file (Admin - Head Branch only)
   */
  static async downloadBackup(req, res, next) {
    try {
      const adminId = req.user.userId;
      const backupId = parseInt(req.params.id, 10);

      if (isNaN(backupId)) {
        return ResponseHelper.error(res, 400, "Invalid backup ID");
      }

      const { filePath, filename } = await BackupService.getBackupFile(adminId, backupId);

      // Set headers for file download
      res.setHeader("Content-Type", "application/sql");
      res.setHeader("Content-Disposition", `attachment; filename=${filename}`);

      // Stream file to response
      const fs = require("fs");
      const fileStream = fs.createReadStream(filePath);

      fileStream.on("error", (error) => {
        console.error("Error streaming backup file:", error);
        return ResponseHelper.error(res, 500, "Error downloading backup file");
      });

      fileStream.pipe(res);
    } catch (error) {
      if (
        error.message === "Admin does not have an assigned branch" ||
        error.message === "Only head branch admins can download backups" ||
        error.message === "Backup not found" ||
        error.message === "Access denied to this backup" ||
        error.message === "Backup file does not exist"
      ) {
        return ResponseHelper.error(res, 400, error.message);
      }

      next(error);
    }
  }
}

module.exports = BackupController;
