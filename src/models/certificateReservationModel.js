const { query } = require("../config/database");

class CertificateReservationModel {
  /**
   * Create reservation (24 hours)
   * @param {number} certificateId
   * @param {number} teacherId
   * @param {Object} client
   * @returns {Promise<Object>}
   */
  static async create(certificateId, teacherId, client = null) {
    const exec = client ? client.query.bind(client) : query;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now

    const result = await exec(
      `INSERT INTO certificate_reservations (certificate_id, teacher_id, expires_at)
       VALUES ($1, $2, $3)
       RETURNING id, certificate_id, teacher_id, reserved_at, expires_at, status, 
                 created_at AS "createdAt", updated_at AS "updatedAt"`,
      [certificateId, teacherId, expiresAt],
    );
    return result.rows[0];
  }

  /**
   * Find active reservation by certificate
   * @param {number} certificateId
   * @returns {Promise<Object|null>}
   */
  static async findActiveByCertificate(certificateId) {
    const result = await query(
      `SELECT id, certificate_id, teacher_id, reserved_at, expires_at, status,
              created_at AS "createdAt", updated_at AS "updatedAt"
       FROM certificate_reservations
       WHERE certificate_id = $1
         AND status = 'active'
         AND expires_at > NOW()
       ORDER BY reserved_at DESC
       LIMIT 1`,
      [certificateId],
    );
    return result.rows[0] || null;
  }

  /**
   * Find active reservations by teacher
   * @param {number} teacherId
   * @returns {Promise<Array>}
   */
  static async findActiveByTeacher(teacherId) {
    const result = await query(
      `SELECT
         cr.id,
         cr.certificate_id,
         cr.teacher_id,
         cr.reserved_at,
         cr.expires_at,
         cr.status,
         cr.created_at AS "createdAt",
         cr.updated_at AS "updatedAt",
         c.certificate_number,
         c.status AS certificate_status
       FROM certificate_reservations cr
       JOIN certificates c ON cr.certificate_id = c.id
       WHERE cr.teacher_id = $1
         AND cr.status = 'active'
         AND cr.expires_at > NOW()
       ORDER BY cr.reserved_at DESC`,
      [teacherId],
    );
    return result.rows;
  }

  /**
   * Update reservation status
   * @param {number} id
   * @param {string} status - 'released' or 'completed'
   * @param {Object} client
   * @returns {Promise<Object|null>}
   */
  static async updateStatus(id, status, client = null) {
    const exec = client ? client.query.bind(client) : query;
    const result = await exec(
      `UPDATE certificate_reservations
       SET status = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING id, certificate_id, teacher_id, reserved_at, expires_at, status, 
                 created_at AS "createdAt", updated_at AS "updatedAt"`,
      [status, id],
    );
    return result.rows[0] || null;
  }

  /**
   * Release expired reservations (for cron job)
   * @returns {Promise<number>} Count of released reservations
   */
  static async releaseExpired() {
    const result = await query(
      `UPDATE certificate_reservations
       SET status = 'released', updated_at = CURRENT_TIMESTAMP
       WHERE status = 'active' AND expires_at <= NOW()
       RETURNING id`,
    );
    return result.rowCount;
  }

  /**
   * Release reservation by certificate (for manual release)
   * @param {number} certificateId
   * @param {Object} client
   * @returns {Promise<Object|null>}
   */
  static async releaseByCertificate(certificateId, client = null) {
    const exec = client ? client.query.bind(client) : query;
    const result = await exec(
      `UPDATE certificate_reservations
       SET status = 'released', updated_at = CURRENT_TIMESTAMP
       WHERE certificate_id = $1 AND status = 'active'
       RETURNING id, certificate_id, teacher_id, reserved_at, expires_at, status, 
                 created_at AS "createdAt", updated_at AS "updatedAt"`,
      [certificateId],
    );
    return result.rows[0] || null;
  }

  /**
   * Check if certificate is reserved by specific teacher
   * @param {number} certificateId
   * @param {number} teacherId
   * @returns {Promise<boolean>}
   */
  static async isReservedByTeacher(certificateId, teacherId) {
    const result = await query(
      `SELECT id FROM certificate_reservations
       WHERE certificate_id = $1
         AND teacher_id = $2
         AND status = 'active'
         AND expires_at > NOW()`,
      [certificateId, teacherId],
    );
    return result.rows.length > 0;
  }
}

module.exports = CertificateReservationModel;
