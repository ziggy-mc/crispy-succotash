const crypto = require("crypto");

const ALGO = "aes-256-gcm";
const SECRET = Buffer.from(process.env.KEY_ENCRYPTION_SECRET, "hex");

function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, SECRET, iv);
  let enc = cipher.update(text, "utf8", "hex");
  enc += cipher.final("hex");
  return `${iv.toString("hex")}:${cipher.getAuthTag().toString("hex")}:${enc}`;
}

function decrypt(data) {
  const [iv, tag, enc] = data.split(":");
  const decipher = crypto.createDecipheriv(ALGO, SECRET, Buffer.from(iv, "hex"));
  decipher.setAuthTag(Buffer.from(tag, "hex"));
  let dec = decipher.update(enc, "hex", "utf8");
  dec += decipher.final("utf8");
  return dec;
}

module.exports = { encrypt, decrypt };
