const mongoose = require('mongoose');

const levelSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  userId: { type: String, required: true },
  xp: { type: Number, default: 0 },
  level: { type: Number, default: 0 }
});

module.exports = mongoose.models.Level || mongoose.model('Level', levelSchema);
