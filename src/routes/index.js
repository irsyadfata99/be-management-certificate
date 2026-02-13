const express = require("express");
const router = express.Router();

const authRoutes = require("./authRoutes");
const branchRoutes = require("./branchRoutes");
const divisionRoutes = require("./divisionRoutes");
const teacherRoutes = require("./teacherRoutes");
const teacherProfileRoutes = require("./teacherProfileRoutes");
const moduleRoutes = require("./moduleRoutes");
const certificateRoutes = require("./certificateRoutes");
const studentRoutes = require("./studentRoutes");
const backupRoutes = require("./backupRoutes");
const certificatePdfRoutes = require("./certificatePdfRoutes");
const healthRoutes = require("./healthRoutes");

// Mount routes
router.use("/auth", authRoutes);
router.use("/branches", branchRoutes);
router.use("/divisions", divisionRoutes);

// FIX POINT 1: /teachers/profile HARUS didaftarkan SEBELUM /teachers
// Jika dibalik, Express akan menangkap semua /teachers/profile/* di teacherRoutes lebih dulu
router.use("/teachers/profile", teacherProfileRoutes);
router.use("/teachers", teacherRoutes);

router.use("/modules", moduleRoutes);
router.use("/certificates", certificateRoutes);
router.use("/certificates", certificatePdfRoutes);
router.use("/students", studentRoutes);
router.use("/backup", backupRoutes);
router.use("/health", healthRoutes);

// API info
router.get("/", (req, res) => {
  res.json({
    success: true,
    message: "SaaS Certificate Management API",
    version: "1.0.0",
    endpoints: {
      auth: "/api/auth",
      branches: "/api/branches",
      divisions: "/api/divisions",
      teachers: "/api/teachers",
      teacherProfile: "/api/teachers/profile",
      modules: "/api/modules",
      certificates: "/api/certificates",
      students: "/api/students",
      backup: "/api/backup",
      health: "/api/health",
    },
  });
});

module.exports = router;
