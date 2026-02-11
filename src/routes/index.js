const express = require("express");
const router = express.Router();

// Import route modules
const authRoutes = require("./authRoutes");

// API routes
router.use("/auth", authRoutes);

// Health check route
router.get("/health", (req, res) => {
  res.json({
    success: true,
    message: "API is running",
    timestamp: new Date().toISOString(),
  });
});

// API info route
router.get("/", (req, res) => {
  res.json({
    success: true,
    message: "SaaS Certificate Management API",
    version: "1.0.0",
    endpoints: {
      auth: "/api/auth",
      health: "/api/health",
    },
  });
});

module.exports = router;
