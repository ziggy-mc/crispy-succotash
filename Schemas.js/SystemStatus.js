const mongoose = require("mongoose");

const SystemStatusSchema = new mongoose.Schema({
  systemId: { type: String, required: true, unique: true },
  type: { type: String, enum: ["command", "event"], required: true },
  status: {
    type: String,
    enum: ["OPERATIONAL", "DEGRADED", "MINOR", "CRITICAL", "OFFLINE"],
    default: "OPERATIONAL",
  },
  responseTime: { type: Number, default: 0 },
  lastUpdated: { type: Date, default: Date.now },
});

module.exports = mongoose.model("SystemStatus", SystemStatusSchema);
