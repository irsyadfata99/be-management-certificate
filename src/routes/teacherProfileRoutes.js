const express = require("express");
const router = express.Router();
const { body } = require("express-validator");
const TeacherProfileController = require("../controller/teacherProfileController");
const authMiddleware = require("../middleware/authMiddleware");
const { requireRole } = require("../middleware/roleMiddleware");

/**
 * Validation rules
 */
const updateProfileValidation = [body("full_name").trim().notEmpty().withMessage("Full name is required").isLength({ min: 2, max: 100 }).withMessage("Full name must be 2–100 characters")];

/**
 * All routes require teacher authentication
 */
router.use(authMiddleware, requireRole(["teacher"]));

// GET /teachers/profile/me - Get own profile
router.get("/me", TeacherProfileController.getMyProfile);

// PATCH /teachers/profile/me - Update own profile (full_name only)
router.patch("/me", updateProfileValidation, TeacherProfileController.updateMyProfile);

// GET /teachers/profile/branches - Get assigned branches
router.get("/branches", TeacherProfileController.getMyBranches);

// GET /teachers/profile/divisions - Get assigned divisions
router.get("/divisions", TeacherProfileController.getMyDivisions);

// GET /teachers/profile/modules - Get accessible modules
router.get("/modules", TeacherProfileController.getMyModules);

module.exports = router;
