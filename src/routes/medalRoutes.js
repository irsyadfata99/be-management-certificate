const express = require("express");
const router = express.Router();
const MedalController = require("../controllers/medalController");
const { authenticate, authorize } = require("../middleware/auth");

// Semua endpoint medal hanya untuk admin head branch
router.use(authenticate);
router.use(authorize("admin"));

/**
 * @route   GET /api/medals/stock
 * @desc    Ringkasan medal stock semua branch
 * @access  Admin (head branch)
 */
router.get("/stock", MedalController.getStock);

/**
 * @route   POST /api/medals/add
 * @desc    Tambah medal stock ke head branch
 * @access  Admin (head branch)
 * @body    { quantity: number }
 */
router.post("/add", MedalController.addStock);

/**
 * @route   POST /api/medals/migrate
 * @desc    Transfer medal dari head branch ke sub branch
 * @access  Admin (head branch)
 * @body    { to_branch_id: number, quantity: number }
 */
router.post("/migrate", MedalController.migrateStock);

/**
 * @route   GET /api/medals/logs
 * @desc    Riwayat aktivitas medal stock
 * @access  Admin (head branch)
 * @query   action_type, start_date, end_date, page, limit
 */
router.get("/logs", MedalController.getLogs);

/**
 * @route   GET /api/medals/alerts
 * @desc    Daftar branch dengan medal stock rendah
 * @access  Admin (head branch)
 * @query   threshold (default: 10)
 */
router.get("/alerts", MedalController.getAlerts);

module.exports = router;
