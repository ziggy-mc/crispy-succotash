module.exports = {
  customId: "testMenu",
  execute(interaction, client) {
    const values = interaction.values;
    if (values.includes("option1")) {
      interaction.reply({ content: "You selected Option 1!" });
    } else if (values.includes("option2")) {
      interaction.reply({ content: "You selected Option 2!" });
    } else if (values.includes("option3")) {
      interaction.reply({ content: "You selected Option 3!" });
    } else {
      interaction.reply({ content: "You didn't select a valid option!" });
    }
  },
};