const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
    discordId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    discordUsername: {
        type: String,
        required: true
    },

    beatleader: {
        userId: String,
        username: String,
        authenticated: {
            type: Boolean,
            default: false
        },
        connectedAt: Date,
        tokens: {
            accessToken: String,
            refreshToken: String,
            expiresAt: Date
        }
    },

    // --- Minecraft Linking ---
    mcUsername: { 
        type: String 
    },
    mcUuid: { 
        type: String 
    },
    linked: { 
        type: Boolean, 
        default: false 
    },
    mcConnectedAt: { 
        type: Date 
    }

}, {
    timestamps: true
});

module.exports = mongoose.models.User || mongoose.model("User", userSchema);
