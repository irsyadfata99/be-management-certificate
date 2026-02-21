const express = require("express");
const router = express.Router();
const { body } = require("express-validator");
const CertificateController = require("../controller/certificateController");
const CertificateTeacherController = require("../controller/certificateTeacherController");
const CertificateLogController = require("../controller/certificateLogController");
const authMiddleware = require("../middleware/authMiddleware");
const { requireAdmin, requireRole } = require("../middleware/roleMiddleware");

// ─── Validation Rules ─────────────────────────────────────────────────────

const bulkCreateValidation = [body("startNumber").isInt({ min: 1 }).withMessage("startNumber must be a positive integer"), body("endNumber").isInt({ min: 1 }).withMessage("endNumber must be a positive integer")];

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
  body("toBranchId").isInt({ min: 1 }).withMessage("toBranchId must be a positive integer"),
];

const reserveValidation = [body("branchId").isInt({ min: 1 }).withMessage("branchId must be a positive integer")];

const printValidation = [
  body("certificateId").isInt({ min: 1 }).withMessage("certificateId must be a positive integer"),
  body("studentName").trim().escape().notEmpty().withMessage("Student name is required").isLength({ min: 2, max: 150 }).withMessage("Student name must be 2-150 characters"),
  body("moduleId").isInt({ min: 1 }).withMessage("moduleId must be a positive integer"),
  body("ptcDate").isISO8601().withMessage("ptcDate must be a valid ISO 8601 date (YYYY-MM-DD)"),
];

const reprintValidation = [
  body("studentName").trim().escape().notEmpty().withMessage("Student name is required").isLength({ min: 2, max: 150 }).withMessage("Student name must be 2-150 characters"),
  body("moduleId").isInt({ min: 1 }).withMessage("moduleId must be a positive integer"),
  body("ptcDate").isISO8601().withMessage("ptcDate must be a valid ISO 8601 date (YYYY-MM-DD)"),
];

// ─── Routes ───────────────────────────────────────────────────────────────

router.get("/branches", authMiddleware, requireAdmin, CertificateController.getBranches);

router.post("/bulk-create", authMiddleware, requireAdmin, bulkCreateValidation, CertificateController.bulkCreate);

router.get("/stock", authMiddleware, requireAdmin, CertificateController.getStock);

router.get("/stock-alerts", authMiddleware, requireAdmin, CertificateController.getStockAlerts);

router.post("/migrate", authMiddleware, requireAdmin, migrateValidation, CertificateController.migrate);

router.get("/statistics", authMiddleware, requireAdmin, CertificateLogController.getStatistics);

router.get("/migrations", authMiddleware, requireAdmin, CertificateLogController.getMigrations);

router.get("/available", authMiddleware, requireRole(["teacher"]), CertificateTeacherController.getAvailable);

router.post("/reserve", authMiddleware, requireRole(["teacher"]), reserveValidation, CertificateTeacherController.reserve);

router.post("/print", authMiddleware, requireRole(["teacher"]), printValidation, CertificateTeacherController.print);

router.get("/my-reservations", authMiddleware, requireRole(["teacher"]), CertificateTeacherController.getMyReservations);

router.get("/my-prints", authMiddleware, requireRole(["teacher"]), CertificateTeacherController.getMyPrints);

router.get("/logs/export", authMiddleware, requireRole(["superAdmin", "admin", "teacher"]), CertificateLogController.exportLogs);

router.get("/logs", authMiddleware, requireRole(["superAdmin", "admin", "teacher"]), CertificateLogController.getLogs);

router.get("/", authMiddleware, requireAdmin, CertificateController.getAll);

router.post("/:id/reprint", authMiddleware, requireRole(["teacher"]), reprintValidation, CertificateTeacherController.reprint);

router.post("/:id/release", authMiddleware, requireRole(["teacher"]), CertificateTeacherController.release);

module.exports = router;
