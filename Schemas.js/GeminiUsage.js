const mongoose = require("mongoose");

const GeminiUsageSchema = new mongoose.Schema({
  userId: { type: String, unique: true },
  dailyUses: { type: Number, default: 0 },
  monthlyUses: { type: Number, default: 0 },
  lastDailyReset: String, // YYYY-MM-DD EDT
  lastMonthlyReset: String, // YYYY-MM EDT
});

module.exports = mongoose.model("GeminiUsage", GeminiUsageSchema);
