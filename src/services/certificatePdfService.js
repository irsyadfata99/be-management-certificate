/**
 * CertificatePdfService
 * Business logic untuk upload, download, dan delete PDF bukti cetak sertifikat
 * FIXED: Column names to match database schema
 *
 * Business Rules:
 * - Teacher hanya bisa upload/delete PDF milik sendiri
 * - Satu print record hanya punya satu PDF (upload baru replace yang lama)
 * - File lama di disk dihapus otomatis saat replace/delete
 * - Admin head branch hanya bisa download, tidak bisa upload/delete
 * - Teacher hanya bisa akses PDF dari branch yang sama (head branch scope)
 */

const { query, getClient } = require("../config/database");
const { deleteFile } = require("../middleware/uploadMiddleware");
const path = require("path");
const fs = require("fs");

class CertificatePdfService {
  /**
   * Ambil head branch ID dari user (teacher atau admin)
   * @param {number} userId
   * @returns {Promise<number>} headBranchId
   */
  static async _getHeadBranchId(userId) {
    const result = await query(
      `SELECT u.branch_id, u.role, b.is_head_branch, b.parent_id
       FROM users u
       JOIN branches b ON u.branch_id = b.id
       WHERE u.id = $1`,
      [userId],
    );

    const user = result.rows[0];
    if (!user || !user.branch_id) {
      throw new Error("User does not have an assigned branch");
    }

    return user.is_head_branch ? user.branch_id : user.parent_id;
  }

  /**
   * Validasi bahwa print record ada dan dalam scope head branch user
   * @param {number} printId
   * @param {number} headBranchId
   * @returns {Promise<Object>} print record
   */
  static async _validatePrintScope(printId, headBranchId) {
    const result = await query(
      `SELECT
         cp.id,
         cp.teacher_id,
         cp.certificate_id,
         cp.student_name,
         cp.ptc_date,
         c.certificate_number,
         c.head_branch_id
       FROM certificate_prints cp
       JOIN certificates c ON cp.certificate_id = c.id
       WHERE cp.id = $1`,
      [printId],
    );

    if (result.rows.length === 0) {
      throw new Error("Print record not found");
    }

    const printRecord = result.rows[0];

    if (printRecord.head_branch_id !== headBranchId) {
      throw new Error("Access denied to this print record");
    }

    return printRecord;
  }

