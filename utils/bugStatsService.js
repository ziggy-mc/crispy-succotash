const Bug = require('../Schemas.js/cBug');
const Supporter = require('../Schemas.js/Supporter');
const BugUserSettings = require('../Schemas.js/BugUserSettings');
const BugUserStats = require('../Schemas.js/BugUserStats');
const BugGuildStats = require('../Schemas.js/BugGuildStats');
const BugGlobalStats = require('../Schemas.js/BugGlobalStats');
const BugUserDashboardCache = require('../Schemas.js/BugUserDashboardCache');

const GLOBAL_KEY = 'global';
const DASHBOARD_REFRESH_MS = 2 * 60 * 1000;

function contributionFromBug(bug) {
    const isQueued = Boolean(bug?.isQueued);
    const isResolved = bug?.status === 'Resolved';

    return {
        open: !isQueued && !isResolved ? 1 : 0,
        queued: isQueued ? 1 : 0,
        resolved: !isQueued && isResolved ? 1 : 0,
    };
}

function deltaFromBugs(beforeBug, afterBug) {
    const before = contributionFromBug(beforeBug);
    const after = contributionFromBug(afterBug);

    return {
        open: after.open - before.open,
        queued: after.queued - before.queued,
        resolved: after.resolved - before.resolved,
    };
}

async function ensureUserSettings(userId) {
    if (!userId) return null;

    return BugUserSettings.findOneAndUpdate(
        { userId },
        { $setOnInsert: { pingOnUpdate: true, dmOnUpdate: false } },
        { new: true, upsert: true }
    );
}

async function getUserSettings(userId) {
    return ensureUserSettings(userId);
}

async function updateUserSettings(userId, updates = {}) {
    const supporter = await Supporter.findOne({ userId });
    const isPremium = Boolean(supporter);

    const $set = { updatedAt: new Date() };
    if (typeof updates.pingOnUpdate === 'boolean') {
        $set.pingOnUpdate = updates.pingOnUpdate;
    }

    if (typeof updates.dmOnUpdate === 'boolean') {
        $set.dmOnUpdate = isPremium ? updates.dmOnUpdate : false;
    }

    const settings = await BugUserSettings.findOneAndUpdate(
        { userId },
        { $set, $setOnInsert: { pingOnUpdate: true, dmOnUpdate: false } },
        { upsert: true, new: true }
    );

    if (!isPremium && settings.dmOnUpdate) {
        settings.dmOnUpdate = false;
        settings.updatedAt = new Date();
        await settings.save();
    }

    await refreshUserDashboardCache(userId);
    return settings;
}

async function applyDelta({ userId, guildId, delta, totalCreatedDelta = 0 }) {
    const now = new Date();
    const inc = {
        totalOpen: delta.open,
        totalQueued: delta.queued,
        totalResolved: delta.resolved,
        ...(totalCreatedDelta ? { totalCreated: totalCreatedDelta } : {}),
    };

    await Promise.all([
        BugUserStats.findOneAndUpdate(
            { userId },
            { $inc: inc, $set: { updatedAt: now } },
            { upsert: true, new: true }
        ),
        BugGuildStats.findOneAndUpdate(
            { guildId },
            { $inc: inc, $set: { updatedAt: now } },
            { upsert: true, new: true }
        ),
        BugGlobalStats.findOneAndUpdate(
            { key: GLOBAL_KEY },
            {
                $setOnInsert: { key: GLOBAL_KEY },
                $inc: inc,
                $set: { updatedAt: now },
            },
            { upsert: true, new: true }
        ),
    ]);
}

async function onBugCreated(bug) {
    if (!bug?.reporterId || !bug?.guildId) return;
    await ensureUserSettings(bug.reporterId);

    const delta = contributionFromBug(bug);
    await applyDelta({ userId: bug.reporterId, guildId: bug.guildId, delta, totalCreatedDelta: 1 });
    await refreshUserDashboardCache(bug.reporterId);
}

async function onBugUpdated(beforeBug, afterBug) {
    if (!beforeBug || !afterBug) return;
    if (!afterBug.reporterId || !afterBug.guildId) return;

    const delta = deltaFromBugs(beforeBug, afterBug);
    if (!delta.open && !delta.queued && !delta.resolved) {
        await refreshUserDashboardCache(afterBug.reporterId);
        return;
    }

    await applyDelta({ userId: afterBug.reporterId, guildId: afterBug.guildId, delta });
    await refreshUserDashboardCache(afterBug.reporterId);
}

