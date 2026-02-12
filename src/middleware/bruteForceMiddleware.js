/**
 * Brute Force Protection Middleware
 * Tracks failed login attempts per username in DATABASE (not in-memory)
 * - Persistent across server restarts
 * - Works with multi-instance / horizontal scaling
 *
 * Requires table: login_attempts (see SQL below)
 *
 * CREATE TABLE login_attempts (
 *   id SERIAL PRIMARY KEY,
 *   username VARCHAR(100) NOT NULL,
 *   attempt_count INTEGER NOT NULL DEFAULT 1,
 *   first_attempt_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 *   last_attempt_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 *   blocked_until TIMESTAMP,
 *   "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 *   "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
 * );
 * CREATE UNIQUE INDEX idx_login_attempts_username ON login_attempts(username);
 * CREATE INDEX idx_login_attempts_blocked_until ON login_attempts(blocked_until);
 */

const { query } = require("../config/database");
const ResponseHelper = require("../utils/responseHelper");

const BRUTE_FORCE_CONFIG = {
  MAX_ATTEMPTS: 5, // Block after 5 failed attempts
  BLOCK_DURATION_MINUTES: 15, // Block duration: 15 minutes
  ATTEMPT_WINDOW_MINUTES: 15, // Reset attempt count if idle for 15 minutes
};

class BruteForceProtection {
  /**
   * Normalize username for consistent lookup
   * @param {string} username
   * @returns {string}
   */
  static _normalize(username) {
    return (username || "").toLowerCase().trim();
  }

  /**
   * Record a failed login attempt in the database.
   * Uses INSERT ... ON CONFLICT to upsert atomically.
   * @param {string} username
   */
  static async recordFailedAttempt(username) {
    const normalizedUsername = this._normalize(username);
    if (!normalizedUsername) return;

    try {
      await query(
        `INSERT INTO login_attempts (username, attempt_count, first_attempt_at, last_attempt_at)
         VALUES ($1, 1, NOW(), NOW())
         ON CONFLICT (username) DO UPDATE
           SET
             -- Reset counter if last attempt was outside the attempt window
             attempt_count = CASE
               WHEN login_attempts.last_attempt_at < NOW() - ($2 || ' minutes')::INTERVAL
               THEN 1
               ELSE login_attempts.attempt_count + 1
             END,
             first_attempt_at = CASE
               WHEN login_attempts.last_attempt_at < NOW() - ($2 || ' minutes')::INTERVAL
               THEN NOW()
               ELSE login_attempts.first_attempt_at
             END,
             last_attempt_at = NOW(),
             -- Set block if new attempt_count hits the threshold
             blocked_until = CASE
               WHEN (
                 CASE
                   WHEN login_attempts.last_attempt_at < NOW() - ($2 || ' minutes')::INTERVAL
                   THEN 1
                   ELSE login_attempts.attempt_count + 1
                 END
               ) >= $3
               THEN NOW() + ($4 || ' minutes')::INTERVAL
               ELSE NULL
             END,
             "updatedAt" = NOW()`,
        [normalizedUsername, BRUTE_FORCE_CONFIG.ATTEMPT_WINDOW_MINUTES, BRUTE_FORCE_CONFIG.MAX_ATTEMPTS, BRUTE_FORCE_CONFIG.BLOCK_DURATION_MINUTES],
      );
    } catch (error) {
      // Log but do not crash the login flow if DB write fails
      console.error("[BruteForce] Failed to record attempt:", error.message);
    }
  }

  /**
   * Clear all failed attempts for a user after successful login.
   * @param {string} username
   */
  static async clearAttempts(username) {
    const normalizedUsername = this._normalize(username);
    if (!normalizedUsername) return;

    try {
      await query(`DELETE FROM login_attempts WHERE username = $1`, [normalizedUsername]);
    } catch (error) {
      console.error("[BruteForce] Failed to clear attempts:", error.message);
    }
  }

