const { Schema, model } = require("mongoose");

const supporterSchema = new Schema({
  userId: { type: String, required: true, unique: true },
  username: { type: String, required: true },
  roleId: { type: String, required: true },
  roleName: { type: String, required: true },
  addedAt: { type: Date, default: Date.now }
});

module.exports = model("Supporter", supporterSchema);