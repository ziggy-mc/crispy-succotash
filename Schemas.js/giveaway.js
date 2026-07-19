const mongoose = require('mongoose');

const giveawaySchema = new mongoose.Schema({
    giveawayId: {
        type: String,
        required: true,
        unique: true
    },
    guildId: {
        type: String,
        required: true
    },
    messageId: {
        type: String,
        required: true
    },
    prize: {
        type: String,
        required: true
    },
    hostId: {
        type: String,
        required: true
    },
    rerollCount: {
        type: Number,
        default: 0
    },
    entrants: {
        type: [String], // Array of Discord user IDs
        default: []
    },
    winnersByRound: {
        type: [
            {
                round: {
                    type: Number,
                    required: true
                },
                newWinners: {
                    type: [String], // Discord user IDs
                    required: true
                },
                replacedWinners: {
                    type: [String], // Discord user IDs from previous round
                    required: true
                }
            }
        ],
        default: []
    },
    ended: {
        type: Boolean,
        default: false
    },
    endTimestamp: {
        type: Number
    },
    createdAt: {
  type: Date,
  default: Date.now,
  expires: 60 * 60 * 24 * 30 }
});

module.exports = mongoose.model('Giveaway', giveawaySchema);
