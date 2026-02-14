/**
 * Test Setup
 * Runs before all tests
 */

// Set test environment variables
process.env.NODE_ENV = "test";
process.env.PORT = "5001";
process.env.DB_NAME = "saas_certificate_test";
process.env.JWT_ACCESS_SECRET = "test-access-secret-key";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret-key";
process.env.JWT_ACCESS_EXPIRES_IN = "15m";
process.env.JWT_REFRESH_EXPIRES_IN = "7d";
process.env.CORS_ORIGIN = "*";
process.env.IP_WHITELIST_ENABLED = "false";

// Increase timeout for database operations
jest.setTimeout(10000);

// Global test utilities
global.testUtils = {
  validPassword: "TestPass123!",
  invalidPassword: "weak",

  // Helper to generate unique username
  generateUsername: (prefix = "test") => {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  },

  // Helper to generate unique branch code
  generateBranchCode: () => {
    return `TST${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
  },
};
