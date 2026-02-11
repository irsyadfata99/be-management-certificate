const express = require("express");
const router = express.Router();
const { body } = require("express-validator");
const BranchController = require("../controller/branchController");
const authMiddleware = require("../middleware/authMiddleware");
const { requireSuperAdmin } = require("../middleware/roleMiddleware");

/**
 * Helper function untuk conditional validation
 * Handles boolean, string, and number representations
 */
const isHeadBranchCondition = (value, { req }) => {
  const isHeadBranch = req.body.is_head_branch;
  return isHeadBranch === true || isHeadBranch === "true" || isHeadBranch === 1;
};

const isNotHeadBranchCondition = (value, { req }) => {
  const isHeadBranch = req.body.is_head_branch;
  return (
    isHeadBranch === false || isHeadBranch === "false" || isHeadBranch === 0
  );
};

/**
 * Validation rules
 */
const createBranchValidation = [
  body("code")
    .trim()
    .notEmpty()
    .withMessage("Branch code is required")
    .isLength({ min: 2, max: 10 })
    .withMessage("Code must be 2–10 characters")
    .matches(/^[A-Za-z0-9]+$/)
    .withMessage("Code must be alphanumeric only"),

  body("name")
    .trim()
    .notEmpty()
    .withMessage("Branch name is required")
    .isLength({ min: 2, max: 100 })
    .withMessage("Name must be 2–100 characters"),

  body("is_head_branch")
    .isBoolean()
    .withMessage("is_head_branch must be a boolean"),

  body("parent_id")
    .optional({ nullable: true })
    .isInt({ min: 1 })
    .withMessage("parent_id must be a positive integer"),

  body("admin_username")
    .if(isHeadBranchCondition)
    .trim()
    .notEmpty()
    .withMessage("admin_username is required for head branch")
    .isLength({ min: 3, max: 50 })
    .withMessage("admin_username must be 3–50 characters")
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage("admin_username must be alphanumeric or underscore"),
];

const updateBranchValidation = [
  body("code")
    .optional()
    .trim()
    .isLength({ min: 2, max: 10 })
    .withMessage("Code must be 2–10 characters")
    .matches(/^[A-Za-z0-9]+$/)
    .withMessage("Code must be alphanumeric only"),

  body("name")
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("Name must be 2–100 characters"),

  body("parent_id")
    .optional({ nullable: true })
    .isInt({ min: 1 })
    .withMessage("parent_id must be a positive integer"),
];

const toggleHeadValidation = [
  body("is_head_branch")
    .isBoolean()
    .withMessage("is_head_branch must be a boolean"),

  body("parent_id")
    .if(isNotHeadBranchCondition)
    .notEmpty()
    .withMessage("parent_id is required when converting to sub branch")
    .isInt({ min: 1 })
    .withMessage("parent_id must be a positive integer"),

  body("admin_username")
    .if(isHeadBranchCondition)
    .trim()
    .notEmpty()
    .withMessage("admin_username is required when promoting to head branch")
    .isLength({ min: 3, max: 50 })
    .withMessage("admin_username must be 3–50 characters")
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage("admin_username must be alphanumeric or underscore"),
];

/**
 * All branch routes require authentication + superAdmin role
 */
router.use(authMiddleware, requireSuperAdmin);

// GET /branches           - get all branches (tree)
router.get("/", BranchController.getAll);

// GET /branches/heads     - get head branches only (dropdown)
router.get("/heads", BranchController.getHeads);

// GET /branches/:id       - get single branch
router.get("/:id", BranchController.getById);

// POST /branches          - create branch
router.post("/", createBranchValidation, BranchController.create);

// PUT /branches/:id       - update branch
router.put("/:id", updateBranchValidation, BranchController.update);

// PATCH /branches/:id/toggle-active - activate / deactivate
router.patch("/:id/toggle-active", BranchController.toggleActive);

// PATCH /branches/:id/toggle-head   - promote to head / demote to sub
router.patch(
  "/:id/toggle-head",
  toggleHeadValidation,
  BranchController.toggleHead,
);

module.exports = router;
