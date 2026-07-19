const mongoose = require('mongoose');

const bugGuildStatsSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true, index: true },
    totalCreated: { type: Number, default: 0 },
    totalOpen: { type: Number, default: 0 },
    totalResolved: { type: Number, default: 0 },
    totalQueued: { type: Number, default: 0 },
    updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.models.BugGuildStats || mongoose.model('BugGuildStats', bugGuildStatsSchema);
