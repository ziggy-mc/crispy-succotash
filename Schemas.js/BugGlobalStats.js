const mongoose = require('mongoose');

const bugGlobalStatsSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true, default: 'global' },
    totalCreated: { type: Number, default: 0 },
    totalOpen: { type: Number, default: 0 },
    totalResolved: { type: Number, default: 0 },
    totalQueued: { type: Number, default: 0 },
    updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.models.BugGlobalStats || mongoose.model('BugGlobalStats', bugGlobalStatsSchema);
