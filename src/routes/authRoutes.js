const express = require("express");
const router = express.Router();
const AuthController = require("../controller/authController");
const authMiddleware = require("../middleware/authMiddleware");
const BruteForceProtection = require("../middleware/bruteForceMiddleware");
const { authLimiter, strictLimiter } = require("../middleware/rateLimitMiddleware");
const { body } = require("express-validator");

/**
 * Validation rules
 */
const loginValidation = [body("username").trim().notEmpty().withMessage("Username is required").isLength({ min: 3 }).withMessage("Username must be at least 3 characters"), body("password").notEmpty().withMessage("Password is required")];

const changeUsernameValidation = [
  body("newUsername").trim().notEmpty().withMessage("New username is required").isLength({ min: 3 }).withMessage("New username must be at least 3 characters").isLength({ max: 50 }).withMessage("New username must not exceed 50 characters"),
  body("currentPassword").notEmpty().withMessage("Current password is required"),
];

const changePasswordValidation = [
  body("currentPassword").notEmpty().withMessage("Current password is required"),
  body("newPassword")
    .notEmpty()
    .withMessage("New password is required")
    .isLength({ min: 8 })
    .withMessage("New password must be at least 8 characters")
    .matches(/[A-Z]/)
    .withMessage("New password must contain at least one uppercase letter")
    .matches(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/)
    .withMessage("New password must contain at least one special character"),
];

const refreshTokenValidation = [body("refreshToken").notEmpty().withMessage("Refresh token is required")];

/**
 * Routes
 */

// POST /auth/login - Login user (with brute force protection)
router.post("/login", authLimiter, BruteForceProtection.checkBlocked, loginValidation, AuthController.login);

// POST /auth/logout - Logout user (requires authentication)
router.post("/logout", authMiddleware, AuthController.logout);

// GET /auth/me - Get current user profile (requires authentication)
router.get("/me", authMiddleware, AuthController.getMe);

// PATCH /auth/change-username - Change username (requires authentication)
router.patch("/change-username", authMiddleware, strictLimiter, changeUsernameValidation, AuthController.changeUsername);

// PATCH /auth/change-password - Change password (requires authentication)
router.patch("/change-password", authMiddleware, strictLimiter, changePasswordValidation, AuthController.changePassword);

// POST /auth/refresh - Refresh access token
router.post("/refresh", authLimiter, refreshTokenValidation, AuthController.refreshToken);

module.exports = router;
