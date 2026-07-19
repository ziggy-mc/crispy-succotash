// Schemas.js/afk.js
const { Schema, model } = require('mongoose');

const afkSchema = new Schema({
  userId: { type: String, required: true, unique: true },
  reason: { type: String, default: 'AFK' },
  timestamp: { type: Date, default: Date.now },
  createdAt: {
  type: Date,
  default: Date.now,
  expires: 60 * 60 * 24 * 30 }
});

module.exports = model('AFK', afkSchema);
