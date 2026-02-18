const CertificateReservationModel = require("../models/certificateReservationModel");
const CertificateModel = require("../models/certificateModel");
const CertificateLogModel = require("../models/certificateLogModel");
const { getClient } = require("../config/database");
const logger = require("./logger");

async function releaseExpiredReservations() {
  logger.info("Starting expired reservation release job");

  const client = await getClient();
  try {
    await client.query("BEGIN");

    const { rows: expiredReservations } = await client.query(
      `SELECT cr.*, c.certificate_number
       FROM certificate_reservations cr
       JOIN certificates c ON cr.certificate_id = c.id
       WHERE cr.status = 'active' AND cr.expires_at <= NOW()`,
    );

    if (expiredReservations.length === 0) {
      logger.info("No expired reservations found");
      await client.query("ROLLBACK");
      return;
    }

    logger.info("Found expired reservations", {
      count: expiredReservations.length,
    });

    for (const reservation of expiredReservations) {
      await client.query(
        `UPDATE certificate_reservations
         SET status = 'released', updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [reservation.id],
      );

      await client.query(
        `UPDATE certificates
         SET status = 'in_stock', updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [reservation.certificate_id],
      );

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

      logger.info("Released expired reservation", {
        certificateNumber: reservation.certificate_number,
        reservationId: reservation.id,
      });
    }

    await client.query("COMMIT");
    logger.info("Successfully released expired reservations", {
      count: expiredReservations.length,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error("Error releasing expired reservations", {
      error: error.message,
      stack: error.stack,
    });
    throw error;
  } finally {
    client.release();
  }
}

function setupCronJob() {
  const cron = require("node-cron");

  cron.schedule("0 * * * *", async () => {
    try {
      await releaseExpiredReservations();
    } catch (error) {
      logger.error("Cron job failed", {
        job: "releaseExpiredReservations",
        error: error.message,
      });
    }
  });

  logger.info("Cron job scheduled", {
    job: "releaseExpiredReservations",
    schedule: "Every hour at minute 0",
  });
}

module.exports = {
  releaseExpiredReservations,
  setupCronJob,
};
