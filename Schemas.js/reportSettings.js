const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    channelId: { type: String, required: true },
    roleId: { type: String, default: null }
});

module.exports = mongoose.model('ReportSettings', reportSchema);
