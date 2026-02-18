const { query } = require("../config/database");
const ResponseHelper = require("../utils/responseHelper");

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
      const existing = await query(
        `SELECT id, attempt_count, last_attempt_at
         FROM login_attempts
         WHERE username = $1`,
        [normalizedUsername],
      );

      if (existing.rows.length === 0) {
        await query(
          `INSERT INTO login_attempts
             (username, attempt_count, first_attempt_at, last_attempt_at)
           VALUES ($1, 1, NOW(), NOW())`,
          [normalizedUsername],
        );
      } else {
        const row = existing.rows[0];
        const lastAttempt = new Date(row.last_attempt_at);
        const windowMs = BRUTE_FORCE_CONFIG.ATTEMPT_WINDOW_MINUTES * 60 * 1000;
        const isOutsideWindow = Date.now() - lastAttempt.getTime() > windowMs;

        if (isOutsideWindow) {
          await query(
            `UPDATE login_attempts
             SET attempt_count = 1,
                 first_attempt_at = NOW(),
                 last_attempt_at = NOW(),
                 blocked_until = NULL,
                 updated_at = NOW()
             WHERE username = $1`,
            [normalizedUsername],
          );
        } else {
          const newCount = row.attempt_count + 1;
          const blockedUntil =
            newCount >= BRUTE_FORCE_CONFIG.MAX_ATTEMPTS
              ? `NOW() + INTERVAL '${BRUTE_FORCE_CONFIG.BLOCK_DURATION_MINUTES} minutes'`
              : "NULL";

          await query(
            `UPDATE login_attempts
             SET attempt_count = $2,
                 last_attempt_at = NOW(),
                 blocked_until = CASE WHEN $2 >= $3 THEN NOW() + ($4 || ' minutes')::INTERVAL ELSE NULL END,
                 updated_at = NOW()
             WHERE username = $1`,
            [
              normalizedUsername,
              newCount,
              BRUTE_FORCE_CONFIG.MAX_ATTEMPTS,
              BRUTE_FORCE_CONFIG.BLOCK_DURATION_MINUTES,
            ],
          );
        }
      }
    } catch (error) {
      console.error("[BruteForce] Failed to record attempt:", error.message);
    }
  }
  static async clearAttempts(username) {
    const normalizedUsername = this._normalize(username);
    if (!normalizedUsername) return;

    try {
      await query(`DELETE FROM login_attempts WHERE username = $1`, [
        normalizedUsername,
      ]);
    } catch (error) {
      console.error("[BruteForce] Failed to clear attempts:", error.message);
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
      console.error(
        "[BruteForce] Failed to check block status:",
        error.message,
      );
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
        console.warn(
          `[SECURITY] Blocked login attempt for "${username}" — ` +
            `${blockInfo.remainingMinutes} minute(s) remaining`,
        );

        return ResponseHelper.error(
          res,
          429,
          `Account temporarily locked due to multiple failed login attempts. ` +
            `Please try again in ${blockInfo.remainingMinutes} minute(s).`,
        );
      }

      next();
    } catch (error) {
      console.error(
        "[BruteForce] checkBlocked middleware error:",
        error.message,
      );
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
        console.log(
          `[BruteForce] Cleanup removed ${result.rowCount} stale record(s)`,
        );
      }
    } catch (error) {
      console.error("[BruteForce] Cleanup failed:", error.message);
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
