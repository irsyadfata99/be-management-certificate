const express = require("express");
const router = express.Router();
const CertificatePdfController = require("../controller/certificatePdfController");
const authMiddleware = require("../middleware/authMiddleware");
const { requireAdmin, requireRole } = require("../middleware/roleMiddleware");
const { uploadPdf, requireFile } = require("../middleware/uploadMiddleware");

router.get(
  "/prints/pdfs",
  authMiddleware,
  requireAdmin,
  CertificatePdfController.list,
);

router.post(
  "/prints/:printId/pdf",
  authMiddleware,
  requireRole(["teacher"]),
  uploadPdf,
  requireFile,
  CertificatePdfController.upload,
);

router.get(
  "/prints/:printId/pdf",
  authMiddleware,
  requireRole(["superAdmin", "admin", "teacher"]),
  CertificatePdfController.download,
);

router.delete(
  "/prints/:printId/pdf",
  authMiddleware,
  requireRole(["teacher"]),
  CertificatePdfController.remove,
);

module.exports = router;
