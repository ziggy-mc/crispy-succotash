const mongoose = require("mongoose");

const SystemEntrySchema = new mongoose.Schema(
  {
    systemId: { type: String, required: true },
    type: { type: String, enum: ["command", "event"], required: true },
    status: {
      type: String,
      enum: ["OPERATIONAL", "DEGRADED", "MINOR", "CRITICAL", "OFFLINE"],
      default: "OPERATIONAL",
    },
    responseTime: { type: Number, default: 0 },
    lastUpdated: { type: Date, default: Date.now },
  },
  { _id: false }
);

const BotStatusSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  status: { type: String, default: "OPERATIONAL" },
  lastUpdated: { type: Date, default: Date.now },
  summary: {
    operational: { type: Number, default: 0 },
    minor: { type: Number, default: 0 },
    degraded: { type: Number, default: 0 },
    critical: { type: Number, default: 0 },
    offline: { type: Number, default: 0 },
  },
  systems: { type: [SystemEntrySchema], default: [] },
});

module.exports = mongoose.model("BotStatus", BotStatusSchema);
