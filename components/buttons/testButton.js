module.exports = {
  customId: "clickMe",
  cooldown: "5s",
  execute(interaction, client) {
    interaction.reply({ content: "Button clicked!", components: [] });
  },
};