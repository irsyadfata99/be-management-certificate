const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const ResponseHelper = require("../utils/responseHelper");

// ─── Upload Directory ─────────────────────────────────────────────────────

const UPLOAD_DIR = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.join(__dirname, "../../uploads");

const PDF_SUBDIR = path.join(UPLOAD_DIR, "certificates");

// Buat folder jika belum ada
[UPLOAD_DIR, PDF_SUBDIR].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`[Upload] Created directory: ${dir}`);
  }
});

// ─── Constants ────────────────────────────────────────────────────────────

const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const ALLOWED_MIMETYPE = "application/pdf";
const ALLOWED_EXTENSION = ".pdf";

// ─── Storage Configuration ────────────────────────────────────────────────

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, PDF_SUBDIR);
  },

  filename: (_req, _file, cb) => {
    // Simpan dengan UUID agar tidak ada konflik nama & aman dari path traversal
    const uniqueName = `${crypto.randomUUID()}${ALLOWED_EXTENSION}`;
    cb(null, uniqueName);
  },
});

// ─── File Filter ──────────────────────────────────────────────────────────

const fileFilter = (_req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const isValidMime = file.mimetype === ALLOWED_MIMETYPE;
  const isValidExt = ext === ALLOWED_EXTENSION;

  if (isValidMime && isValidExt) {
    cb(null, true);
  } else {
    cb(new Error("Only PDF files are allowed"), false);
  }
};

// ─── Multer Instance ──────────────────────────────────────────────────────

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
    files: 1,
  },
});

// ─── Middleware Wrapper ───────────────────────────────────────────────────

const uploadPdf = (req, res, next) => {
  const multerSingle = upload.single("pdf");

  multerSingle(req, res, (err) => {
    if (!err) return next();

    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return ResponseHelper.error(
          res,
          400,
          `File size exceeds the ${MAX_FILE_SIZE_MB}MB limit`,
        );
      }
      if (err.code === "LIMIT_UNEXPECTED_FILE") {
        return ResponseHelper.error(
          res,
          400,
          'Unexpected field. Use "pdf" as the field name',
        );
      }
      return ResponseHelper.error(res, 400, `Upload error: ${err.message}`);
    }

    if (err.message === "Only PDF files are allowed") {
      return ResponseHelper.error(res, 400, err.message);
    }

    // Unexpected error
    console.error("[Upload] Unexpected multer error:", err);
    return ResponseHelper.error(res, 500, "File upload failed");
  });
};

const requireFile = (req, res, next) => {
  if (!req.file) {
    return ResponseHelper.error(res, 400, "PDF file is required");
  }
  next();
};

const deleteFile = (filePath) => {
  if (!filePath) return;
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.error(`[Upload] Failed to delete file ${filePath}:`, error.message);
  }
};

module.exports = {
  uploadPdf,
  requireFile,
  deleteFile,
  PDF_SUBDIR,
};
