const express = require("express");
const router = express.Router();
const BackupController = require("../controller/backupController");
const authMiddleware = require("../middleware/authMiddleware");
const { requireAdmin } = require("../middleware/roleMiddleware");
const { body, param } = require("express-validator");

router.use(authMiddleware);
router.use(requireAdmin);

router.get("/list", BackupController.listBackups);

router.get(
  "/download/:id",
  [
    param("id")
      .isInt({ min: 1 })
      .withMessage("Backup ID must be a positive integer"),
  ],
  BackupController.downloadBackup,
);

router.post(
  "/create",
  [body("description").optional().isString().trim().isLength({ max: 255 })],
  BackupController.createBackup,
);

router.post(
  "/restore",
  [
    body("backupId")
      .isInt({ min: 1 })
      .withMessage("Valid backup ID is required"),
    body("confirmPassword")
      .notEmpty()
      .withMessage("Password confirmation is required"),
  ],
  BackupController.restoreBackup,
);

router.delete(
  "/:id",
  [
    param("id")
      .isInt({ min: 1 })
      .withMessage("Backup ID must be a positive integer"),
  ],
  BackupController.deleteBackup,
);

module.exports = router;
