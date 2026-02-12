const UserModel = require("../models/userModel");
const JwtHelper = require("../utils/jwtHelper");
const PasswordValidator = require("../utils/passwordValidator");
const BruteForceProtection = require("../middleware/bruteForceMiddleware");
const { query } = require("../config/database");

/**
 * AuthService
 *
 * Perubahan dari versi sebelumnya:
 * 1. login()        — menyimpan refresh token ke DB (tabel: refresh_tokens)
 * 2. logout()       — merevoke refresh token dari DB
 * 3. refreshToken() — validasi token ada di DB & belum direvoke, lalu rotate
 *
 * Tabel yang dibutuhkan:
 *
 * CREATE TABLE refresh_tokens (
 *   id SERIAL PRIMARY KEY,
 *   user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 *   token_hash VARCHAR(64) NOT NULL,   -- SHA-256 hex dari token string
 *   expires_at TIMESTAMP NOT NULL,
 *   is_revoked BOOLEAN NOT NULL DEFAULT false,
 *   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 *   revoked_at TIMESTAMP,
 *   CONSTRAINT uq_token_hash UNIQUE (token_hash)
 * );
 * CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);
 * CREATE INDEX idx_refresh_tokens_hash ON refresh_tokens(token_hash);
 * CREATE INDEX idx_refresh_tokens_expires ON refresh_tokens(expires_at);
 */

const crypto = require("crypto");

class AuthService {
  /**
   * Hash token dengan SHA-256 sebelum disimpan ke DB.
   * Token asli tidak perlu disimpan plain — cukup hashnya untuk lookup.
   * @param {string} token
   * @returns {string} hex string 64 karakter
   */
  static _hashToken(token) {
    return crypto.createHash("sha256").update(token).digest("hex");
  }

  /**
   * Simpan refresh token baru ke database.
   * @param {number} userId
   * @param {string} token - raw refresh token
   * @param {number} expiresInDays - default 7 hari (sesuai JWT config)
   */
  static async _storeRefreshToken(userId, token, expiresInDays = 7) {
    const tokenHash = this._hashToken(token);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);

