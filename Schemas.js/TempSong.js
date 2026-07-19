const mongoose = require("mongoose");

const songSchema = new mongoose.Schema({
  name: String, // Song title
  filePath: String, // e.g., /mssongs/song.mp3
  addedBy: String, // User ID
  guildId: String, // Guild ID (if per server)
  expiresAt: Date, // Timestamp for deletion
  played: { type: Boolean, default: false },
});

module.exports = mongoose.model("TempSong", songSchema);
