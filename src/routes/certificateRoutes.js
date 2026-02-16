/**
 * Certificate Routes
 * File: certificateRoutes.js  ← nama ini harus cocok dengan require('./certificateRoutes') di index.js
 *
 * FIX — Route ordering:
 *   Express evaluasi route dari ATAS ke BAWAH.
 *   Route dinamis /:id bersifat wildcard — HARUS didaftarkan PALING AKHIR.
 *
 *   Urutan aman:
 *     1. Static routes tanpa parameter  ← semua ini dulu
 *     2. GET "/"                        ← setelah semua static
 *     3. Dynamic /:id/...              ← PALING AKHIR
 *
 *   Contoh masalah jika urutan salah:
 *     GET /certificates/branches → tertangkap /:id/release jika /:id duluan
 *     → Express anggap "branches" sebagai :id → handler salah → 404/500
 */

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
    .escape()
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

// =========================================================================
// [1] STATIC ROUTES — Admin
// Semua route tanpa parameter dinamis HARUS di atas /:id
// =========================================================================

// GET /certificates/branches — dropdown branches untuk Admin
router.get("/branches", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const BranchModel = require("../models/branchModel");

    const userBranchId = req.user.branch_id;

    if (!userBranchId) {
      return res.status(400).json({
        success: false,
        message: "User branch not found",
      });
    }

    // FIX: getById → findById
    const userBranch = await BranchModel.findById(userBranchId);

    if (!userBranch) {
      return res.status(404).json({
        success: false,
        message: "Branch not found",
      });
    }

    const headBranchId = userBranch.is_head_branch
      ? userBranch.id
      : userBranch.parent_id;

    // FIX: getById → findById
    const headBranch = await BranchModel.findById(headBranchId);

    if (!headBranch) {
      return res.status(404).json({
        success: false,
        message: "Head branch not found",
      });
    }

    // FIX: getSubBranches(id, true) → findSubBranches(id, { includeInactive: false })
    const subBranches = await BranchModel.findSubBranches(headBranchId, {
      includeInactive: false,
    });

    const branches = [
      {
        id: headBranch.id,
        code: headBranch.code,
        name: headBranch.name,
        is_head_branch: headBranch.is_head_branch,
        is_active: headBranch.is_active,
      },
      ...subBranches.map((branch) => ({
        id: branch.id,
        code: branch.code,
        name: branch.name,
        is_head_branch: branch.is_head_branch,
        is_active: branch.is_active,
      })),
    ];

    return res.json({ success: true, branches });
  } catch (error) {
    console.error("[Certificate Branches] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch branches",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

// POST /certificates/bulk-create
router.post(
  "/bulk-create",
  authMiddleware,
  requireAdmin,
  bulkCreateValidation,
  CertificateController.bulkCreate,
);

// GET /certificates/stock
router.get(
  "/stock",
  authMiddleware,
  requireAdmin,
  CertificateController.getStock,
);

// GET /certificates/stock-alerts
router.get(
  "/stock-alerts",
  authMiddleware,
  requireAdmin,
  CertificateController.getStockAlerts,
);

// POST /certificates/migrate
router.post(
  "/migrate",
  authMiddleware,
  requireAdmin,
  migrateValidation,
  CertificateController.migrate,
);

// GET /certificates/statistics
router.get(
  "/statistics",
  authMiddleware,
  requireAdmin,
  CertificateLogController.getStatistics,
);

// GET /certificates/migrations
router.get(
  "/migrations",
  authMiddleware,
  requireAdmin,
  CertificateLogController.getMigrations,
);

// =========================================================================
// [2] STATIC ROUTES — Teacher
// =========================================================================

// GET /certificates/available
router.get(
  "/available",
  authMiddleware,
  requireRole(["teacher"]),
  CertificateTeacherController.getAvailable,
);

// POST /certificates/reserve
router.post(
  "/reserve",
  authMiddleware,
  requireRole(["teacher"]),
  reserveValidation,
  CertificateTeacherController.reserve,
);

// POST /certificates/print
router.post(
  "/print",
  authMiddleware,
  requireRole(["teacher"]),
  printValidation,
  CertificateTeacherController.print,
);

// GET /certificates/my-reservations
router.get(
  "/my-reservations",
  authMiddleware,
  requireRole(["teacher"]),
  CertificateTeacherController.getMyReservations,
);

// GET /certificates/my-prints
router.get(
  "/my-prints",
  authMiddleware,
  requireRole(["teacher"]),
  CertificateTeacherController.getMyPrints,
);

// =========================================================================
// [3] STATIC ROUTES — Logs
// /logs/export HARUS sebelum /logs agar tidak di-intercept
// =========================================================================

// GET /certificates/logs/export  ← HARUS sebelum /logs
router.get(
  "/logs/export",
  authMiddleware,
  requireRole(["superAdmin", "admin", "teacher"]),
  CertificateLogController.exportLogs,
);

// GET /certificates/logs
router.get(
  "/logs",
  authMiddleware,
  requireRole(["superAdmin", "admin", "teacher"]),
  CertificateLogController.getLogs,
);

// =========================================================================
// [4] GET "/" — getAll (Admin)
// Setelah semua static routes, sebelum dynamic /:id
// =========================================================================

// GET /certificates
router.get("/", authMiddleware, requireAdmin, CertificateController.getAll);

// =========================================================================
// [5] DYNAMIC ROUTES — /:id  (SELALU PALING AKHIR)
// Wildcard — akan match apapun yang belum di-handle di atas
// =========================================================================

// POST /certificates/:id/release
router.post(
  "/:id/release",
  authMiddleware,
  requireRole(["teacher"]),
  CertificateTeacherController.release,
);

module.exports = router;
