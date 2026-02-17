const express = require("express");
const router = express.Router();
const { body } = require("express-validator");
const BackupController = require("../controller/backupController");
const authMiddleware = require("../middleware/authMiddleware");
const { requireAdmin } = require("../middleware/roleMiddleware");
const IPWhitelistMiddleware = require("../middleware/ipWhitelistMiddleware");

/**
 * Validation rules
 */
const createBackupValidation = [
  body("description")
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage("Description must not exceed 500 characters"),
];

const restoreBackupValidation = [
  body("backupId")
    .notEmpty()
    .withMessage("Backup ID is required")
    .isInt({ min: 1 })
    .withMessage("Backup ID must be a positive integer"),
  body("confirmPassword")
    .notEmpty()
    .withMessage("Password confirmation is required for restore operation"),
];

/**
 * All routes require admin authentication + IP whitelist
 */
router.use(authMiddleware, requireAdmin, (req, res, next) =>
  IPWhitelistMiddleware.requireWhitelistedIP(req, res, next),
);

// POST /backup/create - Create database backup
router.post("/create", createBackupValidation, BackupController.createBackup);

// GET /backup/list - List all backups
router.get("/list", BackupController.listBackups);

// POST /backup/restore - Restore from backup
router.post(
  "/restore",
  restoreBackupValidation,
  BackupController.restoreBackup,
);

// DELETE /backup/:id - Delete backup
router.delete("/:id", BackupController.deleteBackup);

// GET /backup/download/:id - Download backup file
router.get("/download/:id", BackupController.downloadBackup);

module.exports = router;
