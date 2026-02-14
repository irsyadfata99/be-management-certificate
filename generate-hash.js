const bcrypt = require("bcryptjs");

async function generateHash() {
  const password = "admin123";
  const hash = await bcrypt.hash(password, 10);

  console.log("\n=== COPY HASH INI ===");
  console.log(hash);
  console.log("=====================\n");

  // Test verify
  const isValid = await bcrypt.compare(password, hash);
  console.log("Verification test:", isValid ? "✓ VALID" : "✗ FAILED");
}

generateHash();
