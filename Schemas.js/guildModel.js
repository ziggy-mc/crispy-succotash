const mongoose = require('mongoose');

const guildSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    playlists: [
        { name: String, songs: [{ name: String, url: String }] }
    ],
    queue: [
        { name: String, url: String }
    ],
    boostedUsers: [
        { userId: String, boostedAt: Date }
    ],
    timeoutTimer: { type: Number, default: null }, // Timeout timer for disconnect
});

module.exports = mongoose.model('Guild', guildSchema);
