const cron = require("node-cron");
const BruteForceProtection = require("../middleware/bruteForceMiddleware");
const logger = require("./logger");

const setupBruteForceCleanupJob = () => {
  cron.schedule("0 * * * *", async () => {
    logger.info("Running brute force protection cleanup");
    await BruteForceProtection.cleanup();
  });

  logger.info("Cron job scheduled", {
    job: "bruteForceCleanup",
    schedule: "Every hour at minute 0",
  });
};

module.exports = { setupBruteForceCleanupJob };
