const Bug = require('../Schemas.js/cBug');
const { premiumUserIds } = require('./premiumEntitlement');
const { onBugDeleted } = require('./bugStatsService');
module.exports = async function bugCleanup(client) {
    const now = Date.now();
    const candidates = Bug.find({ status: 'Resolved', resolvedAt: { $lte: new Date(now - 12 * 3600000) } }).lean().cursor();
    try {
        for await (const candidate of candidates) {
            const premium = (await premiumUserIds([candidate.reporterId])).has(candidate.reporterId);
            const hours = premium ? 24 : 12;
            const cutoff = new Date(now - hours * 3600000);
            if (candidate.resolvedAt > cutoff) continue;
            // Claim deletion before Discord emits threadDelete, preventing duplicate statistic deltas.
            const removed = await Bug.findOneAndDelete({ _id: candidate._id, status: 'Resolved', resolvedAt: { $lte: cutoff } });
            if (!removed) continue;
            await onBugDeleted(removed);
            const thread = await client.channels.fetch(removed.threadId).catch(() => null);
            if (thread) await thread.delete(`Resolved report retention: ${hours} hours`).catch(() => {});
            client.logger.info(`[BugCleanup] Expired resolved report ${removed.bugId}`);
        }
    } finally { await candidates.close(); }
};
