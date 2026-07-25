const Bug = require('../Schemas.js/cBug');
const Supporter = require('../Schemas.js/Supporter');
const { onBugDeleted } = require('./bugStatsService');

module.exports = async function bugCleanup(client) {
    try {
        console.log(`[BugCleanup] Running cleanup check...`);

        
        const supporters = await Supporter.find({}, 'userId');
        const supporterIds = new Set(supporters.map(s => s.userId));

        
        const resolvedBugs = await Bug.find({
            status: 'Resolved',
            resolvedAt: { $ne: null },
        });

        const now = Date.now();

        for (const bug of resolvedBugs) {
            const isPremium = supporterIds.has(bug.reporterId);
            const retentionHours = isPremium ? 24 : 12;
            const deleteAfter = retentionHours * 60 * 60 * 1000;

            
            if ((now - bug.resolvedAt.getTime()) < deleteAfter) continue;

            try {
                const thread = await client.channels.fetch(bug.threadId).catch(() => null);

                if (thread) {
                    await thread.delete(
                        `Bug auto-removed ${retentionHours}h after being resolved`
                    );
                }
            } catch {
                
            }

            await Bug.deleteOne({ _id: bug._id });
            await onBugDeleted(bug);

            client.logger.info(
                `[BugCleanup] Auto-deleted ${bug.bugId} (${retentionHours}h retention)`
            );
        }
    } catch (err) {
        client.logger.error(`[BugCleanup] Error: ${err.message}`, err);
    }
};
