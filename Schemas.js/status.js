const mongoose = require("mongoose");

// Status DB connection
const statusConnection = mongoose.createConnection(process.env.MONGO_URL, {
  dbName: "statuswebsite", // points specifically to your status database
  bufferCommands: false,
});

const statusSchema = new mongoose.Schema(
  {
    weather: { type: String, default: "No Impact" },
    weathermsg: { type: String, default: "No impact at this time." },
    website: { type: String, default: "Online" },
    websiteMessage: { type: String, default: "All systems operational." },
    api: { type: String, default: "Online" },
    apiMessage: { type: String, default: "All API pings are low." },
    database: { type: String, default: "Online" },
    databaseMessage: { type: String, default: "Our database is currently up." },
    bot: { type: String, default: "Online" },
    botMessage: { type: String, default: "Areospace is currently working." },
  },
  { timestamps: true }
);

// Model only for the status DB
const Status = statusConnection.model("Status", statusSchema);

module.exports = Status;
