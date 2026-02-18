const express = require("express");
const router = express.Router();
const { body } = require("express-validator");
const BranchController = require("../controller/branchController");
const authMiddleware = require("../middleware/authMiddleware");
const { requireSuperAdmin } = require("../middleware/roleMiddleware");

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

const createBranchValidation = [
  body("code")
    .trim()
    .escape()
    .notEmpty()
    .withMessage("Branch code is required")
    .isLength({ min: 2, max: 10 })
    .withMessage("Code must be 2–10 characters")
    .matches(/^[A-Za-z0-9]+$/)
    .withMessage("Code must be alphanumeric only"),

  body("name")
    .trim()
    .escape()
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
    .escape()
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
    .escape()
    .isLength({ min: 2, max: 10 })
    .withMessage("Code must be 2–10 characters")
    .matches(/^[A-Za-z0-9]+$/)
    .withMessage("Code must be alphanumeric only"),

  body("name")
    .optional()
    .trim()
    .escape()
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
    .escape()
    .notEmpty()
    .withMessage("admin_username is required when promoting to head branch")
    .isLength({ min: 3, max: 50 })
    .withMessage("admin_username must be 3–50 characters")
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage("admin_username must be alphanumeric or underscore"),
];

router.use(authMiddleware, requireSuperAdmin);

router.get("/", BranchController.getAll);

router.get("/heads", BranchController.getHeads);

router.get("/:id", BranchController.getById);

router.post("/", createBranchValidation, BranchController.create);

router.put("/:id", updateBranchValidation, BranchController.update);

router.delete("/:id", BranchController.delete);

router.patch("/:id/toggle-active", BranchController.toggleActive);

router.patch(
  "/:id/toggle-head",
  toggleHeadValidation,
  BranchController.toggleHead,
);

router.post("/:id/reset-admin-password", BranchController.resetAdminPassword);

module.exports = router;
