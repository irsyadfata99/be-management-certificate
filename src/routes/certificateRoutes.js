const express = require("express");
const router = express.Router();
const { body } = require("express-validator");
const CertificateController = require("../controller/certificateController");
const CertificateTeacherController = require("../controller/certificateTeacherController");
const CertificateLogController = require("../controller/certificateLogController");
const BranchModel = require("../models/branchModel");
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
  body("startNumber").custom((value) => {
    if (Number.isInteger(value) && value > 0) return true;
    if (typeof value === "string" && /^No\.\s\d+$/.test(value)) return true;
    throw new Error('startNumber must be a positive integer or "No. XXXXXX"');
  }),
  body("endNumber").custom((value) => {
    if (Number.isInteger(value) && value > 0) return true;
    if (typeof value === "string" && /^No\.\s\d+$/.test(value)) return true;
    throw new Error('endNumber must be a positive integer or "No. XXXXXX"');
  }),
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

router.get("/branches", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const userBranchId = req.user.branch_id;

    if (!userBranchId) {
      return res.status(400).json({
        success: false,
        message: "User branch not found",
      });
    }

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

    const headBranch = await BranchModel.findById(headBranchId);

    if (!headBranch) {
      return res.status(404).json({
        success: false,
        message: "Head branch not found",
      });
    }
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

router.post(
  "/bulk-create",
  authMiddleware,
  requireAdmin,
  bulkCreateValidation,
  CertificateController.bulkCreate,
);

router.get(
  "/stock",
  authMiddleware,
  requireAdmin,
  CertificateController.getStock,
);

router.get(
  "/stock-alerts",
  authMiddleware,
  requireAdmin,
  CertificateController.getStockAlerts,
);

router.post(
  "/migrate",
  authMiddleware,
  requireAdmin,
  migrateValidation,
  CertificateController.migrate,
);

router.get(
  "/statistics",
  authMiddleware,
  requireAdmin,
  CertificateLogController.getStatistics,
);

router.get(
  "/migrations",
  authMiddleware,
  requireAdmin,
  CertificateLogController.getMigrations,
);

router.get(
  "/available",
  authMiddleware,
  requireRole(["teacher"]),
  CertificateTeacherController.getAvailable,
);

router.post(
  "/reserve",
  authMiddleware,
  requireRole(["teacher"]),
  reserveValidation,
  CertificateTeacherController.reserve,
);

router.post(
  "/print",
  authMiddleware,
  requireRole(["teacher"]),
  printValidation,
  CertificateTeacherController.print,
);

router.get(
  "/my-reservations",
  authMiddleware,
  requireRole(["teacher"]),
  CertificateTeacherController.getMyReservations,
);

router.get(
  "/my-prints",
  authMiddleware,
  requireRole(["teacher"]),
  CertificateTeacherController.getMyPrints,
);

router.get(
  "/logs/export",
  authMiddleware,
  requireRole(["superAdmin", "admin", "teacher"]),
  CertificateLogController.exportLogs,
);

router.get(
  "/logs",
  authMiddleware,
  requireRole(["superAdmin", "admin", "teacher"]),
  CertificateLogController.getLogs,
);

router.get("/", authMiddleware, requireAdmin, CertificateController.getAll);

router.post(
  "/:id/release",
  authMiddleware,
  requireRole(["teacher"]),
  CertificateTeacherController.release,
);

module.exports = router;
