const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder().setName("website").setDescription("Get the link to the MUIZI Tracker website!"),
  async execute(interaction) {
    try {
      // Reply to the interaction
      await interaction.reply({
        content: "Here is the link! https://mtr.evtrg.com",
        flags: 64,
      });
    } catch (error) {
      await interaction.reply({
        content: `An error has occured, ${error.message}
                Please run this command again. If this issue persists, report it to the support server: https://mtr.evtrg.com/support`,
        flags: 64,
      });
    }
  },
};
