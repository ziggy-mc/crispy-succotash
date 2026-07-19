const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  guildId: String,
  userId: String,
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 300 // ⏱️ auto delete after 5 minutes (optional but smart)
  }
});

module.exports = mongoose.model("DataDeleteRequest", schema);
