const { SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder().setName("test").setDescription("testing"),
  settings: { isDeveloperOnly: true },
  execute: async (interaction, client) => {
    const buttons = new ActionRowBuilder().addComponents([new ButtonBuilder().setCustomId("clickMe").setLabel("Click Me!").setStyle(ButtonStyle.Primary)]);
    const select = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId("testMenu").setPlaceholder("Select me!").setMinValues(1).setMaxValues(1).addOptions(new StringSelectMenuOptionBuilder().setLabel("Option 1").setValue("option1"), new StringSelectMenuOptionBuilder().setLabel("Option 2").setValue("option2"), new StringSelectMenuOptionBuilder().setLabel("Option 3").setValue("option3")));
    await interaction.reply({ content: "Here is a button for you:", components: [buttons, select] });
  },
};