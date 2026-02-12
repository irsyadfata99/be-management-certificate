/**
 * Brute Force Protection Middleware
 * Tracks failed login attempts per username and blocks after threshold
 */

const ResponseHelper = require("../utils/responseHelper");

// In-memory store for failed login attempts
// In production, use Redis for distributed systems
const loginAttempts = new Map();
const blockedUsers = new Map();

const BRUTE_FORCE_CONFIG = {
  MAX_ATTEMPTS: 5, // Maximum failed attempts
  BLOCK_DURATION: 15 * 60 * 1000, // Block duration: 15 minutes
  ATTEMPT_WINDOW: 15 * 60 * 1000, // Reset attempts after 15 minutes of no attempts
};

class BruteForceProtection {
  /**
   * Record failed login attempt
   * @param {string} username - Username that failed login
   */
  static recordFailedAttempt(username) {
    const now = Date.now();
    const normalizedUsername = username.toLowerCase().trim();

    // Check if user is currently blocked
    if (blockedUsers.has(normalizedUsername)) {
      const blockData = blockedUsers.get(normalizedUsername);
      if (now < blockData.blockedUntil) {
        // Still blocked, extend the block
        return;
      } else {
        // Block expired, remove from blocked list
        blockedUsers.delete(normalizedUsername);
        loginAttempts.delete(normalizedUsername);
      }
    }

    // Get or initialize attempt record
    const attempts = loginAttempts.get(normalizedUsername) || {
      count: 0,
      firstAttempt: now,
      lastAttempt: now,
    };

    // Reset if outside attempt window
    if (now - attempts.lastAttempt > BRUTE_FORCE_CONFIG.ATTEMPT_WINDOW) {
      attempts.count = 1;
      attempts.firstAttempt = now;
    } else {
      attempts.count++;
    }

    attempts.lastAttempt = now;
    loginAttempts.set(normalizedUsername, attempts);

    // Block user if threshold exceeded
    if (attempts.count >= BRUTE_FORCE_CONFIG.MAX_ATTEMPTS) {
      blockedUsers.set(normalizedUsername, {
        blockedAt: now,
        blockedUntil: now + BRUTE_FORCE_CONFIG.BLOCK_DURATION,
        attemptCount: attempts.count,
      });

      // Clean up attempts record
      loginAttempts.delete(normalizedUsername);

      console.warn(`[SECURITY] User "${normalizedUsername}" blocked due to ${attempts.count} failed login attempts`);
    }
  }

  /**
   * Clear failed attempts on successful login
   * @param {string} username - Username that logged in successfully
   */
  static clearAttempts(username) {
    const normalizedUsername = username.toLowerCase().trim();
    loginAttempts.delete(normalizedUsername);
    blockedUsers.delete(normalizedUsername);
  }

  /**
   * Check if username is currently blocked
   * @param {string} username - Username to check
   * @returns {Object|null} Block info or null if not blocked
   */
  static isBlocked(username) {
    const normalizedUsername = username.toLowerCase().trim();
    const now = Date.now();

    if (blockedUsers.has(normalizedUsername)) {
      const blockData = blockedUsers.get(normalizedUsername);

      if (now < blockData.blockedUntil) {
        const remainingMinutes = Math.ceil((blockData.blockedUntil - now) / 60000);
        return {
          blocked: true,
          remainingMinutes,
          attemptCount: blockData.attemptCount,
        };
      } else {
        // Block expired
        blockedUsers.delete(normalizedUsername);
        loginAttempts.delete(normalizedUsername);
        return null;
      }
    }

    return null;
  }

  /**
   * Get remaining attempts before block
   * @param {string} username - Username to check
   * @returns {number} Remaining attempts
   */
  static getRemainingAttempts(username) {
    const normalizedUsername = username.toLowerCase().trim();

    if (this.isBlocked(normalizedUsername)) {
      return 0;
    }

    const attempts = loginAttempts.get(normalizedUsername);
    if (!attempts) {
      return BRUTE_FORCE_CONFIG.MAX_ATTEMPTS;
    }

    return Math.max(0, BRUTE_FORCE_CONFIG.MAX_ATTEMPTS - attempts.count);
  }

  /**
   * Middleware to check if user is blocked before login
   */
  static checkBlocked(req, res, next) {
    const { username } = req.body;

    if (!username) {
      return next();
    }

    const blockInfo = BruteForceProtection.isBlocked(username);

    if (blockInfo) {
      console.warn(`[SECURITY] Blocked login attempt for "${username}" - ${blockInfo.remainingMinutes} minutes remaining`);

      return ResponseHelper.error(res, 429, `Account temporarily locked due to multiple failed login attempts. Please try again in ${blockInfo.remainingMinutes} minute(s).`);
    }

    next();
  }

  /**
   * Clean up expired records (run periodically)
   * Call this from a cron job or interval
   */
  static cleanup() {
    const now = Date.now();
    let cleanedAttempts = 0;
    let cleanedBlocks = 0;

    // Clean expired attempts
    for (const [username, attempts] of loginAttempts.entries()) {
      if (now - attempts.lastAttempt > BRUTE_FORCE_CONFIG.ATTEMPT_WINDOW) {
        loginAttempts.delete(username);
        cleanedAttempts++;
      }
    }

    // Clean expired blocks
    for (const [username, blockData] of blockedUsers.entries()) {
      if (now >= blockData.blockedUntil) {
        blockedUsers.delete(username);
        cleanedBlocks++;
      }
    }

    if (cleanedAttempts > 0 || cleanedBlocks > 0) {
      console.log(`[Brute Force Cleanup] Removed ${cleanedAttempts} expired attempts and ${cleanedBlocks} expired blocks`);
    }
  }

  /**
   * Get statistics (for monitoring)
   */
  static getStats() {
    return {
      activeAttempts: loginAttempts.size,
      blockedUsers: blockedUsers.size,
      config: BRUTE_FORCE_CONFIG,
    };
  }
}

module.exports = BruteForceProtection;
