const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder().setName("vote").setDescription("Vote for the discord bot"),
  async execute(interaction) {
    await interaction.reply({
      content: "Vote for the bot on [Devlyn Labs](https://bugs.ziggymc.me/vote).",
      flags: 64,
    }),
      } catch (error) {
        await interaction.reply({
          content: `An error has occured, ${error.message} Please run this command again. If this issue persists, report it to the support server: https://bugs.ziggymc.me/support`,
          flags: 64,
        });
    }
  },
};
