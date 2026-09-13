// Schemas/guildConfig.js
const mongoose = require("mongoose");

const guildConfigSchema = new mongoose.Schema({
  guildId:           { type: String, required: true, unique: true },
  pingTracking:      { type: Boolean, default: false },
  bugForumChannelId: { type: String, default: null }, // forum channel to watch for bug threads
  bugStaffRoleId:    { type: String, default: null },  // role allowed to manage bugs
  bugPingRoleId:     { type: String, default: null },  // role to ping in thread when a new bug is reported

  // Bug tracker Discord forum status tags
  bugReceivedTagId:   { type: String, default: null },
  bugInProgressTagId: { type: String, default: null },
  bugResolvedTagId:   { type: String, default: null },
});

module.exports = mongoose.model("GuildConfig", guildConfigSchema);
