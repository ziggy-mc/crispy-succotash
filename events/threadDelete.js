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

            const bug = await Bug.findOneAndDelete({ threadId: thread.id });
            if (!bug) return;

            const { reporterId, guildId } = bug;

            // Remove the bug record
            await onBugDeleted(bug);

            // Only DM / promote queue if the bug was active (not already handled by the panel)
            if (!bug.isQueued) {
                await dmReporterUpdate(client, reporterId, bug, 'deleted');
                await promoteQueuedBug(client, guildId, reporterId);
            } else {
                await dmReporterUpdate(client, reporterId, bug, 'deleted');
            }
        } catch (err) {
            client.logger?.error?.(`[BugTracker] threadDelete error: ${err.message}`, err);
        }
    },
};
