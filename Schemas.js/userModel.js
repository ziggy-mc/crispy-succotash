const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    tier: { type: String, default: 'free' }, // 'free' or 'paid'
    skips: { type: Number, default: 5 },
    boostedGuild: { type: String, default: null },
    lastSkipReset: { type: Date, default: Date.now },
});

module.exports = mongoose.model('uuser', userSchema);
