const mongoose = require('mongoose');

const bugUserDashboardCacheSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true, index: true },
    refreshedAt: { type: Date, default: Date.now },
    data: { type: mongoose.Schema.Types.Mixed, required: true },
});

module.exports = mongoose.models.BugUserDashboardCache || mongoose.model('BugUserDashboardCache', bugUserDashboardCacheSchema);
