const mongoose = require('mongoose');

const bugUserSettingsSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true, index: true },
    pingOnUpdate: { type: Boolean, default: true },
    dmOnUpdate: { type: Boolean, default: false },
    updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.models.BugUserSettings || mongoose.model('BugUserSettings', bugUserSettingsSchema);
