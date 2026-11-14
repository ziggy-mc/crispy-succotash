const Bug = require('../Schemas.js/cBug');
const { getPremiumEntitlement } = require('./premiumEntitlement');
const { visibleReports, sourceName } = require('./reportAccess');
const { getUserSettings } = require('./bugStatsService');

async function personalReports(client, userId, { installedContext = false, global = false } = {}) {
    const premium = !!await getPremiumEntitlement(userId);
    if ((global || !installedContext) && !premium) {
        const error = new Error('Global access outside installed servers requires Premium.');
        error.status = 403;
        throw error;
    }
    const query = { reporterId: userId };
    if (!premium || !global && installedContext) query.guildId = { $in: [...client.guilds.cache.keys()] };
    // Read with a cursor: avoid loading a whole account into memory at once.
    const cursor = Bug.find(query).sort({ createdAt: -1, _id: -1 }).lean().cursor();
    const bugs = [];
    let batch = [];
    async function flush() {
        const allowed = await visibleReports(batch, { userId, premium, installedContext }, client);
        bugs.push(...allowed.map(b => ({
            bugId: b.bugId, title: b.originalTitle, status: b.isQueued ? 'Queued' : b.status,
            guildId: b.guildId, guildName: sourceName(client, b.guildId),
            threadUrl: `https://discord.com/channels/${b.guildId}/${b.threadId}`,
            createdAt: b.createdAt,
        })));
        batch = [];
    }
    try {
        for await (const report of cursor) {
            batch.push(report);
            if (batch.length === 20) await flush();
            if (bugs.length >= 200) break;
        }
        if (batch.length) await flush();
    } finally { await cursor.close(); }
    const settings = await getUserSettings(userId);
    return {
        bugs: bugs.slice(0, 200), limited: bugs.length >= 200,
        scope: global ? 'global' : 'installed',
        openBugs: bugs.filter(b => b.status === 'Open' || b.status === 'In Progress').length,
        queuedBugs: bugs.filter(b => b.status === 'Queued').length,
        resolvedBugs: bugs.filter(b => b.status === 'Resolved').length,
        settings: { tier: premium ? 'premium' : 'free', pingOnUpdate: settings.pingOnUpdate, dmOnUpdate: premium && settings.dmOnUpdate },
    };
}
module.exports = { personalReports };
