module.exports = {
  testEnvironment: "node",
  coverageDirectory: "coverage",
  collectCoverageFrom: ["src/**/*.js", "!src/database/**", "!src/routes/index.js", "!src/app.js", "!server.js"],
  testMatch: ["**/__tests__/**/*.test.js"],

  // Exclude file test yang masih kosong
  testPathIgnorePatterns: [
    "node_modules",
    "__tests__/api/teacher.test.js",
    "__tests__/api/student.test.js",
    "__tests__/api/division.test.js",
    "__tests__/api/module.test.js",
    "__tests__/api/logs.test.js",
    "__tests__/api/backup.test.js",
    "__tests__/integrations",
  ],
  setupFiles: ["<rootDir>/jest.globals.js"],
  setupFilesAfterEnv: ["<rootDir>/__tests__/setup.js"],
  verbose: true,
  forceExit: true,
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
  testTimeout: 10000,
};
