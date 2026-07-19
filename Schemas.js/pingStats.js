const { Schema, model } = require("mongoose");

const counter = {
  user: { type: Number, default: 0 },
  role: { type: Number, default: 0 },
  everyone: { type: Number, default: 0 }
};

const pingStatsSchema = new Schema({
  guildId: { type: String, required: true, unique: true },

  today: counter,
  week: counter,
  month: counter,
  year: counter,

  lastDay: Date,
  lastWeek: Date,
  lastMonth: Date,
  lastYear: Date
});

module.exports = model("PingStats", pingStatsSchema);
