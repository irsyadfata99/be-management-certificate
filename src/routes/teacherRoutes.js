const express = require("express");
const router = express.Router();
const { body } = require("express-validator");
const TeacherController = require("../controller/teacherController");
const authMiddleware = require("../middleware/authMiddleware");
const { requireAdmin } = require("../middleware/roleMiddleware");

/**
 * Validation rules
 */
const createTeacherValidation = [
  body("username")
    .trim()
    .escape()
    .notEmpty()
    .withMessage("Username is required")
    .isLength({ min: 3, max: 50 })
    .withMessage("Username must be 3–50 characters")
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage("Username must be alphanumeric or underscore"),

  body("full_name").trim().escape().notEmpty().withMessage("Full name is required").isLength({ min: 2, max: 100 }).withMessage("Full name must be 2–100 characters"),

  body("branch_ids").isArray({ min: 1 }).withMessage("At least one branch_id is required"),
  body("branch_ids.*").isInt({ min: 1 }).withMessage("Each branch_id must be a positive integer"),

  body("division_ids").isArray({ min: 1 }).withMessage("At least one division_id is required"),
  body("division_ids.*").isInt({ min: 1 }).withMessage("Each division_id must be a positive integer"),
];

const updateTeacherValidation = [
  body("username")
    .optional()
    .trim()
    .escape()
    .isLength({ min: 3, max: 50 })
    .withMessage("Username must be 3–50 characters")
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage("Username must be alphanumeric or underscore"),

  body("full_name").optional().trim().escape().isLength({ min: 2, max: 100 }).withMessage("Full name must be 2–100 characters"),

  body("branch_ids").optional().isArray({ min: 1 }).withMessage("branch_ids must be a non-empty array"),
  body("branch_ids.*").optional().isInt({ min: 1 }).withMessage("Each branch_id must be a positive integer"),

  body("division_ids").optional().isArray({ min: 1 }).withMessage("division_ids must be a non-empty array"),
  body("division_ids.*").optional().isInt({ min: 1 }).withMessage("Each division_id must be a positive integer"),
];

const migrateTeacherValidation = [body("target_branch_id").notEmpty().withMessage("target_branch_id is required").isInt({ min: 1 }).withMessage("target_branch_id must be a positive integer")];

/**
 * All routes require authentication + admin/superAdmin
 */
router.use(authMiddleware, requireAdmin);

router.get("/", TeacherController.getAll);
router.get("/:id", TeacherController.getById);
router.post("/", createTeacherValidation, TeacherController.create);
router.put("/:id", updateTeacherValidation, TeacherController.update);
router.post("/:id/reset-password", TeacherController.resetPassword);
router.patch("/:id/toggle-active", TeacherController.toggleActive);
router.post("/:id/migrate", migrateTeacherValidation, TeacherController.migrate);

module.exports = router;
