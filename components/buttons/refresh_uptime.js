const { createUptimeEmbed } = require('../../commands/slash/public/uptime');

module.exports = {
  customId: "refresh_uptime",
  execute: async (interaction, client) => {
    const uptimeEmbed = createUptimeEmbed();
    await interaction.update({ embeds: [uptimeEmbed] });
  },
};