  /**
   * Check whether a username is currently blocked.
   * @param {string} username
   * @returns {Promise<{ blocked: boolean, remainingMinutes?: number, attemptCount?: number }>}
   */
  static async isBlocked(username) {
    const normalizedUsername = this._normalize(username);
    if (!normalizedUsername) return { blocked: false };

    try {
      const result = await query(
        `SELECT attempt_count, blocked_until
         FROM login_attempts
         WHERE username = $1`,
        [normalizedUsername],
      );

      if (result.rows.length === 0) {
        return { blocked: false };
      }

      const row = result.rows[0];

      if (!row.blocked_until) {
        return { blocked: false };
      }

      const now = new Date();
      const blockedUntil = new Date(row.blocked_until);

      if (now < blockedUntil) {
        const remainingMs = blockedUntil - now;
        const remainingMinutes = Math.ceil(remainingMs / 60000);
        return {
          blocked: true,
          remainingMinutes,
          attemptCount: row.attempt_count,
        };
      }

      // Block has expired — clean up
      await query(
        `UPDATE login_attempts
         SET blocked_until = NULL, attempt_count = 0, "updatedAt" = NOW()
         WHERE username = $1`,
        [normalizedUsername],
      );

      return { blocked: false };
    } catch (error) {
      console.error("[BruteForce] Failed to check block status:", error.message);
      // Fail open: if DB is down, don't block legitimate users
      return { blocked: false };
    }
  }

  /**
   * Express middleware: reject request immediately if username is blocked.
   * Attach to the login route BEFORE controller logic.
   */
  static async checkBlocked(req, res, next) {
    const { username } = req.body;

    if (!username) {
      return next();
    }

    try {
      const blockInfo = await BruteForceProtection.isBlocked(username);

      if (blockInfo.blocked) {
        console.warn(`[SECURITY] Blocked login attempt for "${username}" — ` + `${blockInfo.remainingMinutes} minute(s) remaining`);

        return ResponseHelper.error(res, 429, `Account temporarily locked due to multiple failed login attempts. ` + `Please try again in ${blockInfo.remainingMinutes} minute(s).`);
      }

      next();
    } catch (error) {
      // Fail open: if middleware throws, allow the request through
      console.error("[BruteForce] checkBlocked middleware error:", error.message);
      next();
    }
  }

  /**
   * Cleanup job: remove fully expired & inactive records.
   * Call this from a cron job (e.g., once per hour).
   * It keeps the table small and avoids unbounded growth.
   */
  static async cleanup() {
    try {
      const result = await query(
        `DELETE FROM login_attempts
         WHERE
           -- Block has expired AND no recent attempts
           (blocked_until IS NOT NULL AND blocked_until < NOW()
            AND last_attempt_at < NOW() - ($1 || ' minutes')::INTERVAL)
           OR
           -- No block, but attempt window has passed (stale row)
           (blocked_until IS NULL
            AND last_attempt_at < NOW() - ($1 || ' minutes')::INTERVAL)`,
        [BRUTE_FORCE_CONFIG.ATTEMPT_WINDOW_MINUTES],
      );

      if (result.rowCount > 0) {
        console.log(`[BruteForce] Cleanup removed ${result.rowCount} stale record(s)`);
      }
    } catch (error) {
      console.error("[BruteForce] Cleanup failed:", error.message);
    }
  }

  /**
   * Get stats for monitoring (optional utility).
   * @returns {Promise<Object>}
   */
  static async getStats() {
    try {
      const result = await query(
        `SELECT
           COUNT(*) AS total_tracked,
           COUNT(*) FILTER (WHERE blocked_until > NOW()) AS currently_blocked,
           COUNT(*) FILTER (WHERE attempt_count >= $1) AS high_attempt_count
         FROM login_attempts`,
        [BRUTE_FORCE_CONFIG.MAX_ATTEMPTS],
      );

      return {
        ...result.rows[0],
        config: BRUTE_FORCE_CONFIG,
      };
    } catch (error) {
      return { error: error.message };
    }
  }
}

module.exports = BruteForceProtection;
