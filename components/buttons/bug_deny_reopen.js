const { getUserSettings, onBugUpdated } = require('../../utils/bugStatsService');
const { hasStaffAccess } = require('../../utils/reportAccess');
const { getPremiumEntitlement } = require('../../utils/premiumEntitlement');
const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const Bug = require('../../Schemas.js/cBug');
const GuildConfig = require('../../Schemas.js/guildConfig');
const Supporter = require('../../Schemas.js/Supporter');
const { premiumFooter } = require('../../utils/bugQueue');
const { pendingReopens } = require('../../utils/reopenRequests');



module.exports = {
    customId: 'bug_deny_reopen', // matched by prefix in componentCreate

    async execute(interaction, client) {
        await interaction.deferReply({ ephemeral: true });

        const parts   = interaction.customId.split(':');
        const guildId = parts[1];
        const bugId   = parts[2];

        if (guildId !== interaction.guildId || !await hasStaffAccess(interaction)) {
            return interaction.editReply({ content: '❌ You need staff or admin permissions to dismiss reopen requests.' });
        }

        const bug = await Bug.findOne({ guildId, bugId });
        if (!bug) {
            return interaction.editReply({ content: `❌ Bug report \`${bugId}\` not found.` });
        }

        pendingReopens.delete(`${guildId}:${bugId}`);

        // Remove buttons from the reopen-request message
        try {
            await interaction.message.edit({ components: [] });
        } catch { /* message may no longer be editable */ }

        // DM reporter about the dismissal
        try {
            if (!await getPremiumEntitlement(bug.reporterId) || !(await getUserSettings(bug.reporterId))?.dmOnUpdate) return interaction.editReply({ content: "Reopen dismissed." });
            const reporter  = await client.users.fetch(bug.reporterId);
            const supporter = await getPremiumEntitlement(bug.reporterId);
            const dmEmbed = new EmbedBuilder()
                .setTitle('❌ Reopen Request Dismissed')
                .setColor(0xe74c3c)
                .setDescription(`Your request to reopen bug report \`${bug.bugId}\` was dismissed by staff.`)
                .addFields({ name: '📋 Bug ID', value: `\`${bug.bugId}\``, inline: true })
                .setTimestamp();

            const footer = premiumFooter(supporter);
            if (footer) dmEmbed.setFooter(footer);

            await reporter.send({ embeds: [dmEmbed] });
        } catch { /* DMs may be closed */ }

        await interaction.editReply({ content: `✅ Reopen request for \`${bugId}\` has been dismissed.` });
    },
};