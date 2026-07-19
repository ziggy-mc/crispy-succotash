const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder().setName("help").setDescription("Find out more information about setting up this bot!"),
  async execute(interaction) {
    try {
      // Reply to the interaction
      await interaction.reply({
        content: "This is a public bug tracker bot! Use `/setup forum` to configure it for your server, then users can submit bugs in your configured forum channel. Staff can manage reports with `/manage bug`. For more in dept information, please visit: https://bugs.ziggymc.me/setup",
        flags: 64,
      });
    } catch (error) {
      await interaction.reply({
        content: `${error.message}
                Please run this command again. If this issue persists, report it to the support server: https://bugs.ziggymc.me/support`,
        flags: 64,
      });
    }
  },
};