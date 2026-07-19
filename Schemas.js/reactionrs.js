const { model, Schema } = require("mongoose");

const reactionSchema = new Schema({
    Guild: String,
    Message: String,
    Emoji: String,
    Role: String,
});

module.exports = model("rrs", reactionSchema);