const express = require("express");
const router = express.Router();
const { body } = require("express-validator");
const StudentController = require("../controller/studentController");
const authMiddleware = require("../middleware/authMiddleware");
const { requireAdmin, requireRole } = require("../middleware/roleMiddleware");

const updateStudentValidation = [
  body("name")
    .trim()
    .escape()
    .notEmpty()
    .withMessage("Student name is required")
    .isLength({ min: 2, max: 150 })
    .withMessage("Student name must be 2-150 characters"),
];

const migrateStudentValidation = [
  body("target_branch_id")
    .notEmpty()
    .withMessage("target_branch_id is required")
    .isInt({ min: 1 })
    .withMessage("target_branch_id must be a positive integer"),
];

router.use(authMiddleware);

router.get(
  "/search",
  requireRole(["superAdmin", "admin", "teacher"]),
  StudentController.search,
);

router.get(
  "/statistics",
  requireRole(["superAdmin", "admin", "teacher"]),
  StudentController.getStatistics,
);

router.get(
  "/",
  requireRole(["superAdmin", "admin", "teacher"]),
  StudentController.getAll,
);

router.get(
  "/:id",
  requireRole(["superAdmin", "admin", "teacher"]),
  StudentController.getById,
);

router.get(
  "/:id/history",
  requireRole(["superAdmin", "admin", "teacher"]),
  StudentController.getHistory,
);

router.put(
  "/:id",
  requireAdmin,
  updateStudentValidation,
  StudentController.update,
);

router.patch(
  "/:id/toggle-active",
  requireAdmin,
  StudentController.toggleActive,
);

router.post(
  "/:id/migrate",
  requireAdmin,
  migrateStudentValidation,
  StudentController.migrate,
);

module.exports = router;
