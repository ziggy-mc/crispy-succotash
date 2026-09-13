const { ChannelType } = require('discord.js');
const GuildConfig = require('../Schemas.js/guildConfig');

const STATUS_TAGS = [
    {
        key: 'bugReceivedTagId',
        name: 'Received',
        status: 'Open',
    },
    {
        key: 'bugInProgressTagId',
        name: 'In Progress',
        status: 'In Progress',
    },
    {
        key: 'bugResolvedTagId',
        name: 'Resolved',
        status: 'Resolved',
    },
];

function getStatusTagKey(status) {
    switch (status) {
        case 'Open':
            return 'bugReceivedTagId';

        case 'In Progress':
            return 'bugInProgressTagId';

        case 'Resolved':
            return 'bugResolvedTagId';

        default:
            return null;
    }
}

function getStatusTagNames() {
    return STATUS_TAGS.map(tag => tag.name);
}

async function ensureStatusTags(forumChannel, guildId) {
    if (!forumChannel || forumChannel.type !== ChannelType.GuildForum) {
        throw new Error('The configured channel is not a forum channel.');
    }

    let availableTags = [...forumChannel.availableTags];

    const missingTags = STATUS_TAGS.filter(definition =>
        !availableTags.some(
            tag => tag.name.toLowerCase() === definition.name.toLowerCase()
        )
    );

    if (missingTags.length > 0) {
        const newTags = missingTags.map(definition => ({
            name: definition.name,
            moderated: true,
        }));

        const updatedForum = await forumChannel.setAvailableTags(
            [...availableTags, ...newTags],
            'Create bug tracker status tags'
        );

        availableTags = [...updatedForum.availableTags];
    }

    const tagIds = {};

    for (const definition of STATUS_TAGS) {
        const tag = availableTags.find(
            currentTag =>
                currentTag.name.toLowerCase() === definition.name.toLowerCase()
        );

        if (!tag) {
            throw new Error(`Could not find the "${definition.name}" forum tag after creation.`);
        }

        tagIds[definition.key] = tag.id;
    }

    await GuildConfig.findOneAndUpdate(
        { guildId },
        {
            $set: {
                ...tagIds,
            },
        },
        {
            upsert: true,
            new: true,
        }
    );

    return tagIds;
}

async function getStatusTagIds(thread, guildId) {
    const config = await GuildConfig.findOne({ guildId });

    if (!config?.bugForumChannelId) {
        throw new Error('Bug forum channel is not configured.');
    }

    let forumChannel = null;

    if (thread.parent && thread.parent.type === ChannelType.GuildForum) {
        forumChannel = thread.parent;
    }

    if (!forumChannel) {
        forumChannel = await thread.client.channels.fetch(
            config.bugForumChannelId
        );
    }

    if (!forumChannel || forumChannel.type !== ChannelType.GuildForum) {
        throw new Error('Configured bug forum channel could not be found.');
    }

    return ensureStatusTags(forumChannel, guildId);
}

async function applyStatusTag(thread, guildId, status) {
    const tagKey = getStatusTagKey(status);

    if (!tagKey) {
        throw new Error(`Unknown bug status: ${status}`);
    }

    const tagIds = await getStatusTagIds(thread, guildId);
    const targetTagId = tagIds[tagKey];

    if (!targetTagId) {
        throw new Error(`No Discord tag ID is configured for status: ${status}`);
    }

    const allStatusTagIds = Object.values(tagIds).filter(Boolean);

    const existingTags = Array.isArray(thread.appliedTags)
        ? thread.appliedTags
        : [];

    const preservedTags = existingTags.filter(
        tagId => !allStatusTagIds.includes(tagId)
    );

    await thread.setAppliedTags(
        [...preservedTags, targetTagId],
        `Bug tracker status changed to ${status}`
    );
}

module.exports = {
    STATUS_TAGS,
    getStatusTagKey,
    getStatusTagNames,
    ensureStatusTags,
    getStatusTagIds,
    applyStatusTag,
};
