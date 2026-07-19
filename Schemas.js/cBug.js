const mongoose = require('mongoose');

const cbugSchema = new mongoose.Schema({
    guildId:       { type: String, required: true },
    bugId:         { type: String, required: true },  // e.g. bug-xkz#4829 — unique per guild (see compound index below)
    threadId:      { type: String, required: true, unique: true }, // Discord thread IDs are globally unique
    originalTitle: { type: String, required: true },
    reporterId:    { type: String, required: true },
    status:        { type: String, enum: ['Open', 'In Progress', 'Resolved'], default: 'Open' },
    isQueued:      { type: Boolean, default: false }, // true = waiting for a slot to open
    resolvedAt:    { type: Date, default: null },
    createdAt:     { type: Date, default: Date.now },
});

// bugId is unique within a guild, not globally
cbugSchema.index({ guildId: 1, bugId: 1 }, { unique: true });

module.exports = mongoose.model('cBug', cbugSchema);