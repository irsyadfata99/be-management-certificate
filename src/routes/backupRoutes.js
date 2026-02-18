const express = require("express");
const router = express.Router();
const BackupController = require("../controller/backupController");
const authMiddleware = require("../middleware/authMiddleware");
const { requireAdmin } = require("../middleware/roleMiddleware");
const { body, param } = require("express-validator");

// All routes require authentication + admin role
router.use(authMiddleware);
router.use(requireAdmin);

// ─── Specific routes FIRST (FIX Bug #17) ─────────────────────────────────────
// Aturan: route spesifik selalu didaftarkan SEBELUM route dengan parameter (:id)
// agar Express tidak salah meng-capture segment URL sebagai nilai param.
//
// Contoh bahaya (SALAH):
//   router.get("/:id", ...)           ← terdaftar dulu
//   router.get("/download/:id", ...)  ← TIDAK AKAN PERNAH tercapai karena
//                                        "download" ditangkap sebagai :id
//
// Urutan yang benar (AMAN) — seperti di bawah ini:

/**
 * GET /backup/list
 * Get list of available backups
 */
router.get("/list", BackupController.listBackups);

/**
 * GET /backup/download/:id
 * Download a backup file
 * Harus sebelum GET /:id jika nanti ditambahkan
 */
router.get("/download/:id", [param("id").isInt({ min: 1 }).withMessage("Backup ID must be a positive integer")], BackupController.downloadBackup);

/**
 * POST /backup/create
 * Create a new database backup
 */
router.post("/create", [body("description").optional().isString().trim().isLength({ max: 255 })], BackupController.createBackup);

/**
 * POST /backup/restore
 * Restore database from a backup
 */
router.post("/restore", [body("backupId").isInt({ min: 1 }).withMessage("Valid backup ID is required"), body("confirmPassword").notEmpty().withMessage("Password confirmation is required")], BackupController.restoreBackup);

// ─── Wildcard / parameterized routes LAST ────────────────────────────────────

/**
 * DELETE /backup/:id
 * Delete a backup file
 */
router.delete("/:id", [param("id").isInt({ min: 1 }).withMessage("Backup ID must be a positive integer")], BackupController.deleteBackup);

module.exports = router;
