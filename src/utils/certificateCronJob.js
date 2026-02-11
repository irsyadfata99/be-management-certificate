/**
 * Cron Job: Auto-release expired reservations
 * Run this script every hour to release reservations that have expired
 *
 * Setup:
 * 1. Install node-cron: npm install node-cron
 * 2. Add to server.js or create a separate scheduler.js file
 * 3. Schedule: Every hour or as needed
 */

const CertificateReservationModel = require("../models/certificateReservationModel");
const CertificateModel = require("../models/certificateModel");
const CertificateLogModel = require("../models/certificateLogModel");
const { getClient } = require("../config/database");

/**
 * Release all expired reservations
 * - Changes reservation status from 'active' to 'released'
 * - Changes certificate status from 'reserved' to 'in_stock'
 * - Logs the action
 */
async function releaseExpiredReservations() {
  console.log("[Cron] Starting expired reservation release job...");

  const client = await getClient();
  try {
    await client.query("BEGIN");

    // Get expired reservations
    const { rows: expiredReservations } = await client.query(
      `SELECT cr.*, c.certificate_number
       FROM certificate_reservations cr
       JOIN certificates c ON cr.certificate_id = c.id
       WHERE cr.status = 'active' AND cr.expires_at <= NOW()`,
    );

    if (expiredReservations.length === 0) {
      console.log("[Cron] No expired reservations found");
      await client.query("ROLLBACK");
      return;
    }

    console.log(
      `[Cron] Found ${expiredReservations.length} expired reservations`,
    );

    // Release each reservation
    for (const reservation of expiredReservations) {
      // Update reservation status
      await client.query(
        `UPDATE certificate_reservations
         SET status = 'released', "updatedAt" = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [reservation.id],
      );

      // Update certificate status back to in_stock
      await client.query(
        `UPDATE certificates
         SET status = 'in_stock', "updatedAt" = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [reservation.certificate_id],
      );

      // Log the action
      await client.query(
        `INSERT INTO certificate_logs (certificate_id, action_type, actor_id, actor_role, metadata)
         VALUES ($1, 'release', $2, 'teacher', $3)`,
        [
          reservation.certificate_id,
          reservation.teacher_id,
          JSON.stringify({
            reservation_id: reservation.id,
            reason: "auto_expired",
            expired_at: reservation.expires_at,
          }),
        ],
      );

      console.log(
        `[Cron] Released: Certificate ${reservation.certificate_number} (Reservation ID: ${reservation.id})`,
      );
    }

    await client.query("COMMIT");
    console.log(
      `[Cron] Successfully released ${expiredReservations.length} expired reservations`,
    );
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("[Cron] Error releasing expired reservations:", error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Setup cron schedule
 * Run every hour
 */
function setupCronJob() {
  const cron = require("node-cron");

  // Run every hour at minute 0 (e.g., 01:00, 02:00, 03:00, etc.)
  cron.schedule("0 * * * *", async () => {
    try {
      await releaseExpiredReservations();
    } catch (error) {
      console.error("[Cron] Cron job failed:", error);
    }
  });

  console.log(
    "[Cron] Cron job scheduled: Auto-release expired reservations every hour",
  );
}

module.exports = {
  releaseExpiredReservations,
  setupCronJob,
};
