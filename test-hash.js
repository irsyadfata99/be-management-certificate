// test-hash.js
const bcrypt = require("bcryptjs"); // atau bcryptjs, sesuai yang dipakai backend

async function test() {
  const hash = await bcrypt.hash("admin123", 10);
  console.log("Hash baru:", hash);

  // ambil hash dari DB dulu
  const hashFromDb = "$2b$10$ZenUDfCLAP.AkoYNk1DotO24CkbBDid4X95w57517PF.G9qIewibS";
  const match = await bcrypt.compare("admin123", hashFromDb);
  console.log("Match:", match); // harus true
}

test();
