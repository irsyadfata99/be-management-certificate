const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const { errorHandler } = require("./middleware/errorHandler");
const logger = require("./utils/logger");

// Routes
const authRoutes = require("./routes/authRoutes");
const teacherRoutes = require("./routes/teacherRoutes");
const certificateRoutes = require("./routes/certificateRoutes");
const certificateLogRoutes = require("./routes/certificateLogRoutes");
const certificateTeacherRoutes = require("./routes/certificateTeacherRoutes");
const medalRoutes = require("./routes/medalRoutes");
const branchRoutes = require("./routes/branchRoutes");
const divisionRoutes = require("./routes/divisionRoutes");
const moduleRoutes = require("./routes/moduleRoutes");
const studentRoutes = require("./routes/studentRoutes");

const app = express();

// FIX [trust-proxy]: Baca dari env agar fleksibel sesuai infrastruktur.
// Set TRUST_PROXY=1 jika di belakang 1 proxy (Nginx/LB), false jika direct.
const trustProxy = process.env.TRUST_PROXY ?? "1";
app.set(
  "trust proxy",
  trustProxy === "false" ? false : parseInt(trustProxy, 10) || trustProxy,
);

// FIX [cors]: Ganti wildcard "*" dengan whitelist berbasis CORS_ORIGIN env.
// CORS_ORIGIN bisa berisi satu domain atau comma-separated untuk beberapa domain.
// Contoh .env: CORS_ORIGIN=https://app.example.com,https://admin.example.com
const buildCorsOptions = () => {
  const raw = process.env.CORS_ORIGIN || "";

  if (!raw || raw === "*") {
    if (process.env.NODE_ENV === "production") {
      logger.warn(
        "[CORS] CORS_ORIGIN tidak di-set di production — request dari browser akan diblokir. " +
          "Set CORS_ORIGIN=https://yourdomain.com di .env",
      );
      // Blokir semua origin di production jika tidak ada whitelist
      return { origin: false };
    }
    // Di development, izinkan semua
    return { origin: "*", credentials: true };
  }

  const whitelist = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    origin: (origin, callback) => {
      // Izinkan request non-browser (Postman, server-to-server, dll)
      if (!origin) return callback(null, true);
      if (whitelist.includes(origin)) return callback(null, true);
      callback(new Error(`CORS: origin '${origin}' tidak diizinkan`));
    },
    credentials: true,
  };
};

app.use(cors(buildCorsOptions()));
app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

if (process.env.NODE_ENV !== "test") {
  app.use(
    morgan("combined", {
      stream: { write: (msg) => logger.info(msg.trim()) },
    }),
  );
}

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/teachers", teacherRoutes);
app.use("/api/certificates", certificateRoutes);
app.use("/api/certificate-logs", certificateLogRoutes);
app.use("/api/certificate-teacher", certificateTeacherRoutes);
app.use("/api/medals", medalRoutes);
app.use("/api/branches", branchRoutes);
app.use("/api/divisions", divisionRoutes);
app.use("/api/modules", moduleRoutes);
app.use("/api/students", studentRoutes);

// Health check
app.get("/health", (_req, res) => res.json({ status: "ok" }));

// 404
app.use((_req, res) => res.status(404).json({ message: "Route not found" }));

// Error handler (harus setelah semua routes)
app.use(errorHandler);

module.exports = app;
