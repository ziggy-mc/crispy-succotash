const Bug = require('../Schemas.js/cBug');
const { onBugDeleted } = require('./bugStatsService');

module.exports = async function bugCleanup(client) {
    try {
        console.log(`[BugCleanup] Running cleanup check...`);
        const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

        const expired = await Bug.find({
            status:     'Resolved',
            resolvedAt: { $lte: cutoff },
        });

        for (const bug of expired) {
            try {
                const thread = await client.channels.fetch(bug.threadId).catch(() => null);
                if (thread) await thread.delete('Bug auto-removed 24h after resolved');
            } catch { /* thread already gone */ }

            await Bug.deleteOne({ _id: bug._id });
            await onBugDeleted(bug);
            client.logger.info(`[BugCleanup] Auto-deleted ${bug.bugId} (resolved 24h+ ago)`);
        }
    } catch (err) {
        client.logger.error(`[BugCleanup] Error: ${err.message}`, err);
    }
};