const express = require("express");
const router = express.Router();
const { body } = require("express-validator");
const StudentController = require("../controller/studentController");
const authMiddleware = require("../middleware/authMiddleware");
const { requireAdmin, requireRole } = require("../middleware/roleMiddleware");

/**
 * Validation rules
 */
const updateStudentValidation = [body("name").trim().escape().notEmpty().withMessage("Student name is required").isLength({ min: 2, max: 150 }).withMessage("Student name must be 2-150 characters")];

const migrateStudentValidation = [body("target_branch_id").notEmpty().withMessage("target_branch_id is required").isInt({ min: 1 }).withMessage("target_branch_id must be a positive integer")];

/**
 * All routes require authentication
 */
router.use(authMiddleware);

// Search students (autocomplete) - Teacher & Admin
router.get("/search", requireRole(["superAdmin", "admin", "teacher"]), StudentController.search);

// Get student statistics - Teacher & Admin
router.get("/statistics", requireRole(["superAdmin", "admin", "teacher"]), StudentController.getStatistics);

// Get all students - Teacher & Admin
router.get("/", requireRole(["superAdmin", "admin", "teacher"]), StudentController.getAll);

// Get student by ID - Teacher & Admin
router.get("/:id", requireRole(["superAdmin", "admin", "teacher"]), StudentController.getById);

// Get student history - Teacher & Admin
router.get("/:id/history", requireRole(["superAdmin", "admin", "teacher"]), StudentController.getHistory);

// Update student name - Admin only
router.put("/:id", requireAdmin, updateStudentValidation, StudentController.update);

// Toggle student active - Admin only
router.patch("/:id/toggle-active", requireAdmin, StudentController.toggleActive);

// Migrate student to another sub-branch - Admin only
router.post("/:id/migrate", requireAdmin, migrateStudentValidation, StudentController.migrate);

module.exports = router;
