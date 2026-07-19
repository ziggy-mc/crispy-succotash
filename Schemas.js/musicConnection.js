const mongoose = require("mongoose");

const musicConnectionSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true },
  connected: { type: Boolean, default: false },
  lastActive: { type: Date, default: Date.now },
});

module.exports = mongoose.model("MusicConnection", musicConnectionSchema);
