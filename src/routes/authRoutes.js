const express = require("express");
const router = express.Router();
const AuthController = require("../controller/authController");
const authMiddleware = require("../middleware/authMiddleware");
const BruteForceProtection = require("../middleware/bruteForceMiddleware");
const {
  authLimiter,
  strictLimiter,
} = require("../middleware/rateLimitMiddleware");
const { body } = require("express-validator");

const loginValidation = [
  body("username")
    .trim()
    .escape()
    .notEmpty()
    .withMessage("Username is required")
    .isLength({ min: 3 })
    .withMessage("Username must be at least 3 characters"),
  body("password").notEmpty().withMessage("Password is required"),
];

const changeUsernameValidation = [
  body("newUsername")
    .trim()
    .escape()
    .notEmpty()
    .withMessage("New username is required")
    .isLength({ min: 3 })
    .withMessage("New username must be at least 3 characters")
    .isLength({ max: 50 })
    .withMessage("New username must not exceed 50 characters"),
  body("currentPassword")
    .notEmpty()
    .withMessage("Current password is required"),
];

const changePasswordValidation = [
  body("currentPassword")
    .notEmpty()
    .withMessage("Current password is required"),
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

const refreshTokenValidation = [
  body("refreshToken")
    .trim()
    .notEmpty()
    .withMessage("Refresh token is required"),
];

router.post(
  "/login",
  authLimiter,
  BruteForceProtection.checkBlocked,
  loginValidation,
  AuthController.login,
);

router.post("/logout", authMiddleware, AuthController.logout);

router.get("/me", authMiddleware, AuthController.getMe);

router.patch(
  "/change-username",
  authMiddleware,
  strictLimiter,
  changeUsernameValidation,
  AuthController.changeUsername,
);

router.patch(
  "/change-password",
  authMiddleware,
  strictLimiter,
  changePasswordValidation,
  AuthController.changePassword,
);

router.post(
  "/refresh",
  authLimiter,
  refreshTokenValidation,
  AuthController.refreshToken,
);

module.exports = router;
