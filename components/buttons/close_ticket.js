const { EmbedBuilder } = require("discord.js");
const Ticket = require("../../Schemas.js/Ticket");
const TicketPanel = require("../../Schemas.js/TicketPanel");

module.exports = {
  customId: "close_ticket",

  async execute(interaction) {
    if (!interaction.channel.name.startsWith("ticket-")) {
      return interaction.reply({
        content: "❌ This is not a ticket channel.",
        ephemeral: true
      });
    }

    const ticketDoc = await Ticket.findOne({
      guildId: interaction.guild.id,
      channelId: interaction.channel.id,
      closed: false
    });

    if (!ticketDoc) {
      return interaction.reply({
        content: "❌ Ticket data not found.",
        ephemeral: true
      });
    }

    // Mark ticket as closed
    ticketDoc.closed = true;
    ticketDoc.closedBy = interaction.user.id;
    ticketDoc.closedAt = new Date();
    await ticketDoc.save();

    await interaction.reply("🔒 Closing ticket and generating transcript...");

    // Fetch panel config
    const panel = await TicketPanel.findOne({ guildId: interaction.guild.id });
    if (!panel || !panel.logChannel) return console.error("Log channel not configured");
    const logChannel = interaction.guild.channels.cache.get(panel.logChannel);
    if (!logChannel) return console.error("Log channel not found");

    // Fetch messages
    const messages = await interaction.channel.messages.fetch({ limit: 100 });

    // Build transcript including embeds
    const transcript = messages
      .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
      .map(m => {
        const time = m.createdAt.toLocaleString();
        const author = m.author?.tag || "Unknown";
        const content = m.content || "";
        let embedText = "";

        if (m.embeds.length) {
          embedText = m.embeds
            .map((e, i) => {
              const title = e.title ? `Title: ${e.title}\n` : "";
              const description = e.description ? `Description: ${e.description}\n` : "";
              const fields = e.fields?.length
                ? e.fields.map(f => `${f.name}: ${f.value}`).join("\n")
                : "";
              return `[Embed ${i + 1}]\n${title}${description}${fields}`;
            })
            .join("\n");
        }

        return `[${time}] ${author}: ${content}${embedText ? `\n${embedText}` : ""}`;
      })
      .join("\n");

    // Create transcript file
    const buffer = Buffer.from(transcript || "No messages found.", "utf-8");

    // Log embed
    const embed = new EmbedBuilder()
      .setTitle("🎫 Ticket Closed")
      .addFields(
        { name: "Ticket", value: interaction.channel.name, inline: true },
        { name: "User", value: `<@${ticketDoc.userId}>`, inline: true },
        { name: "Closed By", value: interaction.user.tag, inline: true },
        { name: "Closed At", value: `<t:${Math.floor(Date.now() / 1000)}:F>` }
      )
      .setColor(0xff0000)
      .setTimestamp();

    // Send transcript to log channel
    await logChannel.send({
      embeds: [embed],
      files: [
        {
          attachment: buffer,
          name: `${interaction.channel.name}-transcript.txt`
        }
      ]
    });

    await Ticket.deleteOne({ _id: ticketDoc._id });

    // Delete ticket channel after delay
    setTimeout(() => {
      interaction.channel.delete().catch(() => {});
    }, 5000);
  }
};