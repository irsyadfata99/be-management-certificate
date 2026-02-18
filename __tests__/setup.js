/**
 * Test Setup
 * Runs before all tests
 */

// Set test environment variables
process.env.NODE_ENV = "test";
process.env.PORT = "5001";
process.env.DB_NAME = "saas_certificate_test";
process.env.JWT_ACCESS_SECRET =
  "d3053556c9b6b7a719a1ae58e404766221e7e6c811088edcc6579cfb22ffe28f70407f81dbeaa0dba9c74688116a71068b8a87c8d99f8fc13ecdf4b89d35aea2";
process.env.JWT_REFRESH_SECRET =
  "14debccd390d8fa9944fd6e8f89432907ecfaef32af48ad1ea41d679f694a7819293b3a2a85442d8eaabd3026904ca1965e1a717bddc03996b9a4288161bd364";
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
