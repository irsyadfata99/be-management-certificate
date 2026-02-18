const express = require("express");
const router = express.Router();
const { body } = require("express-validator");
const TeacherProfileController = require("../controller/teacherProfileController");
const authMiddleware = require("../middleware/authMiddleware");
const { requireRole } = require("../middleware/roleMiddleware");

const updateProfileValidation = [
  body("full_name")
    .trim()
    .notEmpty()
    .withMessage("Full name is required")
    .isLength({ min: 2, max: 100 })
    .withMessage("Full name must be 2–100 characters"),
];

router.use(authMiddleware, requireRole(["teacher"]));

router.get("/me", TeacherProfileController.getMyProfile);

router.patch(
  "/me",
  updateProfileValidation,
  TeacherProfileController.updateMyProfile,
);

router.get("/branches", TeacherProfileController.getMyBranches);

router.get("/divisions", TeacherProfileController.getMyDivisions);

router.get("/modules", TeacherProfileController.getMyModules);

module.exports = router;
