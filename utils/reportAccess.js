const { PermissionFlagsBits, ChannelType } = require('discord.js');
const GuildConfig = require('../Schemas.js/guildConfig');

const escapeRegex = value => String(value).slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isSnowflake = value => typeof value === 'string' && /^\d{17,20}$/.test(value);

// authorizingIntegrationOwners comes from Discord, never from an API caller.
function installedGuildContext(interaction, client) {
    const guildId = interaction.guildId;
    const guild = client.guilds.cache.get(guildId);
    return !!(guildId && guild && guild.available !== false &&
        interaction.authorizingIntegrationOwners?.['0'] === guildId);
}

async function hasStaffAccess(interaction) {
    if (!interaction.inCachedGuild?.()) return false;
    const member = interaction.member;
    if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
    const cfg = await GuildConfig.findOne({ guildId: interaction.guildId }).lean();
    return !!(cfg?.bugStaffRoleId && member.roles.cache.has(cfg.bugStaffRoleId));
}

// A staff role in the destination guild grants no access in a source guild.
function mayViewReport({ report, userId, premium, installedContext, staffGuildId, sourceReadable }) {
    if (staffGuildId && report.guildId === staffGuildId) return true;
    if (report.reporterId !== userId) return false;
    return premium || (installedContext && sourceReadable);
}

function createSourceReader(client, userId) {
    const members = new Map(); // request-local only; no permission cache survives the request
    return async report => {
        const guild = client.guilds.cache.get(report.guildId);
        if (!guild || guild.available === false) return false;
        if (!members.has(guild.id)) {
            members.set(guild.id, guild.members.fetch({ user: userId, cache: false, force: true }).catch(() => null));
        }
        const member = await members.get(guild.id);
        if (!member) return false;
        const thread = await guild.channels.fetch(report.threadId).catch(() => null);
        if (!thread || !thread.permissionsFor(member)?.has(PermissionFlagsBits.ViewChannel)) return false;
        if (thread.type === ChannelType.PrivateThread &&
            !thread.permissionsFor(member).has(PermissionFlagsBits.ManageThreads)) {
            return !!await thread.members.fetch(userId).catch(() => null);
        }
        return true;
    };
}

async function visibleReports(reports, context, client) {
    const canRead = createSourceReader(client, context.userId);
    const visible = [];
    // Bounded batches avoid a Discord REST burst while preserving result order.
    for (let offset = 0; offset < reports.length; offset += 5) {
        const batch = reports.slice(offset, offset + 5);
        const decisions = await Promise.all(batch.map(async report => mayViewReport({
            ...context, report,
            sourceReadable: context.premium || context.staffGuildId === report.guildId ? false : await canRead(report),
        })));
        visible.push(...batch.filter((_, i) => decisions[i]));
    }
    return visible;
}
function sourceName(client, guildId) {
    return client.guilds.cache.get(guildId)?.name || `Unavailable server (${guildId})`;
}
module.exports = { escapeRegex, isSnowflake, installedGuildContext, hasStaffAccess, mayViewReport, createSourceReader, visibleReports, sourceName };
