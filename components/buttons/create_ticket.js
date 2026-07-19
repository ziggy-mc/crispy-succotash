const {
  ChannelType,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require("discord.js");

const TicketPanel = require("../../Schemas.js/TicketPanel");
const Ticket = require("../../Schemas.js/Ticket");

module.exports = {
  customId: "create_ticket",
  async execute(interaction) {
    // Check for existing open ticket
    const existingTicket = await Ticket.findOne({
      guildId: interaction.guild.id,
      userId: interaction.user.id,
      closed: false
    });

    if (existingTicket) {
      const channel = interaction.guild.channels.cache.get(existingTicket.channelId);
      return interaction.reply({
        content: `❌ You already have an open ticket: ${channel ?? "Unknown channel"}`,
        ephemeral: true
      });
    }

    await interaction.reply({
      content: "🎫 Creating your ticket...",
      ephemeral: true
    });

    const panel = await TicketPanel.findOneAndUpdate(
      { guildId: interaction.guild.id },
      { $inc: { ticketCounter: 1 } },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true
      }
    );

    const ticketNumber = Number(panel.ticketCounter);
    const formatted = String(ticketNumber).padStart(4, "0");

    const staffRole = interaction.guild.roles.cache.get(panel.staffRole);
    const category = interaction.guild.channels.cache.get(panel.category);

    if (!staffRole) {
      return interaction.editReply({
        content: "❌ Staff role not configured.",
        ephemeral: true
      });
    }

    const channel = await interaction.guild.channels.create({
      name: `ticket-${formatted}`,
      type: ChannelType.GuildText,
      parent: category?.id,
      topic: interaction.user.id,
      permissionOverwrites: [
        {
          id: interaction.guild.id,
          deny: [PermissionFlagsBits.ViewChannel]
        },
        {
          id: interaction.user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory
          ]
        },
        {
          id: staffRole.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory
          ]
        }
      ]
    });

    await Ticket.create({
      guildId: interaction.guild.id,
      channelId: channel.id,
      userId: interaction.user.id,
      ticketNumber
    });

    const embed = new EmbedBuilder()
      .setTitle(`Ticket #${formatted}`)
      .setDescription(`Welcome ${interaction.user}!\n\nPlease describe your issue.`)
      .setColor(0x00ffff);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("close_ticket")
        .setLabel("🔒 Close Ticket")
        .setStyle(ButtonStyle.Danger)
    );

    await channel.send({
      content: `${interaction.user} ${staffRole}`,
      embeds: [embed],
      components: [row]
    });

    await interaction.editReply({
      content: `✅ Ticket created: ${channel}`,
      ephemeral: true
    });
  }
};