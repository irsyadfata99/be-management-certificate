const express = require("express");
const router = express.Router();
const { body } = require("express-validator");
const DivisionController = require("../controller/divisionController");
const authMiddleware = require("../middleware/authMiddleware");
const { requireAdmin } = require("../middleware/roleMiddleware");

const divisionValidation = [
  body("name")
    .trim()
    .escape()
    .notEmpty()
    .withMessage("Division name is required")
    .isLength({ min: 2, max: 100 })
    .withMessage("Name must be 2–100 characters"),
];

const createDivisionValidation = [
  body("name")
    .trim()
    .escape()
    .notEmpty()
    .withMessage("Division name is required")
    .isLength({ min: 2, max: 100 })
    .withMessage("Name must be 2–100 characters"),

  body("sub_divisions")
    .optional()
    .isArray()
    .withMessage("sub_divisions must be an array"),

  body("sub_divisions.*.name")
    .if(body("sub_divisions").exists())
    .trim()
    .escape()
    .notEmpty()
    .withMessage("Sub division name is required")
    .isLength({ min: 2, max: 100 })
    .withMessage("Sub division name must be 2–100 characters"),

  body("sub_divisions.*.age_min")
    .if(body("sub_divisions").exists())
    .isInt({ min: 0 })
    .withMessage("age_min must be a non-negative integer"),

  body("sub_divisions.*.age_max")
    .if(body("sub_divisions").exists())
    .isInt({ min: 1 })
    .withMessage("age_max must be a positive integer"),
];

const subDivisionValidation = [
  body("name")
    .trim()
    .escape()
    .notEmpty()
    .withMessage("Sub division name is required")
    .isLength({ min: 2, max: 100 })
    .withMessage("Name must be 2–100 characters"),
  body("age_min")
    .isInt({ min: 0 })
    .withMessage("age_min must be a non-negative integer"),
  body("age_max")
    .isInt({ min: 1 })
    .withMessage("age_max must be a positive integer"),
];

const updateSubDivisionValidation = [
  body("name")
    .optional()
    .trim()
    .escape()
    .isLength({ min: 2, max: 100 })
    .withMessage("Name must be 2–100 characters"),
  body("age_min")
    .optional()
    .isInt({ min: 0 })
    .withMessage("age_min must be a non-negative integer"),
  body("age_max")
    .optional()
    .isInt({ min: 1 })
    .withMessage("age_max must be a positive integer"),
];

router.use(authMiddleware, requireAdmin);

router.get("/", DivisionController.getAll);
router.get("/:id", DivisionController.getById);
router.post("/", createDivisionValidation, DivisionController.create);
router.put("/:id", divisionValidation, DivisionController.update);
router.patch("/:id/toggle-active", DivisionController.toggleActive);
router.delete("/:id", DivisionController.destroy);

router.post(
  "/:id/sub-divisions",
  subDivisionValidation,
  DivisionController.createSub,
);
router.put(
  "/sub-divisions/:subId",
  updateSubDivisionValidation,
  DivisionController.updateSub,
);
router.patch(
  "/sub-divisions/:subId/toggle-active",
  DivisionController.toggleSubActive,
);
router.delete("/sub-divisions/:subId", DivisionController.destroySub);

module.exports = router;
