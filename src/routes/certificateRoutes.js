const express = require("express");
const router = express.Router();
const { body } = require("express-validator");
const CertificateController = require("../controller/certificateController");
const CertificateTeacherController = require("../controller/certificateTeacherController");
const CertificateLogController = require("../controller/certificateLogController");
const authMiddleware = require("../middleware/authMiddleware");
const { requireAdmin, requireRole } = require("../middleware/roleMiddleware");

// ─── Validation Rules ─────────────────────────────────────────────────────

const bulkCreateValidation = [
  body("startNumber")
    .isInt({ min: 1 })
    .withMessage("startNumber must be a positive integer"),
  body("endNumber")
    .isInt({ min: 1 })
    .withMessage("endNumber must be a positive integer"),
];

const migrateValidation = [
  body("startNumber")
    .trim()
    .notEmpty()
    .withMessage("startNumber is required")
    .matches(/^No\. \d{6}$/)
    .withMessage('startNumber must be in format "No. 000000"'),
  body("endNumber")
    .trim()
    .notEmpty()
    .withMessage("endNumber is required")
    .matches(/^No\. \d{6}$/)
    .withMessage('endNumber must be in format "No. 000000"'),
  body("toBranchId")
    .isInt({ min: 1 })
    .withMessage("toBranchId must be a positive integer"),
];

const reserveValidation = [
  body("branchId")
    .isInt({ min: 1 })
    .withMessage("branchId must be a positive integer"),
];

const printValidation = [
  body("certificateId")
    .isInt({ min: 1 })
    .withMessage("certificateId must be a positive integer"),
  body("studentName")
    .trim()
    .notEmpty()
    .withMessage("Student name is required")
    .isLength({ min: 2, max: 150 })
    .withMessage("Student name must be 2-150 characters"),
  body("moduleId")
    .isInt({ min: 1 })
    .withMessage("moduleId must be a positive integer"),
  body("ptcDate")
    .isISO8601()
    .withMessage("ptcDate must be a valid ISO 8601 date (YYYY-MM-DD)"),
];

// ─── Admin Routes ─────────────────────────────────────────────────────────

// POST /certificates/bulk-create - Create certificates in bulk
router.post(
  "/bulk-create",
  authMiddleware,
  requireAdmin,
  bulkCreateValidation,
  CertificateController.bulkCreate,
);

// GET /certificates - Get all certificates with filters
router.get("/", authMiddleware, requireAdmin, CertificateController.getAll);

// GET /certificates/stock - Get stock summary
router.get(
  "/stock",
  authMiddleware,
  requireAdmin,
  CertificateController.getStock,
);

// POST /certificates/migrate - Migrate certificates to sub branch
router.post(
  "/migrate",
  authMiddleware,
  requireAdmin,
  migrateValidation,
  CertificateController.migrate,
);

// GET /certificates/statistics - Get print statistics (Admin only)
router.get(
  "/statistics",
  authMiddleware,
  requireAdmin,
  CertificateLogController.getStatistics,
);

// GET /certificates/migrations - Get migration history (Admin only)
router.get(
  "/migrations",
  authMiddleware,
  requireAdmin,
  CertificateLogController.getMigrations,
);

// ─── Teacher Routes ───────────────────────────────────────────────────────

// GET /certificates/available - Get available certificates
router.get(
  "/available",
  authMiddleware,
  requireRole(["teacher"]),
  CertificateTeacherController.getAvailable,
);

// POST /certificates/reserve - Reserve certificate
router.post(
  "/reserve",
  authMiddleware,
  requireRole(["teacher"]),
  reserveValidation,
  CertificateTeacherController.reserve,
);

// POST /certificates/print - Print certificate
router.post(
  "/print",
  authMiddleware,
  requireRole(["teacher"]),
  printValidation,
  CertificateTeacherController.print,
);

// POST /certificates/:id/release - Release reservation
router.post(
  "/:id/release",
  authMiddleware,
  requireRole(["teacher"]),
  CertificateTeacherController.release,
);

// GET /certificates/my-prints - Get teacher's print history
router.get(
  "/my-prints",
  authMiddleware,
  requireRole(["teacher"]),
  CertificateTeacherController.getMyPrints,
);

// GET /certificates/my-reservations - Get teacher's active reservations
router.get(
  "/my-reservations",
  authMiddleware,
  requireRole(["teacher"]),
  CertificateTeacherController.getMyReservations,
);

// ─── Logs & Monitoring (Admin + Teacher) ─────────────────────────────────

// GET /certificates/logs - Get logs (role-based)
router.get(
  "/logs",
  authMiddleware,
  requireRole(["superAdmin", "admin", "teacher"]),
  CertificateLogController.getLogs,
);

// GET /certificates/logs/export - Export logs to Excel (role-based)
router.get(
  "/logs/export",
  authMiddleware,
  requireRole(["superAdmin", "admin", "teacher"]),
  CertificateLogController.exportLogs,
);

module.exports = router;
