const { query } = require("../config/database");
const ResponseHelper = require("../utils/responseHelper");
const logger = require("../utils/logger");

const BRUTE_FORCE_CONFIG = {
  MAX_ATTEMPTS: 5,
  BLOCK_DURATION_MINUTES: 15,
  ATTEMPT_WINDOW_MINUTES: 15,
};

class BruteForceProtection {
  static _normalize(username) {
    return (username || "").toLowerCase().trim();
  }

  static async recordFailedAttempt(username) {
    const normalizedUsername = this._normalize(username);
    if (!normalizedUsername) return;

    try {
      await query(
        `INSERT INTO login_attempts
           (username, attempt_count, first_attempt_at, last_attempt_at)
         VALUES ($1, 1, NOW(), NOW())
         ON CONFLICT (username) DO UPDATE
           SET
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
             blocked_until = CASE
               WHEN login_attempts.last_attempt_at < NOW() - ($2 || ' minutes')::INTERVAL
               THEN NULL
               WHEN login_attempts.attempt_count + 1 >= $3
               THEN NOW() + ($4 || ' minutes')::INTERVAL
               ELSE NULL
             END,
             updated_at = NOW()`,
        [normalizedUsername, BRUTE_FORCE_CONFIG.ATTEMPT_WINDOW_MINUTES, BRUTE_FORCE_CONFIG.MAX_ATTEMPTS, BRUTE_FORCE_CONFIG.BLOCK_DURATION_MINUTES],
      );
    } catch (error) {
      logger.error("[BruteForce] Failed to record attempt", {
        username: normalizedUsername,
        error: error.message,
      });
    }
  }

  static async clearAttempts(username) {
    const normalizedUsername = this._normalize(username);
    if (!normalizedUsername) return;

    try {
      await query(`DELETE FROM login_attempts WHERE username = $1`, [normalizedUsername]);
    } catch (error) {
      logger.error("[BruteForce] Failed to clear attempts", {
        username: normalizedUsername,
        error: error.message,
      });
    }
  }

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

      await query(
        `UPDATE login_attempts
         SET blocked_until = NULL, attempt_count = 0, updated_at = NOW()
         WHERE username = $1`,
        [normalizedUsername],
      );

      return { blocked: false };
    } catch (error) {
      logger.error("[BruteForce] Failed to check block status", {
        username: normalizedUsername,
        error: error.message,
      });
      return { blocked: false };
    }
  }

  static async checkBlocked(req, res, next) {
    const { username } = req.body;

    if (!username) {
      return next();
    }

    try {
      const blockInfo = await BruteForceProtection.isBlocked(username);

      if (blockInfo.blocked) {
        logger.warn("[SECURITY] Blocked login attempt", {
          username,
          remainingMinutes: blockInfo.remainingMinutes,
        });

        return ResponseHelper.error(res, 429, `Account temporarily locked due to multiple failed login attempts. ` + `Please try again in ${blockInfo.remainingMinutes} minute(s).`);
      }

      next();
    } catch (error) {
      logger.error("[BruteForce] checkBlocked middleware error", {
        error: error.message,
      });
      next();
    }
  }

  static async cleanup() {
    try {
      const result = await query(
        `DELETE FROM login_attempts
         WHERE
           (blocked_until IS NOT NULL AND blocked_until < NOW()
            AND last_attempt_at < NOW() - ($1 || ' minutes')::INTERVAL)
           OR
           (blocked_until IS NULL
            AND last_attempt_at < NOW() - ($1 || ' minutes')::INTERVAL)`,
        [BRUTE_FORCE_CONFIG.ATTEMPT_WINDOW_MINUTES],
      );

      if (result.rowCount > 0) {
        logger.info("[BruteForce] Cleanup completed", {
          removed: result.rowCount,
        });
      }
    } catch (error) {
      logger.error("[BruteForce] Cleanup failed", { error: error.message });
    }
  }

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
