const AuthService = require("../services/authService");
const ResponseHelper = require("../utils/responseHelper");
const { validationResult } = require("express-validator");
const logger = require("../utils/logger");

class AuthController {
  static async login(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return ResponseHelper.validationError(res, errors.array());
      }

      const { username, password } = req.body;

      const result = await AuthService.login(username, password);

      return ResponseHelper.success(res, 200, "Login successful", result);
    } catch (error) {
      if (error.message === "Invalid credentials") {
        return ResponseHelper.error(res, 401, "Invalid username or password");
      }
      next(error);
    }
  }

  static async logout(req, res, next) {
    try {
      const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;

      if (refreshToken) {
        try {
          await AuthService.logout(refreshToken);
        } catch (e) {
          logger.warn("Could not revoke refresh token during logout", {
            error: e.message,
          });
        }
      }

      res.clearCookie("refreshToken");

      return ResponseHelper.success(res, 200, "Logout successful");
    } catch (error) {
      next(error);
    }
  }

  static async getMe(req, res, next) {
    try {
      const userId = req.user.userId;

      const user = await AuthService.getProfile(userId);

      return ResponseHelper.success(
        res,
        200,
        "Profile retrieved successfully",
        user,
      );
    } catch (error) {
      if (error.message === "User not found") {
        return ResponseHelper.notFound(res, "User not found");
      }
      next(error);
    }
  }

  static async changeUsername(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return ResponseHelper.validationError(res, errors.array());
      }

      const userId = req.user.userId;
      const { newUsername, currentPassword } = req.body;

      const user = await AuthService.changeUsername(
        userId,
        newUsername,
        currentPassword,
      );

      return ResponseHelper.success(
        res,
        200,
        "Username changed successfully",
        user,
      );
    } catch (error) {
      if (error.message === "Invalid password") {
        return ResponseHelper.error(res, 401, "Current password is incorrect");
      }
      if (error.message === "Username already exists") {
        return ResponseHelper.error(res, 409, "Username already exists");
      }
      if (error.message === "User not found") {
        return ResponseHelper.notFound(res, "User not found");
      }
      next(error);
    }
  }

  static async changePassword(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return ResponseHelper.validationError(res, errors.array());
      }

      const userId = req.user.userId;
      const { currentPassword, newPassword } = req.body;

      const user = await AuthService.changePassword(
        userId,
        currentPassword,
        newPassword,
      );

      return ResponseHelper.success(
        res,
        200,
        "Password changed successfully",
        user,
      );
    } catch (error) {
      if (error.message === "Password does not meet requirements") {
        return ResponseHelper.error(res, 400, error.message, {
          requirements: error.details,
        });
      }
      if (error.message === "Current password is incorrect") {
        return ResponseHelper.error(res, 401, "Current password is incorrect");
      }
      if (
        error.message === "New password must be different from current password"
      ) {
        return ResponseHelper.error(
          res,
          400,
          "New password must be different from current password",
        );
      }
      if (error.message === "User not found") {
        return ResponseHelper.notFound(res, "User not found");
      }
      next(error);
    }
  }

  static async refreshToken(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return ResponseHelper.validationError(res, errors.array());
      }

      const { refreshToken } = req.body;

      const result = await AuthService.refreshToken(refreshToken);

      return ResponseHelper.success(
        res,
        200,
        "Token refreshed successfully",
        result,
      );
    } catch (error) {
      if (error.name === "TokenExpiredError") {
        return ResponseHelper.error(res, 401, "Refresh token has expired");
      }
      if (error.name === "JsonWebTokenError") {
        return ResponseHelper.error(res, 401, "Invalid refresh token");
      }
      if (error.message === "User not found") {
        return ResponseHelper.error(res, 401, "Invalid refresh token");
      }
      next(error);
    }
  }
}

module.exports = AuthController;
