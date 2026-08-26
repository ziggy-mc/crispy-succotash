const { SlashCommandBuilder } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("vote")
        .setDescription("Vote for the Discord bot"),

    async execute(interaction) {
        try {
            await interaction.reply({
                content: "Vote for the bot on [Devlyn Labs](https://bugs.ziggymc.me/vote).",
                flags: 64
            });
        } catch (error) {
            console.error("Vote command error:", error);

            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({
                    content: `An error has occurred: ${error.message}\nPlease run this command again. If this issue persists, report it to the support server: https://bugs.ziggymc.me/support`,
                    flags: 64
                });
            } else {
                await interaction.reply({
                    content: `An error has occurred: ${error.message}\nPlease run this command again. If this issue persists, report it to the support server: https://bugs.ziggymc.me/support`,
                    flags: 64
                });
            }
        }
    }
};
