/**
 * CertificatePdfController
 * Handler untuk endpoint upload, download, delete, dan list PDF sertifikat
 */

const CertificatePdfService = require("../services/certificatePdfService");
const ResponseHelper = require("../utils/responseHelper");
const { deleteFile } = require("../middleware/uploadMiddleware");

class CertificatePdfController {
  /**
   * POST /certificates/prints/:printId/pdf
   * Upload PDF bukti cetak sertifikat (Teacher only)
   */
  static async upload(req, res, next) {
    try {
      const printId = parseInt(req.params.printId, 10);

      if (isNaN(printId) || printId < 1) {
        // File sudah diupload oleh multer — hapus sebelum return error
        deleteFile(req.file?.path);
        return ResponseHelper.error(res, 400, "Invalid print ID");
      }

      const result = await CertificatePdfService.uploadPdf(printId, req.file, req.user.userId);

      const message = result.is_replace ? "PDF replaced successfully" : "PDF uploaded successfully";

      return ResponseHelper.success(res, 201, message, result);
    } catch (error) {
      // Pastikan file dihapus jika service throw setelah file tersimpan
      deleteFile(req.file?.path);

      const clientErrors = ["Print record not found", "Access denied to this print record", "Access denied. You can only upload PDF for your own prints", "User does not have an assigned branch"];

      if (clientErrors.includes(error.message)) {
        return ResponseHelper.error(res, 400, error.message);
      }

      next(error);
    }
  }

  /**
   * GET /certificates/prints/:printId/pdf
   * Download PDF (Teacher yang mengupload + Admin head branch)
   */
  static async download(req, res, next) {
    try {
      const printId = parseInt(req.params.printId, 10);

      if (isNaN(printId) || printId < 1) {
        return ResponseHelper.error(res, 400, "Invalid print ID");
      }

      const pdfData = await CertificatePdfService.getPdf(printId, req.user.userId, req.user.role);

      // Set header untuk download
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(pdfData.originalFilename)}"`);
      res.setHeader("Content-Length", pdfData.fileSize);
      res.setHeader("X-Certificate-Number", pdfData.printRecord.certificate_number);

      // Stream file ke response
      const fs = require("fs");
      const fileStream = fs.createReadStream(pdfData.filePath);

      fileStream.on("error", (streamError) => {
        console.error("[PDF] Stream error:", streamError.message);
        // Header belum dikirim — bisa kirim error response
        if (!res.headersSent) {
          return ResponseHelper.error(res, 500, "Failed to stream PDF file");
        }
        res.destroy();
      });

      fileStream.pipe(res);
    } catch (error) {
      const clientErrors = [
        "Print record not found",
        "Access denied to this print record",
        "Access denied. You can only access your own PDF",
        "PDF not found for this print record",
        "PDF file not found on server",
        "User does not have an assigned branch",
      ];

      if (clientErrors.includes(error.message)) {
        const statusCode = error.message.includes("Access denied") ? 403 : 404;
        return ResponseHelper.error(res, statusCode, error.message);
      }

      next(error);
    }
  }

  /**
   * DELETE /certificates/prints/:printId/pdf
   * Hapus PDF (Teacher yang mengupload saja)
   */
  static async remove(req, res, next) {
    try {
      const printId = parseInt(req.params.printId, 10);

      if (isNaN(printId) || printId < 1) {
        return ResponseHelper.error(res, 400, "Invalid print ID");
      }

      await CertificatePdfService.deletePdf(printId, req.user.userId);

      return ResponseHelper.success(res, 200, "PDF deleted successfully");
    } catch (error) {
      const clientErrors = ["Print record not found", "Access denied to this print record", "Access denied. You can only delete PDF for your own prints", "PDF not found for this print record", "User does not have an assigned branch"];

      if (clientErrors.includes(error.message)) {
        const statusCode = error.message.includes("Access denied") ? 403 : 404;
        return ResponseHelper.error(res, statusCode, error.message);
      }

      next(error);
    }
  }

  /**
   * GET /certificates/prints/pdfs
   * List semua PDF dalam scope head branch (Admin only)
   */
  static async list(req, res, next) {
    try {
      const { page, limit, teacherId } = req.query;

      const result = await CertificatePdfService.listPdfs(req.user.userId, {
        page: page ? parseInt(page, 10) : undefined,
        limit: limit ? parseInt(limit, 10) : undefined,
        teacherId: teacherId ? parseInt(teacherId, 10) : undefined,
      });

      return ResponseHelper.success(res, 200, "PDFs retrieved successfully", result);
    } catch (error) {
      if (error.message === "User does not have an assigned branch") {
        return ResponseHelper.error(res, 400, error.message);
      }
      next(error);
    }
  }
}

module.exports = CertificatePdfController;
