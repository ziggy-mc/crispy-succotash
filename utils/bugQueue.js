const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const Bug = require('../Schemas.js/cBug');
const Supporter = require('../Schemas.js/Supporter');
const { getUserSettings, onBugUpdated } = require('./bugStatsService');

const STATUS_COLOR = { 'Open': 0xe74c3c, 'In Progress': 0xf39c12, 'Resolved': 0x2ecc71 };
const STATUS_EMOJI = { 'Open': '🔴', 'In Progress': '🟡', 'Resolved': '🟢' };

/**
 * Returns a Discord embed footer object showing when the user became a premium supporter.
 * Returns null if the user is not a supporter or addedAt is unavailable.
 */
function premiumFooter(supporter) {
    if (!supporter?.addedAt) return null;
    const date = supporter.addedAt.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    return { text: `⭐ Premium active since ${date}` };
}

/**
 * Sends a DM to a user about a bug status update or deletion.
 * Silently ignores DM failures.
 */
async function dmReporterUpdate(client, reporterId, bug, event) {
    let reporter;
    try {
        reporter = await client.users.fetch(reporterId);
    } catch {
        return;
    }

    // Fetch supporter doc once — used for footer and reopen button
    const supporter = await Supporter.findOne({ userId: reporterId });
    const settings = await getUserSettings(reporterId);

    if (!supporter || !settings?.dmOnUpdate) {
        return;
    }

    const footer    = premiumFooter(supporter);

    let embed;

    if (event === 'deleted') {
        embed = new EmbedBuilder()
            .setTitle('🗑️ Bug Report Removed')
            .setColor(0xe74c3c)
            .setDescription(`Your bug report \`${bug.bugId}\` has been removed by staff.`)
            .addFields(
                { name: '📋 Original Title', value: bug.originalTitle,   inline: false },
                { name: '🔗 Bug ID',          value: `\`${bug.bugId}\``, inline: true  },
            )
            .setTimestamp();
    } else {
        embed = new EmbedBuilder()
            .setTitle('📊 Bug Status Updated')
            .setColor(STATUS_COLOR[bug.status] ?? 0x3498db)
            .setDescription(`Your bug report \`${bug.bugId}\` has been updated.`)
            .addFields(
                { name: '📋 Original Title', value: bug.originalTitle,                             inline: false },
                { name: '📊 New Status',      value: `${STATUS_EMOJI[bug.status]} ${bug.status}`, inline: true  },
                { name: '🔗 Thread',          value: `<#${bug.threadId}>`,                        inline: true  },
                ...(bug.resolvedAt ? [{
                    name:   '✅ Resolved At',
                    value:  `<t:${Math.floor(bug.resolvedAt.getTime() / 1000)}:F>`,
                    inline: false,
                }] : []),
            )
            .setTimestamp();
    }

    if (footer) embed.setFooter(footer);

    // For resolved bugs, offer premium reporters a reopen button
    let components = [];
    if (bug.status === 'Resolved' && supporter) {
        embed.addFields({
            name:   '🔓 Reopen Option',
            value:  'As a supporter you can request to reopen this report.\n⏰ **This reopen option expires in 24 hours**',
            inline: false,
        });
        components = [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`bug_reopen:${bug.guildId}:${bug.bugId}`)
                    .setLabel('Reopen Bug')
                    .setEmoji('🔓')
                    .setStyle(ButtonStyle.Primary)
            ),
        ];
    }

    try {
        await reporter.send({ embeds: [embed], ...(components.length ? { components } : {}) });
    } catch { /* DMs may be closed */ }
}

/**
 * Promotes the oldest queued bug for a user in a guild to active.
 * Unarchives the thread, sends a message in it, and DMs the reporter.
 */
async function promoteQueuedBug(client, guildId, reporterId) {
    const queued = await Bug.findOne(
        { guildId, reporterId, isQueued: true },
        null,
        { sort: { createdAt: 1 } }
    );
    if (!queued) return;

    const beforeUpdate = queued.toObject();
    queued.isQueued = false;
    await queued.save();
    await onBugUpdated(beforeUpdate, queued);

    // Unarchive the thread so the user can interact with it
    try {
        const thread = await client.channels.fetch(queued.threadId);
        if (thread?.archived) await thread.setArchived(false, 'Bug queue slot opened');

        if (thread) {
            const embed = new EmbedBuilder()
                .setTitle('✅ Bug Report Now Active!')
                .setColor(0x2ecc71)
                .setDescription(
                    `Your queued bug report has moved out of the queue and is now being tracked.\n\n` +
                    `Use \`/bug\` with your bug ID to check its status at any time.`
                )
                .addFields(
                    { name: '📋 Bug ID',    value: `\`${queued.bugId}\``,    inline: true },
                    { name: '📊 Status',    value: '🔴 Open',                 inline: true },
                )
                .setTimestamp();

            await thread.send({ embeds: [embed] }).catch(() => {});
        }
    } catch { /* thread may have been deleted */ }

    // DM the reporter
    try {
        const reporter  = await client.users.fetch(reporterId);
        const supporter = await Supporter.findOne({ userId: reporterId });
        const footer    = premiumFooter(supporter);
        const dmEmbed = new EmbedBuilder()
            .setTitle('✅ Your Queued Bug Report Is Now Active')
            .setColor(0x2ecc71)
            .setDescription(
                `Your queued bug report has a slot and is now being tracked!\n\n` +
                `You can check its status with \`/bug\`.`
            )
            .addFields(
                { name: '📋 Bug ID',   value: `\`${queued.bugId}\``,       inline: true },
                { name: '🔗 Thread',   value: `<#${queued.threadId}>`,     inline: true },
                { name: '📊 Status',   value: '🔴 Open',                   inline: true },
            )
            .setTimestamp();

        if (footer) dmEmbed.setFooter(footer);

        await reporter.send({ embeds: [dmEmbed] });
    } catch { /* DMs may be closed */ }
}

/**
 * Guild-wide queue promotion with premium-first ordering.
 * Processes all queued bugs in a guild and promotes the next eligible one,
 * prioritising premium supporters over free users.
 */
async function promoteNextInGuild(client, guildId) {
    // Fetch all queued bugs in the guild, oldest first within each user
    const queued = await Bug.find({ guildId, isQueued: true }).sort({ createdAt: 1 });
    if (!queued.length) return;

    // Collect the oldest queued bug per reporter
    const perReporter = {};
    for (const bug of queued) {
        if (!perReporter[bug.reporterId]) perReporter[bug.reporterId] = bug;
    }

    const reporterIds = Object.keys(perReporter);
    const supporters  = await Supporter.find({ userId: { $in: reporterIds } });
    const premiumSet  = new Set(supporters.map(s => s.userId));

    // Sort: premium users first, then by oldest queued bug
    reporterIds.sort((a, b) => {
        const aPremium = premiumSet.has(a);
        const bPremium = premiumSet.has(b);
        if (aPremium && !bPremium) return -1;
        if (!aPremium && bPremium)  return  1;
        return perReporter[a].createdAt - perReporter[b].createdAt;
    });

    for (const reporterId of reporterIds) {
        const maxActive  = premiumSet.has(reporterId) ? 3 : 1;
        const active     = await Bug.countDocuments({
            guildId, reporterId, isQueued: false, status: { $ne: 'Resolved' },
        });
        if (active < maxActive) {
            await promoteQueuedBug(client, guildId, reporterId);
            return;
        }
    }
}

module.exports = { dmReporterUpdate, promoteQueuedBug, promoteNextInGuild, premiumFooter };