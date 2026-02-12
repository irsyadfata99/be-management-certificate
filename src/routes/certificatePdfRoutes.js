/**
 * Certificate PDF Routes
 *
 * Endpoints:
 * POST   /certificates/prints/:printId/pdf  — upload PDF (teacher)
 * GET    /certificates/prints/:printId/pdf  — download PDF (teacher + admin)
 * DELETE /certificates/prints/:printId/pdf  — hapus PDF (teacher)
 * GET    /certificates/prints/pdfs          — list semua PDF (admin)
 *
 * Integrasi ke index.js:
 *   const certificatePdfRoutes = require("./certificatePdfRoutes");
 *   router.use("/certificates", certificatePdfRoutes);
 */

const express = require("express");
const router = express.Router();
const CertificatePdfController = require("../controller/certificatePdfController");
const authMiddleware = require("../middleware/authMiddleware");
const { requireAdmin, requireRole } = require("../middleware/roleMiddleware");
const { uploadPdf, requireFile } = require("../middleware/uploadMiddleware");

/**
 * GET /certificates/prints/pdfs
 * List semua PDF dalam scope head branch
 * Harus didefinisikan SEBELUM /:printId agar tidak tertangkap sebagai param
 */
router.get("/prints/pdfs", authMiddleware, requireAdmin, CertificatePdfController.list);

/**
 * POST /certificates/prints/:printId/pdf
 * Upload PDF bukti cetak (Teacher only)
 * Flow: authMiddleware → requireRole → uploadPdf (multer) → requireFile → controller
 */
router.post("/prints/:printId/pdf", authMiddleware, requireRole(["teacher"]), uploadPdf, requireFile, CertificatePdfController.upload);

/**
 * GET /certificates/prints/:printId/pdf
 * Download PDF (Teacher yang mengupload + Admin head branch)
 */
router.get("/prints/:printId/pdf", authMiddleware, requireRole(["superAdmin", "admin", "teacher"]), CertificatePdfController.download);

/**
 * DELETE /certificates/prints/:printId/pdf
 * Hapus PDF (Teacher yang mengupload saja)
 */
router.delete("/prints/:printId/pdf", authMiddleware, requireRole(["teacher"]), CertificatePdfController.remove);

module.exports = router;
