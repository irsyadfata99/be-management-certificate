global.testUtils = {
  validPassword: "TestPass123!",
  invalidPassword: "weak",

  generateUsername: (prefix = "test") => {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  },

  generateBranchCode: () => {
    return `TST${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
  },
};
