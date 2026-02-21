const express = require("express");
const router = express.Router();
const { body, query } = require("express-validator");
const MedalController = require("../controller/medalController");
const authMiddleware = require("../middleware/authMiddleware");
const { requireAdmin } = require("../middleware/roleMiddleware");

router.use(authMiddleware);
router.use(requireAdmin);

// ─── Validation Rules ──────────────────────────────────────────────────────

const addStockValidation = [body("quantity").isInt({ min: 1 }).withMessage("quantity must be a positive integer")];

const migrateStockValidation = [body("to_branch_id").isInt({ min: 1 }).withMessage("to_branch_id must be a positive integer"), body("quantity").isInt({ min: 1 }).withMessage("quantity must be a positive integer")];

const logsValidation = [
  query("action_type").optional().isIn(["add", "migrate_in", "migrate_out", "consume"]).withMessage("Invalid action_type. Must be one of: add, migrate_in, migrate_out, consume"),
  query("page").optional().isInt({ min: 1 }).withMessage("page must be a positive integer"),
  query("limit").optional().isInt({ min: 1, max: 100 }).withMessage("limit must be between 1 and 100"),
];

const alertsValidation = [query("threshold").optional().isInt({ min: 1, max: 1000 }).withMessage("threshold must be a number between 1 and 1000")];

// ─── Routes ────────────────────────────────────────────────────────────────

router.get("/stock", MedalController.getStock);

router.post("/add", addStockValidation, MedalController.addStock);

router.post("/migrate", migrateStockValidation, MedalController.migrateStock);

router.get("/logs", logsValidation, MedalController.getLogs);

router.get("/alerts", alertsValidation, MedalController.getAlerts);

module.exports = router;
