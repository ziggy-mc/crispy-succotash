const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require("discord.js");
const os = require("os");
const ms = require("ms");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("info")
    .setDescription("View bot or ping information.")
    .addSubcommand((sub) => sub.setName("ping").setDescription("Check the bot latency."))
    .addSubcommand((sub) => sub.setName("bot").setDescription("Get information about the bot.")),
    settings: { isGlobal: true },

  async execute(interaction, client) {
    const sub = interaction.options.getSubcommand();

    // Helper to get CPU usage (used in ping and bot)
    async function getCpuUsage() {
      const start = os.cpus();
      return new Promise((resolve) => {
        setTimeout(() => {
          const end = os.cpus();
          let idleDiff = 0;
          let totalDiff = 0;
          for (let i = 0; i < start.length; i++) {
            const startTotal = Object.values(start[i].times).reduce((acc, tv) => acc + tv, 0);
            const endTotal = Object.values(end[i].times).reduce((acc, tv) => acc + tv, 0);
            const startIdle = start[i].times.idle;
            const endIdle = end[i].times.idle;
            idleDiff += endIdle - startIdle;
            totalDiff += endTotal - startTotal;
          }
          const usage = 100 - Math.round((100 * idleDiff) / totalDiff);
          resolve(usage);
        }, 500);
      });
    }

    // -------------------- PING --------------------
    if (sub === "ping") {
      await interaction.deferReply({ ephemeral: true });

      const sent = await interaction.fetchReply();
      const roundTrip = sent.createdTimestamp - interaction.createdTimestamp;
      const wsLatency = client.ws.ping;
      const apiLatencyStart = Date.now();
      await client.user.fetch();
      const apiLatency = Date.now() - apiLatencyStart;
      const uptime = ms(client.uptime);
      const cpuUsage = await getCpuUsage();
      const memoryUsed = process.memoryUsage().heapUsed / 1024 / 1024;
      const totalMem = os.totalmem() / 1024 / 1024;
      const memoryUsagePercent = (memoryUsed / totalMem) * 100;
      const totalProcessingPower = ((cpuUsage + memoryUsagePercent) / 2).toFixed(2);

      // Get shard info from process.env
      const shardId = interaction.guild?.shardId ?? 0;
      const shardCount = 
        client.shard?.count ??
        client.options.shardCount ??
        1;
      
      const shardInProcess = client.shard?.ids?.length
        ? client.shard.ids.join(", ")
        : "0";

      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle("🏓 Pong!")
            .setColor(0x00ae86)
            .setFooter({ text: `v1.2.5` })
            .setTimestamp(new Date())
            .addFields(
              { name: "WebSocket Latency", value: `${wsLatency}ms`, inline: true },
              { name: "API Latency", value: `${apiLatency}ms`, inline: true },
              { name: "Roundtrip Latency", value: `${roundTrip}ms`, inline: true },
              { name: "Bot Uptime", value: uptime, inline: true },
              { name: "CPU Usage", value: `${cpuUsage}%`, inline: true },
              { name: "Memory Usage", value: `${memoryUsed.toFixed(2)} MB / ${totalMem.toFixed(2)} MB (${memoryUsagePercent.toFixed(2)}%)`, inline: true },
              { name: "Total Processing Power", value: `${totalProcessingPower}%`, inline: true },
              { name: "Shard", value: `${shardId}`, inline: true }, // <-- Added shard info
              { name: "Total Shards", value: `${shardCount}`, inline: true },
              { name: "Shard IDs Process", value: shardInProcess, inline: true }
            ),
        ],
        flags: 64,
      });
    }

    // -------------------- BOT --------------------
    if (sub === "bot") {
      await interaction.deferReply({ ephemeral: true });
      const uptime = ms(client.uptime);
      const memoryUsed = process.memoryUsage().heapUsed / 1024 / 1024;
      const totalMem = os.totalmem() / 1024 / 1024;
      const cpuUsage = await getCpuUsage();
      const cpus = os.cpus();
      const cpuModel = cpus[0]?.model || "Unknown CPU";
      const cpuCores = cpus.length;

      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle(`Bot Info`)
            .setColor(0x00ae86)
            .setFooter({ text: `v1.2.5` })
            .addFields({ name: "Uptime", value: uptime, inline: true }, { name: "Memory Usage", value: `${memoryUsed.toFixed(2)} MB / ${totalMem.toFixed(2)} MB`, inline: true }, { name: "CPU", value: `${cpuModel} (${cpuCores} cores)`, inline: false }, { name: "CPU Usage", value: `${cpuUsage}%`, inline: true }, { name: "Users", value: `${client.users.cache.size}`, inline: true }, { name: "Servers", value: `${client.guilds.cache.size}`, inline: true }, { name: "Ping", value: `${client.ws.ping}ms`, inline: true }),
        ],
        ephemeral: true,
      });
    }
  },
};
