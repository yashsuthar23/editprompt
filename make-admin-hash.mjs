// Usage: node make-admin-hash.mjs "YourStrongPassword"
// Prints the ADMIN_PASSWORD_HASH line to paste into .env (so the password itself is never stored).
import crypto from "node:crypto";

const password = process.argv[2];

if (!password || password.length < 8) {
  console.log('Usage: node make-admin-hash.mjs "YourStrongPassword"  (min 8 characters)');
  process.exit(1);
}

const salt = crypto.randomBytes(16);
const key = crypto.scryptSync(password, salt, 64);

console.log(`ADMIN_PASSWORD_HASH=scrypt:${salt.toString("hex")}:${key.toString("hex")}`);
