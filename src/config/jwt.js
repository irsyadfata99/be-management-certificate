require("dotenv").config();

// Validate JWT secrets on startup - PRODUCTION CRITICAL
if (!process.env.JWT_ACCESS_SECRET) {
  throw new Error("❌ FATAL: JWT_ACCESS_SECRET is not set in environment variables.\n" + "Generate one with: node -e \"console.log(require('crypto').randomBytes(64).toString('hex'))\"");
}

if (!process.env.JWT_REFRESH_SECRET) {
  throw new Error("❌ FATAL: JWT_REFRESH_SECRET is not set in environment variables.\n" + "Generate one with: node -e \"console.log(require('crypto').randomBytes(64).toString('hex'))\"");
}

// Validate secrets are not default/weak values
const FORBIDDEN_SECRETS = ["your-access-token-secret-key-change-in-production", "your-refresh-token-secret-key-change-in-production", "secret", "password", "123456", "admin123"];

if (FORBIDDEN_SECRETS.includes(process.env.JWT_ACCESS_SECRET)) {
  throw new Error("❌ FATAL: JWT_ACCESS_SECRET is using a default/weak value. Must be cryptographically secure.");
}

if (FORBIDDEN_SECRETS.includes(process.env.JWT_REFRESH_SECRET)) {
  throw new Error("❌ FATAL: JWT_REFRESH_SECRET is using a default/weak value. Must be cryptographically secure.");
}

// Minimum secret length validation (64 chars = 32 bytes hex)
if (process.env.JWT_ACCESS_SECRET.length < 32) {
  throw new Error("❌ FATAL: JWT_ACCESS_SECRET is too short. Must be at least 32 characters (64+ recommended).");
}

if (process.env.JWT_REFRESH_SECRET.length < 32) {
  throw new Error("❌ FATAL: JWT_REFRESH_SECRET is too short. Must be at least 32 characters (64+ recommended).");
}

const jwtConfig = {
  // Access token configuration
  accessToken: {
    secret: process.env.JWT_ACCESS_SECRET,
    expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || "15m", // 15 minutes
  },

  // Refresh token configuration
  refreshToken: {
    secret: process.env.JWT_REFRESH_SECRET,
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "7d", // 7 days
  },

  // Token options
  options: {
    issuer: "saas-certificate-api",
    audience: "saas-certificate-client",
  },
};

module.exports = jwtConfig;
