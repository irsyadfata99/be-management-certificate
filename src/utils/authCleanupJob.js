const cron = require("node-cron");
const AuthService = require("../services/authService");
const logger = require("./logger");

const setupAuthCleanupJob = () => {
  cron.schedule("0 3 * * *", async () => {
    try {
      await AuthService.cleanupExpiredTokens();
    } catch (error) {
      logger.error("Failed to cleanup expired tokens", {
        error: error.message,
      });
    }
  });

  logger.info("Cron job scheduled", {
    job: "cleanupExpiredTokens",
    schedule: "Daily at 3:00 AM",
  });
};

module.exports = { setupAuthCleanupJob };