    await query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [userId, tokenHash, expiresAt],
    );
  }

  /**
   * Revoke satu refresh token spesifik (untuk logout).
   * @param {string} token - raw refresh token dari client
   * @returns {Promise<boolean>} true jika token ditemukan dan direvoke
   */
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

  /**
   * Revoke SEMUA refresh token milik user.
   * Dipakai saat ganti password agar semua sesi lain otomatis logout.
   * @param {number} userId
   */
  static async _revokeAllUserTokens(userId) {
    await query(
      `UPDATE refresh_tokens
       SET is_revoked = true, revoked_at = NOW()
       WHERE user_id = $1
         AND is_revoked = false`,
      [userId],
    );
  }

  /**
   * Cek apakah refresh token valid di database:
   * - ada di tabel
   * - belum direvoke
   * - belum expired
   * @param {string} token - raw refresh token
   * @returns {Promise<Object|null>} row dari DB, atau null jika tidak valid
   */
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

  /**
   * Cleanup expired & revoked tokens dari DB.
   * Panggil dari cron job (misalnya 1x sehari).
   */
  static async cleanupExpiredTokens() {
    const result = await query(
      `DELETE FROM refresh_tokens
       WHERE expires_at < NOW()
          OR is_revoked = true`,
    );

    if (result.rowCount > 0) {
      console.log(`[AuthService] Cleaned up ${result.rowCount} expired/revoked token(s)`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PUBLIC METHODS
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Login user dan generate token pair.
   * Refresh token disimpan ke DB agar bisa direvoke.
   * @param {string} username
   * @param {string} password
   * @returns {Promise<Object>}
   */
  static async login(username, password) {
    // Cari user
    const user = await UserModel.findByUsername(username);

    if (!user) {
      await BruteForceProtection.recordFailedAttempt(username);
      throw new Error("Invalid credentials");
    }

    // Verifikasi password
    const isPasswordValid = await UserModel.verifyPassword(password, user.password);

    if (!isPasswordValid) {
      await BruteForceProtection.recordFailedAttempt(username);
      throw new Error("Invalid credentials");
    }

    // Login sukses — bersihkan failed attempts
    await BruteForceProtection.clearAttempts(username);

    // Generate token pair
    const tokenPayload = {
      userId: user.id,
      username: user.username,
      role: user.role,
    };

    const accessToken = JwtHelper.generateAccessToken(tokenPayload);
    const refreshToken = JwtHelper.generateRefreshToken({ userId: user.id });

    // Simpan refresh token ke DB
    await this._storeRefreshToken(user.id, refreshToken);

    return {
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        full_name: user.full_name,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      accessToken,
      refreshToken,
    };
  }

  /**
   * Logout: revoke refresh token agar tidak bisa dipakai lagi.
   * Jika client tidak mengirim refreshToken, tetap return success
   * (access token akan expired sendiri dalam 15 menit).
   * @param {string|null} refreshToken
   * @returns {Promise<void>}
   */
  static async logout(refreshToken) {
    if (!refreshToken) return;

    try {
      await this._revokeRefreshToken(refreshToken);
    } catch (error) {
      // Jangan crash logout flow karena DB error
      console.error("[AuthService] Error revoking token on logout:", error.message);
    }
  }

  /**
   * Get user profile by ID.
   * @param {number} userId
   * @returns {Promise<Object>}
   */
  static async getProfile(userId) {
    const user = await UserModel.findById(userId);

    if (!user) {
      throw new Error("User not found");
    }

    return user;
  }

  /**
   * Ganti username (membutuhkan verifikasi password).
   * @param {number} userId
   * @param {string} newUsername
   * @param {string} currentPassword
   * @returns {Promise<Object>}
   */
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

  /**
   * Ganti password.
   * Setelah berhasil, SEMUA refresh token user direvoke —
   * memaksa semua sesi lain untuk login ulang.
   * @param {number} userId
   * @param {string} currentPassword
   * @param {string} newPassword
   * @returns {Promise<Object>}
   */
  static async changePassword(userId, currentPassword, newPassword) {
    // Validasi kekuatan password baru
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

    // Revoke semua sesi lain setelah ganti password
    await this._revokeAllUserTokens(userId);

    return updatedUser;
  }

  /**
   * Refresh access token menggunakan refresh token.
   *
   * Implementasi "token rotation":
   * - Refresh token lama direvoke
   * - Refresh token baru diterbitkan dan disimpan ke DB
   * - Access token baru diterbitkan
   *
   * Ini mencegah refresh token yang bocor dipakai lebih dari sekali.
   *
   * @param {string} refreshToken
   * @returns {Promise<Object>} { accessToken, refreshToken }
   */
  static async refreshToken(refreshToken) {
    // 1. Verifikasi signature JWT (cek expired, signature, dsb.)
    const decoded = JwtHelper.verifyRefreshToken(refreshToken);

    // 2. Cek di DB apakah token masih valid & belum direvoke
    const storedToken = await this._validateStoredRefreshToken(refreshToken);

    if (!storedToken) {
      // Token tidak ada di DB atau sudah direvoke
      // Ini bisa berarti token sudah dipakai (potential token theft)
      throw new Error("Refresh token is invalid or has been revoked");
    }

    // 3. Pastikan userId di JWT cocok dengan yang ada di DB
    if (storedToken.user_id !== decoded.userId) {
      // Anomali — revoke semua token user sebagai tindakan keamanan
      await this._revokeAllUserTokens(decoded.userId);
      throw new Error("Token mismatch detected. All sessions have been terminated.");
    }

    // 4. Ambil data user terbaru
    const user = await UserModel.findById(decoded.userId);
    if (!user) {
      throw new Error("User not found");
    }

    if (!user.is_active) {
      await this._revokeAllUserTokens(user.id);
      throw new Error("Account is inactive");
    }

    // 5. Revoke refresh token lama (token rotation)
    await this._revokeRefreshToken(refreshToken);

    // 6. Terbitkan token pair baru
    const tokenPayload = {
      userId: user.id,
      username: user.username,
      role: user.role,
    };

    const newAccessToken = JwtHelper.generateAccessToken(tokenPayload);
    const newRefreshToken = JwtHelper.generateRefreshToken({ userId: user.id });

    // 7. Simpan refresh token baru ke DB
    await this._storeRefreshToken(user.id, newRefreshToken);

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    };
  }
}

module.exports = AuthService;
