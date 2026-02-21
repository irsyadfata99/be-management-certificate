const UserModel = require("../models/userModel");
const JwtHelper = require("../utils/jwtHelper");
const PasswordValidator = require("../utils/passwordValidator");
const BruteForceProtection = require("../middleware/bruteForceMiddleware");
const { query } = require("../config/database");
const crypto = require("crypto");
const logger = require("../utils/logger");

class AuthService {
  static _hashToken(token) {
    return crypto.createHash("sha256").update(token).digest("hex");
  }

  static _parseExpiryDays(expiresIn = "7d") {
    const match = String(expiresIn).match(/^(\d+)([dhm])$/);
    if (!match) return 7;

    const value = parseInt(match[1], 10);
    const unit = match[2];

    if (unit === "d") return value;
    if (unit === "h") return value / 24;
    if (unit === "m") return value / (24 * 60);
    return 7;
  }

  static async _storeRefreshToken(userId, token) {
    const tokenHash = this._hashToken(token);

    const expiresInDays = this._parseExpiryDays(process.env.JWT_REFRESH_EXPIRES_IN);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);

    await query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, is_revoked)
       VALUES ($1, $2, $3, false)
       ON CONFLICT (user_id)
       DO UPDATE SET
         token_hash = EXCLUDED.token_hash,
         expires_at = EXCLUDED.expires_at,
         is_revoked = false,
         revoked_at = NULL`,
      [userId, tokenHash, expiresAt],
    );
  }

  static async _revokeRefreshToken(token) {
    const tokenHash = this._hashToken(token);

    const result = await query(
      `UPDATE refresh_tokens
       SET is_revoked = true, revoked_at = NOW()
       WHERE token_hash = $1
         AND is_revoked = false`,
      [tokenHash],
    );

    return result.rowCount > 0;
  }

  static async _revokeAllUserTokens(userId) {
    await query(
      `UPDATE refresh_tokens
       SET is_revoked = true, revoked_at = NOW()
       WHERE user_id = $1
         AND is_revoked = false`,
      [userId],
    );
  }

  static async _validateStoredRefreshToken(token) {
    const tokenHash = this._hashToken(token);

    const result = await query(
      `SELECT id, user_id, expires_at, is_revoked
       FROM refresh_tokens
       WHERE token_hash = $1`,
      [tokenHash],
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];

    if (row.is_revoked) return null;
    if (new Date(row.expires_at) < new Date()) return null;

    return row;
  }

  static async cleanupExpiredTokens() {
    const result = await query(
      `DELETE FROM refresh_tokens
       WHERE expires_at < NOW()
          OR is_revoked = true`,
    );

    if (result.rowCount > 0) {
      logger.info("Cleaned up expired/revoked tokens", {
        count: result.rowCount,
      });
    }
  }

  // ─── PUBLIC METHODS ───────────────────────────────────────────────────────

  static async login(username, password) {
    const user = await UserModel.findByUsername(username);

    if (!user) {
      await BruteForceProtection.recordFailedAttempt(username);
      throw new Error("Invalid credentials");
    }

    const isPasswordValid = await UserModel.verifyPassword(password, user.password);

    if (!isPasswordValid) {
      await BruteForceProtection.recordFailedAttempt(username);
      throw new Error("Invalid credentials");
    }

    await BruteForceProtection.clearAttempts(username);

    const tokenPayload = {
      userId: user.id,
      username: user.username,
      role: user.role,
      branchId: user.branch_id ?? null,
    };

    const accessToken = JwtHelper.generateAccessToken(tokenPayload);
    const refreshToken = JwtHelper.generateRefreshToken({ userId: user.id });

    await this._storeRefreshToken(user.id, refreshToken);

    return {
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        branch_id: user.branch_id ?? null,
        full_name: user.full_name,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      accessToken,
      refreshToken,
    };
  }

  static async logout(refreshToken) {
    if (!refreshToken) return;

    try {
      await this._revokeRefreshToken(refreshToken);
    } catch (error) {
      logger.error("Error revoking token on logout", {
        error: error.message,
      });
    }
  }

  static async getProfile(userId) {
    const user = await UserModel.findById(userId);

    if (!user) {
      throw new Error("User not found");
    }

    return user;
  }

  static async changeUsername(userId, newUsername, currentPassword) {
    const currentUser = await UserModel.findById(userId);
    if (!currentUser) throw new Error("User not found");

    const userWithPassword = await UserModel.findByUsername(currentUser.username);
    const isPasswordValid = await UserModel.verifyPassword(currentPassword, userWithPassword.password);

    if (!isPasswordValid) {
      throw new Error("Invalid password");
    }

    const existingUser = await UserModel.findByUsername(newUsername);
    if (existingUser && existingUser.id !== userId) {
      throw new Error("Username already exists");
    }

    return UserModel.updateUsername(userId, newUsername);
  }

  static async changePassword(userId, currentPassword, newPassword) {
    const validation = PasswordValidator.validate(newPassword);
    if (!validation.isValid) {
      const error = new Error("Password does not meet requirements");
      error.details = validation.errors;
      throw error;
    }

    const currentUser = await UserModel.findById(userId);
    if (!currentUser) throw new Error("User not found");

    const userWithPassword = await UserModel.findByUsername(currentUser.username);

    const isPasswordValid = await UserModel.verifyPassword(currentPassword, userWithPassword.password);
    if (!isPasswordValid) {
      throw new Error("Current password is incorrect");
    }

    const isSamePassword = await UserModel.verifyPassword(newPassword, userWithPassword.password);
    if (isSamePassword) {
      throw new Error("New password must be different from current password");
    }

    const updatedUser = await UserModel.updatePassword(userId, newPassword);

    await this._revokeAllUserTokens(userId);

    return updatedUser;
  }

  static async refreshToken(refreshToken) {
    const decoded = JwtHelper.verifyRefreshToken(refreshToken);

    const storedToken = await this._validateStoredRefreshToken(refreshToken);

    if (!storedToken) {
      throw new Error("Refresh token is invalid or has been revoked");
    }

    if (storedToken.user_id !== decoded.userId) {
      await this._revokeAllUserTokens(decoded.userId);
      throw new Error("Token mismatch detected. All sessions have been terminated.");
    }

    const user = await UserModel.findById(decoded.userId);
    if (!user) {
      throw new Error("User not found");
    }

    if (!user.is_active) {
      await this._revokeAllUserTokens(user.id);
      throw new Error("Account is inactive");
    }

    await this._revokeRefreshToken(refreshToken);

    const tokenPayload = {
      userId: user.id,
      username: user.username,
      role: user.role,
      branchId: user.branch_id ?? null,
    };

    const newAccessToken = JwtHelper.generateAccessToken(tokenPayload);
    const newRefreshToken = JwtHelper.generateRefreshToken({ userId: user.id });

    await this._storeRefreshToken(user.id, newRefreshToken);

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    };
  }
}

module.exports = AuthService;
