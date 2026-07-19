const Bug = require('../Schemas.js/cBug');
const GuildConfig = require('../Schemas.js/guildConfig');
const { dmReporterUpdate, promoteQueuedBug } = require('../utils/bugQueue');
const { onBugDeleted } = require('../utils/bugStatsService');

module.exports = {
    name: 'threadDelete',
    once: false,
    async execute(thread, client) {
        // Only care about threads in configured bug forums
        try {
            const guildConfig = await GuildConfig.findOne({ guildId: thread.guild?.id });
            if (!guildConfig?.bugForumChannelId) return;
            if (thread.parentId !== guildConfig.bugForumChannelId) return;

            const bug = await Bug.findOne({ threadId: thread.id });
            if (!bug) return;

            const { reporterId, guildId } = bug;

            // Remove the bug record
            await Bug.deleteOne({ threadId: thread.id });
            await onBugDeleted(bug);

            // Only DM / promote queue if the bug was active (not already handled by the panel)
            if (!bug.isQueued) {
                await dmReporterUpdate(client, reporterId, bug, 'deleted');
                await promoteQueuedBug(client, guildId, reporterId);
            } else {
                // Queued bug thread was deleted — just remove it, no promotion needed (nothing opened up)
                try {
                    const reporter = await client.users.fetch(reporterId);
                    const { EmbedBuilder } = require('discord.js');
                    const embed = new EmbedBuilder()
                        .setTitle('🗑️ Queued Bug Report Removed')
                        .setColor(0xe74c3c)
                        .setDescription(`Your queued bug report \`${bug.bugId}\` has been removed.`)
                        .addFields({ name: '📋 Title', value: bug.originalTitle, inline: false })
                        .setTimestamp();

                    await reporter.send({ embeds: [embed] });
                } catch { /* DMs may be closed */ }
            }
        } catch (err) {
            client.logger?.error?.(`[BugTracker] threadDelete error: ${err.message}`, err);
        }
    },
};
