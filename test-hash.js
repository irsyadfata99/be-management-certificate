// test-hash.js
const bcrypt = require("bcryptjs"); // atau bcryptjs, sesuai yang dipakai backend

async function test() {
  const hash = await bcrypt.hash("admin123", 10);
  console.log("Hash baru:", hash);

  // ambil hash dari DB dulu
  const hashFromDb =
    "$2a$10$rOZSD6KrqTWEXhXt.zHyDOH7LKZd.Cr7yRJJlNBLfVIKk8U8HJbRK";
  const match = await bcrypt.compare("admin123", hashFromDb);
  console.log("Match:", match); // harus true
}

test();
