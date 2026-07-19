const { SlashCommandBuilder } = require("discord.js");

module.exports = {
    name: "beta",
    description: "get beta information",
    settings: { isDeveloperOnly: true },
    cooldown: "5s",
    execute: async (interaction, client) => {
        await interaction.reply({ content: `When beta mode is active (you are seeing this command so it is active) that means when you use the bot you automatically agree to these beta terms: https://areospacedb.pages.dev/betatos`, flags: 64 })
    },
};