async function onBugDeleted(bug) {
    if (!bug?.reporterId || !bug?.guildId) return;

    const before = contributionFromBug(bug);
    const delta = {
        open: -before.open,
        queued: -before.queued,
        resolved: -before.resolved,
    };

    await applyDelta({ userId: bug.reporterId, guildId: bug.guildId, delta });
    await refreshUserDashboardCache(bug.reporterId);
}

function buildThreadLink(guildId, threadId) {
    if (!guildId || !threadId) return null;
    return `https://discord.com/channels/${guildId}/${threadId}`;
}

async function getSubscriptionTier(userId) {
    const supporter = await Supporter.findOne({ userId });
    return supporter ? 'premium' : 'free';
}

async function buildUserDashboardData(userId) {
    const [bugs, tier, settings, userStats] = await Promise.all([
        Bug.find({ reporterId: userId }).sort({ createdAt: -1 }),
        getSubscriptionTier(userId),
        ensureUserSettings(userId),
        BugUserStats.findOne({ userId }),
    ]);

    const openCount = bugs.filter((b) => !b.isQueued && b.status !== 'Resolved').length;
    const queuedCount = bugs.filter((b) => b.isQueued).length;

    return {
        userId,
        refreshedAt: new Date().toISOString(),
        subscriptionTier: tier,
        settings: {
            pingOnUpdate: Boolean(settings?.pingOnUpdate),
            dmOnUpdate: tier === 'premium' ? Boolean(settings?.dmOnUpdate) : false,
        },
        counters: {
            totalCreated: userStats?.totalCreated ?? 0,
            totalGlobalBugsOpen: openCount,
            totalGlobalBugsQueued: queuedCount,
        },
        bugs: bugs.map((bug) => ({
            bugTitle: bug.originalTitle,
            bugStatus: bug.isQueued ? 'Queued' : bug.status,
            bugId: bug.bugId,
            threadLink: buildThreadLink(bug.guildId, bug.threadId),
            guildId: bug.guildId,
            threadId: bug.threadId,
            createdAt: bug.createdAt,
        })),
    };
}

async function refreshUserDashboardCache(userId) {
    if (!userId) return null;
    const data = await buildUserDashboardData(userId);

    await BugUserDashboardCache.findOneAndUpdate(
        { userId },
        { $set: { data, refreshedAt: new Date() } },
        { upsert: true, new: true }
    );

    return data;
}

async function getUserDashboardData(userId) {
    const cache = await BugUserDashboardCache.findOne({ userId });
    const isFresh = cache && (Date.now() - cache.refreshedAt.getTime()) < DASHBOARD_REFRESH_MS;

    if (isFresh) {
        return cache.data;
    }

    return refreshUserDashboardCache(userId);
}

async function refreshAllDashboardCaches() {
    const [bugUsers, settingsUsers, statUsers] = await Promise.all([
        Bug.distinct('reporterId', {}),
        BugUserSettings.distinct('userId', {}),
        BugUserStats.distinct('userId', {}),
    ]);

    const allUsers = [...new Set([...bugUsers, ...settingsUsers, ...statUsers].filter(Boolean))];

    for (const userId of allUsers) {
        await refreshUserDashboardCache(userId);
    }

    return { refreshedUsers: allUsers.length };
}

