const express = require("express");
const router = express.Router();
const { body } = require("express-validator");
const ModuleController = require("../controller/moduleController");
const authMiddleware = require("../middleware/authMiddleware");
const { requireAdmin } = require("../middleware/roleMiddleware");

const createModuleValidation = [
  body("module_code")
    .trim()
    .escape()
    .notEmpty()
    .withMessage("Module code is required")
    .isLength({ min: 2, max: 50 })
    .withMessage("Module code must be 2–50 characters")
    .matches(/^[A-Za-z0-9\-_]+$/)
    .withMessage("Module code must be alphanumeric, dash, or underscore"),

  body("name")
    .trim()
    .escape()
    .notEmpty()
    .withMessage("Module name is required")
    .isLength({ min: 2, max: 150 })
    .withMessage("Module name must be 2–150 characters"),

  body("division_id")
    .notEmpty()
    .withMessage("division_id is required")
    .isInt({ min: 1 })
    .withMessage("division_id must be a positive integer"),

  body("sub_div_id")
    .optional({ nullable: true })
    .isInt({ min: 1 })
    .withMessage("sub_div_id must be a positive integer"),
];

const updateModuleValidation = [
  body("module_code")
    .optional()
    .trim()
    .escape()
    .isLength({ min: 2, max: 50 })
    .withMessage("Module code must be 2–50 characters")
    .matches(/^[A-Za-z0-9\-_]+$/)
    .withMessage("Module code must be alphanumeric, dash, or underscore"),

  body("name")
    .optional()
    .trim()
    .escape()
    .isLength({ min: 2, max: 150 })
    .withMessage("Module name must be 2–150 characters"),

  body("division_id")
    .optional()
    .isInt({ min: 1 })
    .withMessage("division_id must be a positive integer"),

  body("sub_div_id")
    .optional({ nullable: true })
    .isInt({ min: 1 })
    .withMessage("sub_div_id must be a positive integer"),
];

router.use(authMiddleware, requireAdmin);

router.get("/", ModuleController.getAll);
router.get("/:id", ModuleController.getById);
router.post("/", createModuleValidation, ModuleController.create);
router.put("/:id", updateModuleValidation, ModuleController.update);
router.patch("/:id/toggle-active", ModuleController.toggleActive);
router.delete("/:id", ModuleController.destroy);

module.exports = router;
