const mongoose = require("mongoose");

const GuildInfoSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  humans: Number,
  bots: Number,
  textChannels: Number,
  voiceChannels: Number,
  categories: Number,
  roles: Number,
  staticEmojis: Number,
  animatedEmojis: Number,
  boosts: Number,
  premiumTier: Number,
  verificationLevel: String,
  afkTimeout: Number,
  lastUpdated: { type: Date, default: Date.now },
  update: { type: Boolean, default: true } // flag for when front-end requests fresh info
});

module.exports = mongoose.model("GuildInfo", GuildInfoSchema);
