const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('uptime')
    .setDescription('Shows how long the bot has been online.'),
  async execute(interaction) {
    const uptimeEmbed = createUptimeEmbed();

    const row = new ActionRowBuilder().addComponents([
      new ButtonBuilder()
        .setCustomId("refresh_uptime")
        .setLabel('🔄 Refresh')
        .setStyle(ButtonStyle.Primary)
    ]);

    await interaction.reply({ embeds: [uptimeEmbed], components: [row], flags: 64 });
  }
};

function createUptimeEmbed() {
  const totalSeconds = Math.floor(process.uptime());
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);

  return new EmbedBuilder()
    .setColor(0x00ff99)
    .setTitle('🟢 Bot Uptime')
    .setDescription(`The bot has been online for **${parts.join(' ')}**.`)
    .setTimestamp();
}

module.exports.createUptimeEmbed = createUptimeEmbed; // Export helper for reuse
