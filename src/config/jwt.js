require("dotenv").config();

const jwtConfig = {
  // Access token configuration
  accessToken: {
    secret:
      process.env.JWT_ACCESS_SECRET ||
      "your-access-token-secret-key-change-in-production",
    expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || "15m", // 15 minutes
  },

  // Refresh token configuration
  refreshToken: {
    secret:
      process.env.JWT_REFRESH_SECRET ||
      "your-refresh-token-secret-key-change-in-production",
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "7d", // 7 days
  },

  // Token options
  options: {
    issuer: "saas-certificate-api",
    audience: "saas-certificate-client",
  },
};

module.exports = jwtConfig;
