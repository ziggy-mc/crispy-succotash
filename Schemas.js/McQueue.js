const mongoose = require("mongoose");

const McQueueSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  channelId: { type: String, required: true },
  guildId: { type: String, required: true },

  mcUsername: { type: String, required: true },
  server: { type: String, required: true },

  isPremium: { type: Boolean, default: false },

  position: { type: Number, default: 0 },

  createdAt: { type: Date, default: Date.now },
  processing: { type: Boolean, default: false }
});

module.exports = mongoose.model("McQueue", McQueueSchema);
