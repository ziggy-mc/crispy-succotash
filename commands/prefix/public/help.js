const { PermissionFlagsBits } = require("discord.js");

module.exports = {
  name: "help",
  description: "Is just the help command just in a prefix",
  permissions: {
    user: [],
    bot: [PermissionFlagsBits.ReadMessageHistory],
  },
  cooldown: "2s",
  execute: async (message, args, client) => {
    const sentMessage = await message.reply("Loading...");

    sentMessage.edit(`The help command has not been made yet.\nThe ETA of this command being ready: "November 1, 2025"`);
  },
};
