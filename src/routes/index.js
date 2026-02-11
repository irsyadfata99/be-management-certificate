const express = require("express");
const router = express.Router();

const authRoutes = require("./authRoutes");
const branchRoutes = require("./branchRoutes");
const divisionRoutes = require("./divisionRoutes");
const teacherRoutes = require("./teacherRoutes");
const moduleRoutes = require("./moduleRoutes");
const certificateRoutes = require("./certificateRoutes");
const studentRoutes = require("./studentRoutes");

// Mount routes
router.use("/auth", authRoutes);
router.use("/branches", branchRoutes);
router.use("/divisions", divisionRoutes);
router.use("/teachers", teacherRoutes);
router.use("/modules", moduleRoutes);
router.use("/certificates", certificateRoutes);
router.use("/students", studentRoutes);

// Health check
router.get("/health", (req, res) => {
  res.json({
    success: true,
    message: "API is running",
    timestamp: new Date().toISOString(),
  });
});

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
      modules: "/api/modules",
      certificates: "/api/certificates",
      students: "/api/students",
      health: "/api/health",
    },
  });
});

module.exports = router;
