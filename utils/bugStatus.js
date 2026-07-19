const { ChannelType } = require('discord.js');
const GuildConfig = require('../Schemas.js/guildConfig');

const BUG_STATUSES = Object.freeze({
    OPEN: 'Open',
    IN_PROGRESS: 'In Progress',
    RESOLVED: 'Resolved',
    REOPEN_REQUEST: 'Reopen Request',
});

const STATUS_TAG_DEFINITIONS = Object.freeze([
    { status: BUG_STATUSES.OPEN,           name: '🔴 Open',            emojiName: '🔴' },
    { status: BUG_STATUSES.IN_PROGRESS,    name: '🟡 In Progress',     emojiName: '🟡' },
    { status: BUG_STATUSES.RESOLVED,       name: '🟢 Resolved',        emojiName: '🟢' },
    { status: BUG_STATUSES.REOPEN_REQUEST, name: '🟣 Reopen Request',  emojiName: '🟣' },
]);

function isValidStatus(status) {
    return Object.values(BUG_STATUSES).includes(status);
}

function normalizeTagPayload(tag) {
    return {
        id: tag.id,
        name: tag.name,
        moderated: Boolean(tag.moderated),
        ...(tag.emojiId ? { emojiId: tag.emojiId } : {}),
        ...(tag.emojiName ? { emojiName: tag.emojiName } : {}),
    };
}

async function persistTagIds(guildId, forumChannelId, statusTagIds) {
    await GuildConfig.findOneAndUpdate(
        { guildId },
        {
            $set: {
                [`bugStatusTags.${forumChannelId}`]: statusTagIds,
            },
        },
        { upsert: true, new: true }
    );
}

async function ensureBugTags(channel) {
    if (!channel) return null;

    const forum = await channel.fetch().catch(() => channel);
    if (!forum || forum.type !== ChannelType.GuildForum) return null;

    const currentTags = Array.isArray(forum.availableTags) ? forum.availableTags : [];
    const existingByName = new Map(currentTags.map((tag) => [tag.name, tag]));

    const missing = STATUS_TAG_DEFINITIONS.filter((def) => !existingByName.has(def.name));

    if (missing.length > 0) {
        const payload = [
            ...currentTags.map(normalizeTagPayload),
            ...missing.map((def) => ({
                name: def.name,
                emojiName: def.emojiName,
                moderated: false,
            })),
        ];

        await forum.setAvailableTags(payload, 'Ensure required bug status tags');
    }

    const refreshed = await forum.fetch().catch(() => forum);
    const refreshedTags = Array.isArray(refreshed.availableTags) ? refreshed.availableTags : [];

    const statusTagIds = {};
    for (const def of STATUS_TAG_DEFINITIONS) {
        const match = refreshedTags.find((tag) => tag.name === def.name);
        if (match?.id) {
            statusTagIds[def.status] = match.id;
        }
    }

    await persistTagIds(refreshed.guildId, refreshed.id, statusTagIds);
    return { forum: refreshed, statusTagIds };
}

async function setBugStatus(thread, status, options = {}) {
    if (!thread || !isValidStatus(status)) {
        throw new Error('Invalid thread or bug status.');
    }

    const liveThread = await thread.fetch().catch(() => thread);
    if (!liveThread?.parentId || typeof liveThread.setAppliedTags !== 'function') {
        return { applied: false, reason: 'Thread has no forum parent or tag API unavailable.' };
    }

    const forum = liveThread.parent ?? await liveThread.guild.channels.fetch(liveThread.parentId).catch(() => null);
    if (!forum || forum.type !== ChannelType.GuildForum) {
        return { applied: false, reason: 'Parent forum channel is missing or invalid.' };
    }

    const { statusTagIds } = await ensureBugTags(forum) || { statusTagIds: null };
    if (!statusTagIds || !statusTagIds[status]) {
        return { applied: false, reason: 'Required status tag was not available.' };
    }

    const knownStatusTagIds = Object.values(statusTagIds).filter(Boolean);
    const currentApplied = Array.isArray(liveThread.appliedTags) ? liveThread.appliedTags : [];

    const withoutStatusTags = currentApplied.filter((tagId) => !knownStatusTagIds.includes(tagId));
    const nextStatusTagId = statusTagIds[status];
    const nextApplied = withoutStatusTags.includes(nextStatusTagId)
        ? withoutStatusTags
        : [...withoutStatusTags, nextStatusTagId];

    const unchanged = currentApplied.length === nextApplied.length
        && currentApplied.every((tagId, index) => tagId === nextApplied[index]);

    if (!unchanged) {
        await liveThread.setAppliedTags(nextApplied, options.reason ?? `Set bug status to ${status}`);
    }

    return {
        applied: true,
        status,
        statusTagId: nextStatusTagId,
        appliedTags: nextApplied,
        statusTagIds,
    };
}

async function transitionBugStatus({ client, bug, newStatus, reason = 'Bug status updated' }) {
    if (!client || !bug || !isValidStatus(newStatus)) {
        throw new Error('Invalid transition input.');
    }

    const previousBug = bug.toObject ? bug.toObject() : { ...bug };

    bug.status = newStatus;

    if (newStatus === BUG_STATUSES.RESOLVED) {
        bug.resolvedAt = bug.resolvedAt ?? new Date();
    } else if (newStatus === BUG_STATUSES.REOPEN_REQUEST) {
        bug.resolvedAt = bug.resolvedAt ?? new Date();
    } else {
        bug.resolvedAt = null;
    }

    await bug.save();

    let thread = null;
    try {
        thread = await client.channels.fetch(bug.threadId).catch(() => null);

        if (thread) {
            await setBugStatus(thread, newStatus, { reason });

            if (newStatus === BUG_STATUSES.RESOLVED) {
                await thread.setLocked(true, reason).catch(() => {});
            } else if (newStatus === BUG_STATUSES.OPEN || newStatus === BUG_STATUSES.IN_PROGRESS) {
                await thread.setArchived(false, reason).catch(() => {});
                await thread.setLocked(false, reason).catch(() => {});
            }
        }
    } catch {
        // best effort Discord synchronization; DB is source of truth
    }

    return { bug, previousBug, thread };
}

module.exports = {
    BUG_STATUSES,
    STATUS_TAG_DEFINITIONS,
    ensureBugTags,
    setBugStatus,
    transitionBugStatus,
};
