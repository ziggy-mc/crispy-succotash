// Schemas/Ticket.js
const { Schema, model } = require("mongoose");

const ticketSchema = new Schema({
  guildId: { type: String, required: true },
  channelId: { type: String, required: true },
  userId: { type: String, required: true },
  ticketNumber: { type: Number, default: 0, required: true },
  closed: { type: Boolean, default:  false },
  closedBy: String,
  claimedBy: String,
  createdAt: { type: Date, default: Date.now },
  closedAt: Date,
});

module.exports = model("Ticket", ticketSchema);