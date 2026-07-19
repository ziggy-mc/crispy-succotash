// Schemas/TicketPanel.js
const { Schema, model } = require("mongoose");

const ticketPanelSchema = new Schema({
  guildId: { type: String, required: true, unique: true },
  channelId: { type: String, required: true },
  messageId: { type: String, required: true },
  title: { type: String, required:  true },
  description: String,
  footer: String,
  photo: String,
  staffRole: { type: String, required: true },
  logChannel: { type: String, required: true },
  category: { type: String, required:  true },
  ticketCounter:  { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
});

module.exports = model("TicketPanel", ticketPanelSchema);