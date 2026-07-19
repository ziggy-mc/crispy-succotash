const mongoose = require('mongoose');

const MiniGiveawaySchema = new mongoose.Schema({
    giveawayId: { type: String, required: true, unique: true },
    guildId: { type: String, required: true },
    channelId: { type: String, required: true },
    messageId: { type: String, required: true },
    prize: { type: String, required: true },
    hostId: { type: String, required: true },
    requiredRole: { type: String, default: null },
    winnerCount: { type: Number, default: 1 },
    entrants: { type: [String], default: [] },
    endAt: { type: Number, required: true },
    ended: { type: String, required: true }
});

module.exports = mongoose.model('MiniGiveaway', MiniGiveawaySchema);
