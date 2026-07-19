const mongoose = require("mongoose");

const UserGeminiKeySchema = new mongoose.Schema({
  userId: { type: String, unique: true },
  encryptedKey: String,
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 60 * 60 * 24 * 30,
  },
});

module.exports = mongoose.model("UserGeminiKey", UserGeminiKeySchema);
