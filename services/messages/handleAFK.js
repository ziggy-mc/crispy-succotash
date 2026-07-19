const afk = require("../../Schemas.js/afk")

module.exports = async ({ message, client }) => {
  const { author, guild, channel } = message;
  if (!guild || author.bot) return;

  const me = await AFK.findOne({ userId: author.id });
  if (me) {
    const diff = Date.now() - me.timestamp;
    const hrs = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    const parts = [];
    if (hrs) parts.push(`${hrs}h`);
    if (mins) parts.push(`${mins}m`);
    parts.push(`${secs}s`);
    await message.reply({
      content: `👋 Welcome back! You were AFK for **${parts.join(" ")}** (Reason: ${me.reason}).`,
    });
    await AFK.deleteOne({ userId: message.author.id });
  }

  // === 2) MENTIONED AFK USER ===
  const notified = new Set();
  for (const [, user] of message.mentions.users) {
    if (user.bot || notified.has(user.id)) continue;
    const data = await AFK.findOne({ userId: user.id });
    if (data) {
      notified.add(user.id);
      await message.channel.send({
        content: `🔕 **${user.username}** is AFK: ${data.reason}, AFK since ${data.timestamp}.`,
        allowedMentions: { repliedUser: false },
      });
    }
  }
};