async function reconcileCurrentState() {
    const [bugs, userStats, guildStats, global] = await Promise.all([
        Bug.find({}, { reporterId: 1, guildId: 1, status: 1, isQueued: 1 }),
        BugUserStats.find({}),
        BugGuildStats.find({}),
        BugGlobalStats.findOne({ key: GLOBAL_KEY }),
    ]);

    const userMap = new Map();
    const guildMap = new Map();
    const userCreatedMap = new Map();
    const guildCreatedMap = new Map();
    const globalCurrent = { open: 0, queued: 0, resolved: 0 };

    for (const bug of bugs) {
        const c = contributionFromBug(bug);
        const user = userMap.get(bug.reporterId) || { open: 0, queued: 0, resolved: 0 };
        user.open += c.open;
        user.queued += c.queued;
        user.resolved += c.resolved;
        userMap.set(bug.reporterId, user);
        userCreatedMap.set(bug.reporterId, (userCreatedMap.get(bug.reporterId) || 0) + 1);

        const guild = guildMap.get(bug.guildId) || { open: 0, queued: 0, resolved: 0 };
        guild.open += c.open;
        guild.queued += c.queued;
        guild.resolved += c.resolved;
        guildMap.set(bug.guildId, guild);
        guildCreatedMap.set(bug.guildId, (guildCreatedMap.get(bug.guildId) || 0) + 1);

        globalCurrent.open += c.open;
        globalCurrent.queued += c.queued;
        globalCurrent.resolved += c.resolved;
    }

    const now = new Date();

    for (const stat of userStats) {
        const current = userMap.get(stat.userId) || { open: 0, queued: 0, resolved: 0 };
        const createdFromDocs = userCreatedMap.get(stat.userId) || 0;
        await BugUserStats.updateOne(
            { userId: stat.userId },
            {
                $set: {
                    totalCreated: Math.max(stat.totalCreated || 0, createdFromDocs),
                    totalOpen: Math.max(0, current.open),
                    totalQueued: Math.max(0, current.queued),
                    totalResolved: Math.max(0, current.resolved),
                    updatedAt: now,
                },
            }
        );
    }

    for (const [userId, current] of userMap.entries()) {
        const createdFromDocs = userCreatedMap.get(userId) || 0;
        await BugUserStats.findOneAndUpdate(
            { userId },
            {
                $setOnInsert: { totalCreated: createdFromDocs },
                $set: {
                    totalOpen: Math.max(0, current.open),
                    totalQueued: Math.max(0, current.queued),
                    totalResolved: Math.max(0, current.resolved),
                    updatedAt: now,
                },
            },
            { upsert: true, new: true }
        );
    }

    for (const stat of guildStats) {
        const current = guildMap.get(stat.guildId) || { open: 0, queued: 0, resolved: 0 };
        const createdFromDocs = guildCreatedMap.get(stat.guildId) || 0;
        await BugGuildStats.updateOne(
            { guildId: stat.guildId },
            {
                $set: {
                    totalCreated: Math.max(stat.totalCreated || 0, createdFromDocs),
                    totalOpen: Math.max(0, current.open),
                    totalQueued: Math.max(0, current.queued),
                    totalResolved: Math.max(0, current.resolved),
                    updatedAt: now,
                },
            }
        );
    }

    for (const [guildId, current] of guildMap.entries()) {
        const createdFromDocs = guildCreatedMap.get(guildId) || 0;
        await BugGuildStats.findOneAndUpdate(
            { guildId },
            {
                $setOnInsert: { totalCreated: createdFromDocs },
                $set: {
                    totalOpen: Math.max(0, current.open),
                    totalQueued: Math.max(0, current.queued),
                    totalResolved: Math.max(0, current.resolved),
                    updatedAt: now,
                },
            },
            { upsert: true, new: true }
        );
    }

    await BugGlobalStats.findOneAndUpdate(
        { key: GLOBAL_KEY },
        {
            $setOnInsert: {
                key: GLOBAL_KEY,
            },
            $set: {
                totalCreated: Math.max(global?.totalCreated ?? 0, bugs.length),
                totalOpen: Math.max(0, globalCurrent.open),
                totalQueued: Math.max(0, globalCurrent.queued),
                totalResolved: Math.max(0, globalCurrent.resolved),
                updatedAt: now,
            },
        },
        { upsert: true, new: true }
    );
}

async function getGlobalStats() {
    const stats = await BugGlobalStats.findOneAndUpdate(
        { key: GLOBAL_KEY },
        { $setOnInsert: { key: GLOBAL_KEY } },
        { upsert: true, new: true }
    ).lean();

    return {
        totalBugsCreated: stats.totalCreated ?? 0,
        totalOpenBugs: stats.totalOpen ?? 0,
        totalResolvedBugs: stats.totalResolved ?? 0,
        totalQueuedBugs: stats.totalQueued ?? 0,
        updatedAt: stats.updatedAt,
    };
}

async function getGuildStats(guildId) {
    const stats = await BugGuildStats.findOne({ guildId }).lean();
    return {
        guildId,
        totalBugsCreated: stats?.totalCreated ?? 0,
        totalOpenBugs: stats?.totalOpen ?? 0,
        totalResolvedBugs: stats?.totalResolved ?? 0,
        totalQueuedBugs: stats?.totalQueued ?? 0,
        updatedAt: stats?.updatedAt ?? null,
    };
}

module.exports = {
    DASHBOARD_REFRESH_MS,
    ensureUserSettings,
    getUserSettings,
    updateUserSettings,
    onBugCreated,
    onBugUpdated,
    onBugDeleted,
    getUserDashboardData,
    refreshUserDashboardCache,
    refreshAllDashboardCaches,
    reconcileCurrentState,
    getGlobalStats,
    getGuildStats,
};
