// generate-hash.js
// Jalankan: node generate-hash.js
// Letakkan di folder root backend kamu

const bcrypt = require("bcryptjs"); // ganti ke 'bcryptjs' jika pakai bcryptjs

async function generateHashes() {
  const password = "admin123";
  const saltRounds = 10;

  console.log(`\nGenerating bcrypt hashes for password: "${password}"\n`);

  const hash1 = await bcrypt.hash(password, saltRounds);
  const hash2 = await bcrypt.hash(password, saltRounds);
  const hash3 = await bcrypt.hash(password, saltRounds);
  const hash4 = await bcrypt.hash(password, saltRounds);

  console.log("-- Copy hash yang sesuai ke SQL UPDATE di bawah\n");
  console.log(`gem    : ${hash1}`);
  console.log(`gulam  : ${hash2}`);
  console.log(`vormes : ${hash3}`);
  console.log(`rayyan : ${hash4}`);

  // Verify semua hash valid
  const check = await bcrypt.compare(password, hash1);
  console.log(`\nVerifikasi hash: ${check ? "✓ VALID" : "✗ GAGAL"}`);

  console.log("\n-- Jalankan SQL ini di pgAdmin:\n");
  console.log(`UPDATE users SET password = '${hash1}' WHERE username = 'gem';`);
  console.log(`UPDATE users SET password = '${hash2}' WHERE username = 'gulam';`);
  console.log(`UPDATE users SET password = '${hash3}' WHERE username = 'vormes';`);
  console.log(`UPDATE users SET password = '${hash4}' WHERE username = 'rayyan';`);
  console.log("");
}

generateHashes().catch(console.error);
