const Supporter = require("../../Schemas.js/Supporter");

const SUPPORT_ROLE_ID = "1496266281408663804";
const SUPPORT_GUILD_ID = "1493216082608263240";

// 👇 ADD YOUR CHANNEL ID HERE
const SUPPORT_LOG_CHANNEL_ID = "1496266012826533959";

module.exports = {
  name: "guildMemberUpdate",
  async execute(oldMember, newMember) {

    if (newMember.guild.id !== SUPPORT_GUILD_ID) return;

    // 🔥 FORCE FRESH FETCH (this fixes 90% of role update bugs)
    const fetchedOld = oldMember;
    const fetchedNew = await newMember.guild.members.fetch(newMember.id);

    const hadRole = fetchedOld.roles.cache.has(SUPPORT_ROLE_ID);
    const hasRole = fetchedNew.roles.cache.has(SUPPORT_ROLE_ID);

    // 🎉 Subscribed
    if (!hadRole && hasRole) {
      const role = newMember.roles.cache.get(SUPPORT_ROLE_ID);

      const now = new Date();

      await Supporter.findOneAndUpdate(
        { userId: newMember.id },
        {
          userId: newMember.id,
          username: newMember.user.tag,
          roleId: role.id,
          roleName: role.name,
          addedAt: now
        },
        { upsert: true }
      );

      // 📢 Send log message
      try {
        const logChannel = newMember.guild.channels.cache.get(SUPPORT_LOG_CHANNEL_ID);

        if (logChannel) {
          logChannel.send({
            content:
              `🎉 **New Supporter!**\n\n` +
              `👤 User: <@${newMember.id}> (${newMember.user.tag})\n` +
              `💎 Subscription: **${role.name}**\n` +
              `⏱️ Started: <t:${Math.floor(now.getTime() / 1000)}:F>`
          });
        }
      } catch (err) {
        console.error("Failed to send support log:", err);
      }

      try {
        await newMember.send(
          `💙 **Thank you for supporting MUIZI Tracker!**\n\n` +
          `You are now a **${role.name}**.\n` +
          `Even $1.50/month helps keep MUIZI Tracker running and online!\n\n` +
          `We truly appreciate you.`
        );
      } catch {}
    }

    // 😢 Unsubscribed
    if (hadRole && !hasRole) {
      await Supporter.deleteOne({ userId: newMember.id });

      try {
        await newMember.send(
          `👋 **Sad to see you go**\n\n` +
          `Your supporter perks have been removed.\n` +
          `Thank you for being part of MUIZI Tracker 💙`
        );
      } catch {}
    }
  }
};