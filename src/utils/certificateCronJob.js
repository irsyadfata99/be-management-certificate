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
      await client.query("COMMIT");
      return;
    }

    logger.info("Found expired reservations", {
      count: expiredReservations.length,
    });

    for (const reservation of expiredReservations) {
      await CertificateReservationModel.updateStatus(
        reservation.id,
        "released",
        client,
      );

      await CertificateModel.updateStatus(
        reservation.certificate_id,
        "in_stock",
        client,
      );

      await CertificateLogModel.create(
        {
          certificate_id: reservation.certificate_id,
          action_type: "release",
          actor_id: reservation.teacher_id,
          actor_role: "teacher",
          metadata: {
            reservation_id: reservation.id,
            reason: "auto_expired",
            expired_at: reservation.expires_at,
          },
        },
        client,
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
