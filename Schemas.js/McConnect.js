// Schemas.js/mcConnect.js
const mongoose = require("mongoose");

const mcConnectSchema = new mongoose.Schema({
  mcUsername: { type: String, required: true, unique: true },
  uuid: { type: String, required: true }, // Minecraft UUID
  displayName: { type: String, required: true },
  firstJoin: { type: Date, required: true },
  linked: { type: Boolean, default: true },
  update: { type: Boolean, default: false },
  luckpermsRank: { type: String, default: "default" }, // optional rank
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('McConnect', mcConnectSchema, 'mcConnect');