  /**
   * Upload PDF bukti cetak sertifikat.
   * Jika sudah ada PDF sebelumnya, file lama dihapus dari disk & DB.
   * FIXED: Use certificate_print_id instead of print_id
   *
   * @param {number} printId - ID dari certificate_prints
   * @param {Object} fileData - data dari multer (req.file)
   * @param {number} teacherId
   * @returns {Promise<Object>}
   */
  static async uploadPdf(printId, fileData, teacherId) {
    const headBranchId = await this._getHeadBranchId(teacherId);
    const printRecord = await this._validatePrintScope(printId, headBranchId);

    // Teacher hanya bisa upload untuk print miliknya sendiri
    if (printRecord.teacher_id !== teacherId) {
      // Hapus file yang sudah terupload oleh multer sebelum throw
      deleteFile(fileData.path);
      throw new Error("Access denied. You can only upload PDF for your own prints");
    }

    const client = await getClient();
    try {
      await client.query("BEGIN");

      // Cek apakah sudah ada PDF sebelumnya
      const existingResult = await client.query(`SELECT id, file_path FROM certificate_pdfs WHERE certificate_print_id = $1`, [printId]);

      let oldFilePath = null;

      if (existingResult.rows.length > 0) {
        // Simpan path lama untuk dihapus setelah commit
        oldFilePath = existingResult.rows[0].file_path;

        // Update record yang ada - FIXED: created_at instead of "createdAt"
        await client.query(
          `UPDATE certificate_pdfs
           SET
             filename = $1,
             original_filename = $2,
             file_path = $3,
             file_size = $4,
             uploaded_by = $5,
             created_at = NOW()
           WHERE certificate_print_id = $6`,
          [fileData.filename, fileData.originalname, fileData.path, fileData.size, teacherId, printId],
        );
      } else {
        // Insert record baru
        await client.query(
          `INSERT INTO certificate_pdfs
             (certificate_print_id, uploaded_by, filename, original_filename, file_path, file_size)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [printId, teacherId, fileData.filename, fileData.originalname, fileData.path, fileData.size],
        );
      }

      await client.query("COMMIT");

      // Hapus file lama dari disk setelah commit berhasil
      if (oldFilePath) {
        deleteFile(oldFilePath);
      }

      return {
        print_id: printId,
        certificate_number: printRecord.certificate_number,
        student_name: printRecord.student_name,
        filename: fileData.originalname,
        file_size: fileData.size,
        file_size_kb: (fileData.size / 1024).toFixed(2),
        uploaded_at: new Date().toISOString(),
        is_replace: oldFilePath !== null,
      };
    } catch (error) {
      await client.query("ROLLBACK");

      // Hapus file yang baru diupload jika DB transaction gagal
      deleteFile(fileData.path);

      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Ambil metadata & path file PDF untuk didownload/distream.
   * Bisa diakses oleh teacher yang mengupload ATAU admin head branch.
   * FIXED: Use certificate_print_id in query
   *
   * @param {number} printId
   * @param {number} userId
   * @param {string} userRole
   * @returns {Promise<Object>} { filePath, filename, originalFilename }
   */
  static async getPdf(printId, userId, userRole) {
    const headBranchId = await this._getHeadBranchId(userId);
    const printRecord = await this._validatePrintScope(printId, headBranchId);

    // Teacher: hanya bisa akses PDF milik sendiri
    if (userRole === "teacher" && printRecord.teacher_id !== userId) {
      throw new Error("Access denied. You can only access your own PDF");
    }

    // Ambil data PDF - FIXED: created_at AS uploaded_at
    const result = await query(
      `SELECT
         cp.id,
         cp.filename,
         cp.original_filename,
         cp.file_path,
         cp.file_size,
         cp.uploaded_by,
         cp.created_at AS uploaded_at
       FROM certificate_pdfs cp
       WHERE cp.certificate_print_id = $1`,
      [printId],
    );

    if (result.rows.length === 0) {
      throw new Error("PDF not found for this print record");
    }

    const pdfRecord = result.rows[0];

    // Pastikan file benar-benar ada di disk
    if (!fs.existsSync(pdfRecord.file_path)) {
      throw new Error("PDF file not found on server");
    }

    return {
      filePath: pdfRecord.file_path,
      filename: pdfRecord.filename,
      originalFilename: pdfRecord.original_filename,
      fileSize: pdfRecord.file_size,
      uploadedAt: pdfRecord.uploaded_at,
      printRecord: {
        certificate_number: printRecord.certificate_number,
        student_name: printRecord.student_name,
        ptc_date: printRecord.ptc_date,
      },
    };
  }

  /**
   * Hapus PDF dari disk dan database.
   * Hanya teacher yang mengupload yang bisa menghapus.
   * FIXED: Use certificate_print_id in queries
   *
   * @param {number} printId
   * @param {number} teacherId
   * @returns {Promise<void>}
   */
  static async deletePdf(printId, teacherId) {
    const headBranchId = await this._getHeadBranchId(teacherId);
    const printRecord = await this._validatePrintScope(printId, headBranchId);

    // Hanya teacher pemilik print yang bisa hapus
    if (printRecord.teacher_id !== teacherId) {
      throw new Error("Access denied. You can only delete PDF for your own prints");
    }

    // Ambil data PDF
    const result = await query(`SELECT id, file_path FROM certificate_pdfs WHERE certificate_print_id = $1`, [printId]);

    if (result.rows.length === 0) {
      throw new Error("PDF not found for this print record");
    }

    const pdfRecord = result.rows[0];

    // Hapus dari DB terlebih dahulu
    await query(`DELETE FROM certificate_pdfs WHERE certificate_print_id = $1`, [printId]);

    // Hapus file dari disk setelah DB berhasil
    deleteFile(pdfRecord.file_path);
  }

  /**
   * Ambil list semua PDF dalam scope head branch (untuk admin).
   * FIXED: Use certificate_print_id in joins
   * @param {number} adminId
   * @param {Object} filters
   * @returns {Promise<Object>}
   */
  static async listPdfs(adminId, { page = 1, limit = 50, teacherId } = {}) {
    const headBranchId = await this._getHeadBranchId(adminId);

    const offset = (page - 1) * limit;
    const params = [headBranchId];
    let paramIndex = 2;

    let whereClause = `WHERE c.head_branch_id = $1`;

    if (teacherId) {
      whereClause += ` AND cp.teacher_id = $${paramIndex++}`;
      params.push(teacherId);
    }

    // FIXED: created_at AS uploaded_at
    const dataResult = await query(
      `SELECT
         pdf.id,
         pdf.certificate_print_id AS print_id,
         c.certificate_number,
         cp.student_name,
         cp.ptc_date,
         pdf.original_filename,
         pdf.file_size,
         u.username AS uploaded_by_username,
         u.full_name AS uploaded_by_name,
         pdf.created_at AS uploaded_at
       FROM certificate_pdfs pdf
       JOIN certificate_prints cp ON pdf.certificate_print_id = cp.id
       JOIN certificates c ON cp.certificate_id = c.id
       JOIN users u ON pdf.uploaded_by = u.id
       ${whereClause}
       ORDER BY pdf.created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...params, limit, offset],
    );

    const countResult = await query(
      `SELECT COUNT(*) FROM certificate_pdfs pdf
       JOIN certificate_prints cp ON pdf.certificate_print_id = cp.id
       JOIN certificates c ON cp.certificate_id = c.id
       ${whereClause}`,
      params,
    );

    const total = parseInt(countResult.rows[0].count, 10);

    return {
      pdfs: dataResult.rows.map((row) => ({
        ...row,
        file_size_kb: (row.file_size / 1024).toFixed(2),
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1,
      },
    };
  }
}

module.exports = CertificatePdfService;
