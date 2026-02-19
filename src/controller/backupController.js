const BackupService = require("../services/backupService");
const ResponseHelper = require("../utils/responseHelper");
const logger = require("../utils/logger");
const fs = require("fs");

class BackupController {
  static async createBackup(req, res, next) {
    try {
      const adminId = req.user.userId;
      const { description } = req.body;

      const result = await BackupService.createBackup(adminId, description);

      return ResponseHelper.success(
        res,
        201,
        "Database backup created successfully",
        result,
      );
    } catch (error) {
      const clientErrors = [
        "Admin does not have an assigned branch",
        "Only head branch admins can manage backups",
        "Branch is inactive",
        "pg_dump command not found",
      ];

      if (
        clientErrors.some((msg) => error.message.includes(msg)) ||
        error.message.startsWith("Backup failed")
      ) {
        return ResponseHelper.error(res, 400, error.message);
      }

      next(error);
    }
  }

  static async listBackups(req, res, next) {
    try {
      const adminId = req.user.userId;
      const backups = await BackupService.listBackups(adminId);

      return ResponseHelper.success(
        res,
        200,
        "Backups retrieved successfully",
        backups,
      );
    } catch (error) {
      if (
        error.message === "Admin does not have an assigned branch" ||
        error.message === "Only head branch admins can manage backups"
      ) {
        return ResponseHelper.error(res, 400, error.message);
      }
      next(error);
    }
  }

  static async restoreBackup(req, res, next) {
    try {
      const adminId = req.user.userId;
      const { backupId, confirmPassword } = req.body;

      const result = await BackupService.restoreBackup(
        adminId,
        backupId,
        confirmPassword,
      );

      return ResponseHelper.success(
        res,
        200,
        "Database restored successfully",
        result,
      );
    } catch (error) {
      const clientErrors = [
        "Admin does not have an assigned branch",
        "Only head branch admins can manage backups",
        "Backup not found",
        "Backup file does not exist",
        "Password confirmation is required",
        "Invalid password",
        "pg_restore command not found",
      ];

      if (
        clientErrors.some((msg) => error.message.includes(msg)) ||
        error.message.startsWith("Restore failed")
      ) {
        return ResponseHelper.error(res, 400, error.message);
      }

      next(error);
    }
  }

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
      if (
        error.message === "Admin does not have an assigned branch" ||
        error.message === "Only head branch admins can manage backups" ||
        error.message === "Backup not found" ||
        error.message === "Access denied to this backup"
      ) {
        return ResponseHelper.error(res, 400, error.message);
      }
      next(error);
    }
  }

  static async downloadBackup(req, res, next) {
    try {
      const adminId = req.user.userId;
      const backupId = parseInt(req.params.id, 10);

      if (isNaN(backupId)) {
        return ResponseHelper.error(res, 400, "Invalid backup ID");
      }

      const { filePath, filename } = await BackupService.getBackupFile(
        adminId,
        backupId,
      );

      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`,
      );

      const fileStream = fs.createReadStream(filePath);

      fileStream.on("error", (streamError) => {
        logger.error("Error streaming backup file", {
          filename,
          error: streamError.message,
        });
        // Headers may already be sent if streaming started — destroy connection
        if (!res.headersSent) {
          return ResponseHelper.error(
            res,
            500,
            "Error downloading backup file",
          );
        }
        res.destroy();
      });

      fileStream.pipe(res);
    } catch (error) {
      if (
        error.message === "Admin does not have an assigned branch" ||
        error.message === "Only head branch admins can manage backups" ||
        error.message === "Backup not found" ||
        error.message === "Access denied to this backup" ||
        error.message === "Backup file does not exist on disk"
      ) {
        return ResponseHelper.error(res, 400, error.message);
      }
      next(error);
    }
  }
}

module.exports = BackupController;
