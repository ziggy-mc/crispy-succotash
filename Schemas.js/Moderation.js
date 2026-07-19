const mongoose = require("mongoose");

const ModerationSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  userId: { type: String, required: true },
  type: { type: String, enum: ["ban", "kick", "timeout"], required: true },
  reason: { type: String, default: "No reason provided" },
  duration: { type: Number }, // milliseconds, only for timeout
  createdAt: { type: Date, default: Date.now },
  processed: { type: Boolean, default: false }, // has the action been applied?
  reverse: { type: Boolean, default: false }, // should we undo the action?
  reverseProcessed: { type: Boolean, default: false }
});

// Automatically delete after 24h of being processed
ModerationSchema.index({ processed: 1, createdAt: 1 }, { expireAfterSeconds: 86400 });

module.exports = mongoose.model("Moderation", ModerationSchema);
