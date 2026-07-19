const DataDeleteRequest = require("../../Schemas.js/DataDeleteRequest");

module.exports = {
  customId: "canceldeletedata",

  async execute(interaction) {
    await DataDeleteRequest.deleteOne({
      guildId: interaction.guild.id,
      userId: interaction.user.id,
    });

    await interaction.update({
      content: "❌ Data deletion cancelled.",
      ephemeral: true,
      components: [],
    });
  },
};
