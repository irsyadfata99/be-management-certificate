const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { query, getClient } = require("../config/database");
const logger = require("../utils/logger");

const ACCESS_TOKEN_EXPIRY = process.env.ACCESS_TOKEN_EXPIRY || "15m";
const REFRESH_TOKEN_EXPIRY = process.env.REFRESH_TOKEN_EXPIRY || "7d";
const MAX_LOGIN_ATTEMPTS = parseInt(process.env.MAX_LOGIN_ATTEMPTS, 10) || 5;
const LOCKOUT_DURATION_MINUTES =
  parseInt(process.env.LOCKOUT_DURATION_MINUTES, 10) || 15;

class AuthService {
  static _generateAccessToken(payload) {
    return jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: ACCESS_TOKEN_EXPIRY,
    });
  }

  static _generateRefreshToken(payload) {
    return jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
      expiresIn: REFRESH_TOKEN_EXPIRY,
    });
  }

  static async login(username, password, ipAddress) {
    // Cek lockout
    const lockResult = await query(
      `SELECT attempts, locked_until
       FROM login_attempts
       WHERE username = $1 AND ip_address = $2`,
      [username, ipAddress],
    );

    const lockRow = lockResult.rows[0];
    if (lockRow?.locked_until && new Date(lockRow.locked_until) > new Date()) {
      const minutesLeft = Math.ceil(
        (new Date(lockRow.locked_until) - new Date()) / 60000,
      );
      throw new Error(`Account locked. Try again in ${minutesLeft} minute(s).`);
    }

    const userResult = await query(
      `SELECT id, username, full_name, password, role, is_active, branch_id
       FROM users WHERE username = $1`,
      [username],
    );

    const user = userResult.rows[0];
    const isValid = user && (await bcrypt.compare(password, user.password));

    if (!isValid) {
      await this._recordFailedAttempt(username, ipAddress, lockRow);
      throw new Error("Invalid username or password");
    }

    if (!user.is_active) {
      throw new Error("Account is inactive. Contact your administrator.");
    }

    // Reset login attempts on success
    await query(
      `DELETE FROM login_attempts WHERE username = $1 AND ip_address = $2`,
      [username, ipAddress],
    );

    const tokenPayload = {
      id: user.id,
      username: user.username,
      role: user.role,
      branch_id: user.branch_id,
    };

    const accessToken = this._generateAccessToken(tokenPayload);
    const refreshToken = this._generateRefreshToken({ id: user.id });

    await query(
      `INSERT INTO refresh_tokens (user_id, token, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '7 days')`,
      [user.id, refreshToken],
    );

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        username: user.username,
        full_name: user.full_name,
        role: user.role,
        branch_id: user.branch_id,
      },
    };
  }

  static async _recordFailedAttempt(username, ipAddress, existingRow) {
    const newAttempts = (existingRow?.attempts || 0) + 1;
    const shouldLock = newAttempts >= MAX_LOGIN_ATTEMPTS;
    const lockedUntil = shouldLock
      ? new Date(Date.now() + LOCKOUT_DURATION_MINUTES * 60000)
      : null;

    await query(
      `INSERT INTO login_attempts (username, ip_address, attempts, locked_until, last_attempt_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (username, ip_address) DO UPDATE
         SET attempts    = EXCLUDED.attempts,
             locked_until = EXCLUDED.locked_until,
             last_attempt_at = NOW()`,
      [username, ipAddress, newAttempts, lockedUntil],
    );
  }

  static async refreshToken(token) {
    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    } catch {
      throw new Error("Invalid or expired refresh token");
    }

    const tokenResult = await query(
      `SELECT id FROM refresh_tokens
       WHERE token = $1 AND user_id = $2 AND expires_at > NOW() AND revoked_at IS NULL`,
      [token, payload.id],
    );

    if (!tokenResult.rows[0]) {
      throw new Error("Refresh token not found or revoked");
    }

    const userResult = await query(
      `SELECT id, username, full_name, role, is_active, branch_id
       FROM users WHERE id = $1`,
      [payload.id],
    );

    const user = userResult.rows[0];
    if (!user || !user.is_active) {
      throw new Error("User not found or inactive");
    }

    // Rotation: revoke lama, buat baru
    const client = await getClient();
    try {
      await client.query("BEGIN");

      await client.query(
        `UPDATE refresh_tokens SET revoked_at = NOW() WHERE token = $1`,
        [token],
      );

      const tokenPayload = {
        id: user.id,
        username: user.username,
        role: user.role,
        branch_id: user.branch_id,
      };

      const newAccessToken = this._generateAccessToken(tokenPayload);
      const newRefreshToken = this._generateRefreshToken({ id: user.id });

      await client.query(
        `INSERT INTO refresh_tokens (user_id, token, expires_at)
         VALUES ($1, $2, NOW() + INTERVAL '7 days')`,
        [user.id, newRefreshToken],
      );

      await client.query("COMMIT");

      return {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        user: {
          id: user.id,
          username: user.username,
          full_name: user.full_name,
          role: user.role,
          branch_id: user.branch_id,
        },
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  static async logout(token, userId) {
    await query(
      `UPDATE refresh_tokens SET revoked_at = NOW()
       WHERE token = $1 AND user_id = $2`,
      [token, userId],
    );
  }

  static async logoutAll(userId) {
    await query(
      `UPDATE refresh_tokens SET revoked_at = NOW()
       WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId],
    );
  }

  // FIX [console.log]: Ganti console.log dengan logger agar output
  // cleanup terpantau via sistem logging yang sama dengan seluruh app.
  static async cleanupExpiredTokens() {
    try {
      const result = await query(
        `DELETE FROM refresh_tokens
         WHERE expires_at < NOW() OR revoked_at IS NOT NULL`,
      );
      logger.info(
        `[AuthService] Cleaned up ${result.rowCount} expired/revoked refresh tokens`,
      );
    } catch (error) {
      logger.error("[AuthService] Failed to cleanup expired tokens:", error);
    }
  }
}

module.exports = AuthService;
