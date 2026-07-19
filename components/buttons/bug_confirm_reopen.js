const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const Bug = require('../../Schemas.js/cBug');
const GuildConfig = require('../../Schemas.js/guildConfig');
const Supporter = require('../../Schemas.js/Supporter');
const { premiumFooter } = require('../../utils/bugQueue');
const { pendingReopens } = require('../../utils/reopenRequests');

const REOPEN_WINDOW_MS = 24 * 60 * 60 * 1000;

async function hasStaffAccess(interaction) {
    if (interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return true;
    const guildConfig = await GuildConfig.findOne({ guildId: interaction.guildId });
    if (guildConfig?.bugStaffRoleId && interaction.member.roles.cache.has(guildConfig.bugStaffRoleId)) return true;
    return false;
}

module.exports = {
    customId: 'bug_confirm_reopen', // matched by prefix in componentCreate

    async execute(interaction, client) {
        await interaction.deferReply({ ephemeral: true });

        const parts   = interaction.customId.split(':');
        const guildId = parts[1];
        const bugId   = parts[2];

        if (!await hasStaffAccess(interaction)) {
            return interaction.editReply({ content: '❌ You need staff or admin permissions to approve reopen requests.' });
        }

        const bug = await Bug.findOne({ guildId, bugId });
        if (!bug) {
            return interaction.editReply({ content: `❌ Bug report \`${bugId}\` not found.` });
        }

        if (bug.status !== 'Resolved') {
            return interaction.editReply({ content: '❌ This bug is not resolved; nothing to reopen.' });
        }

        // Reporter must still be a supporter
        const isSupporter = await Supporter.findOne({ userId: bug.reporterId });
        if (!isSupporter) {
            return interaction.editReply({ content: '❌ The reporter is no longer a premium supporter. Reopen denied.' });
        }

        // 24-hour window must still be open
        if (!bug.resolvedAt || Date.now() - bug.resolvedAt.getTime() > REOPEN_WINDOW_MS) {
            return interaction.editReply({ content: '❌ The 24-hour reopen window has expired.' });
        }

        // Reopen the bug
        bug.status     = 'Open';
        bug.resolvedAt = null;
        await bug.save();

        pendingReopens.delete(bugId);

        // Remove buttons from the reopen-request message
        try {
            await interaction.message.edit({ components: [] });
        } catch { /* message may no longer be editable */ }

        // Notify in the bug thread
        try {
            const thread = await client.channels.fetch(bug.threadId).catch(() => null);
            // Always unarchive first, then unlock — Discord requires unarchived state to unlock
            if (thread) await thread.setArchived(false, 'Bug reopened').catch(() => {});
            if (thread) await thread.setLocked(false, 'Bug reopened').catch(() => {});

            if (thread) {
                const embed = new EmbedBuilder()
                    .setTitle('🔓 Bug Report Reopened')
                    .setColor(0xe74c3c)
                    .setDescription(`This bug report has been reopened by <@${interaction.user.id}>.`)
                    .addFields(
                        { name: '📊 Status',       value: '🔴 Open',                    inline: true },
                        { name: '🔧 Reopened By',  value: `<@${interaction.user.id}>`, inline: true },
                    )
                    .setTimestamp();

                const footer = premiumFooter(isSupporter);
                if (footer) embed.setFooter(footer);

                await thread.send({ embeds: [embed] });
            }
        } catch { /* thread may no longer be accessible */ }

        // DM the reporter
        try {
            const reporter = await client.users.fetch(bug.reporterId);
            const dmEmbed = new EmbedBuilder()
                .setTitle('🔓 Bug Report Reopened')
                .setColor(0xe74c3c)
                .setDescription(`Your bug report \`${bug.bugId}\` has been reopened by staff.`)
                .addFields(
                    { name: '📋 Bug ID',  value: `\`${bug.bugId}\``,   inline: true },
                    { name: '📊 Status',  value: '🔴 Open',             inline: true },
                    { name: '🔗 Thread',  value: `<#${bug.threadId}>`,  inline: false },
                )
                .setTimestamp();

            const footer = premiumFooter(isSupporter);
            if (footer) dmEmbed.setFooter(footer);

            await reporter.send({ embeds: [dmEmbed] });
        } catch { /* DMs may be closed */ }

        await interaction.editReply({ content: `✅ Bug \`${bugId}\` has been reopened.` });
    },
};