const DataDeleteRequest = require("../../Schemas.js/DataDeleteRequest");

// 🔥 IMPORT SAME SCHEMAS
const User = require("../../Schemas.js/User");
const MCConnect = require("../../Schemas.js/McConnect");
const Tickets = require("../../Schemas.js/Ticket");
const mcqueue = require("../../Schemas.js/McQueue");
const mod = require("../../Schemas.js/Moderation");
const support = require("../../Schemas.js/Supporter");

// SAME STRUCTURE
const ALL_MODELS = [
  { name: "User Profile", model: User },
  { name: "Linked Minecraft Account", model: MCConnect },
  { name: "Tickets", model: Tickets },
  { name: "Minecraft", model: mcqueue },
  { name: "Punishments", model: mod },
  { name: "Patreon", model: support },
];

const PROTECTED_MODELS = [
  "Tickets",
  "Minecraft",
  "Punishments",
  "Patreon",
];

function buildQuery(userId) {
  return {
    $or: [
      { userId: userId },
      { userID: userId },
      { discordId: userId },
      { ownerId: userId },
    ],
  };
}

module.exports = {
  customId: "deletedata",

  async execute(interaction) {
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;

    // 🔍 VERIFY REQUEST EXISTS
    const request = await DataDeleteRequest.findOne({
      guildId,
      userId,
    });

    if (!request) {
      return interaction.update({
        content: "❌ This request is invalid or expired.",
        ephemeral: true,
        components: [],
      });
    }

    await interaction.update({
      content: "🗑️ Deleting your data...",
      ephemeral: true,
      components: [],
    });

    let deletedLog = [];

    for (const entry of ALL_MODELS) {
      try {
        const { name, model } = entry;

        if (PROTECTED_MODELS.includes(name)) continue;

        const res = await model.deleteMany(buildQuery(userId));

        if (res.deletedCount > 0) {
          deletedLog.push(`• ${name}: ${res.deletedCount} deleted`);
        }
      } catch (err) {
        console.error(`[DATA DELETE ERROR] ${entry.name}`, err);
      }
    }

    // 🧹 DELETE REQUEST ENTRY
    await DataDeleteRequest.deleteOne({
      guildId,
      userId,
    });

    await interaction.editReply({
      content:
        "✅ **Your data has been deleted.**\n\n" +
        (deletedLog.length > 0
          ? deletedLog.join("\n")
          : "No data was found to delete."),
    });
  },
};
