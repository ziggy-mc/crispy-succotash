const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionFlagsBits,
} = require('discord.js');

const Bug = require('../Schemas.js/cBug');
const GuildConfig = require('../Schemas.js/guildConfig');
const Supporter = require('../Schemas.js/Supporter');
const { premiumFooter } = require('./bugQueue');
const { transitionBugStatus, BUG_STATUSES } = require('./bugStatus');

const REOPEN_WINDOW_MS = 24 * 60 * 60 * 1000;

async function hasStaffAccess(interaction) {
    if (!interaction.guild || !interaction.member) return false;
    if (interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return true;

    const guildConfig = await GuildConfig.findOne({ guildId: interaction.guildId });
    return Boolean(guildConfig?.bugStaffRoleId && interaction.member.roles.cache.has(guildConfig.bugStaffRoleId));
}

function parseBugButtonCustomId(customId) {
    const [, guildId, bugId] = (customId || '').split(':');
    if (!guildId || !bugId) return null;
    return { guildId, bugId };
}

async function sendReopenDM(user, bugData) {
    if (!user || !bugData) return false;

    const supporter = await Supporter.findOne({ userId: user.id });
    if (!supporter) return false;

    const embed = new EmbedBuilder()
        .setTitle('🔓 Request Reopen')
        .setColor(0x9b59b6)
        .setDescription(
            `Your bug report \`${bugData.bugId}\` is currently resolved. ` +
            `If the issue still exists, you can request a reopen for staff review.`
        )
        .addFields(
            { name: '📋 Bug ID', value: `\`${bugData.bugId}\``, inline: true },
            { name: '⏰ Window', value: '24 hours after resolution', inline: true },
        )
        .setTimestamp();

    const footer = premiumFooter(supporter);
    if (footer) embed.setFooter(footer);

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`bug_reopen:${bugData.guildId}:${bugData.bugId}`)
            .setLabel('Request Reopen')
            .setEmoji('🔓')
            .setStyle(ButtonStyle.Primary)
    );

    try {
        await user.send({ embeds: [embed], components: [row] });
        return true;
    } catch {
        return false;
    }
}

async function handleReopenRequest(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const parsed = parseBugButtonCustomId(interaction.customId);
    if (!parsed) {
        return interaction.editReply({ content: '❌ Invalid reopen request data.' });
    }

    const { guildId, bugId } = parsed;

    const isSupporter = await Supporter.findOne({ userId: interaction.user.id });
    if (!isSupporter) {
        return interaction.editReply({ content: '❌ This reopen option is only available to premium supporters.' });
    }

    const bug = await Bug.findOne({ guildId, bugId });
    if (!bug) {
        return interaction.editReply({ content: `❌ Bug report \`${bugId}\` not found.` });
    }

    if (bug.reporterId !== interaction.user.id) {
        return interaction.editReply({ content: '❌ You can only request to reopen your own bug reports.' });
    }

    if (bug.status !== BUG_STATUSES.RESOLVED) {
        return interaction.editReply({ content: 'This bug is no longer resolved, so it cannot be reopened.' });
    }

    if (!bug.resolvedAt || Date.now() - bug.resolvedAt.getTime() > REOPEN_WINDOW_MS) {
        return interaction.editReply({ content: '❌ The 24-hour reopen window has expired.' });
    }

    if (bug.reopenRequest?.pending) {
        return interaction.editReply({ content: '❌ A reopen request for this bug is already pending staff review.' });
    }

    const guild = await interaction.client.guilds.fetch(guildId).catch(() => null);
    if (!guild) {
        return interaction.editReply({ content: '❌ Unable to access the server for this bug report.' });
    }

    const thread = await guild.channels.fetch(bug.threadId).catch(() => null);
    if (!thread) {
        return interaction.editReply({ content: '❌ The original bug thread no longer exists.' });
    }

    if (thread.archived) await thread.setArchived(false, 'Reopen requested').catch(() => {});

    const now = new Date();
    bug.reopenRequest = {
        ...(bug.reopenRequest || {}),
        pending: true,
        requestedAt: now,
        requestedBy: interaction.user.id,
        decision: null,
        decidedAt: null,
        decidedBy: null,
    };

    await transitionBugStatus({
        client: interaction.client,
        bug,
        newStatus: BUG_STATUSES.REOPEN_REQUEST,
        reason: 'Bug reopen requested by reporter',
    });

    const requestEmbed = new EmbedBuilder()
        .setTitle('🟣 Reopen Request')
        .setColor(0x9b59b6)
        .setDescription(`<@${interaction.user.id}> requested to reopen this bug report.`)
        .addFields(
            { name: '📋 Bug ID', value: `\`${bug.bugId}\``, inline: true },
            { name: '👤 Reporter', value: `<@${bug.reporterId}>`, inline: true },
        )
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`bug_confirm_reopen:${guildId}:${bugId}`)
            .setLabel('Accept Reopen')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`bug_deny_reopen:${guildId}:${bugId}`)
            .setLabel('Deny Reopen')
            .setStyle(ButtonStyle.Danger),
    );

    try {
        const requestMessage = await thread.send({ embeds: [requestEmbed], components: [row] });

        bug.reopenRequest.staffThreadId = thread.id;
        bug.reopenRequest.staffMessageId = requestMessage.id;
        await bug.save();
    } catch (err) {
        interaction.client.logger?.error?.(`[ReopenFlow] Failed to post reopen request for ${bug.bugId}: ${err.message}`);

        bug.reopenRequest.pending = false;
        await transitionBugStatus({
            client: interaction.client,
            bug,
            newStatus: BUG_STATUSES.RESOLVED,
            reason: 'Reopen request rollback after message failure',
        });

        return interaction.editReply({ content: '❌ Failed to submit reopen request. Please try again.' });
    }

    try {
        await interaction.message.edit({ components: [] });
    } catch {
        // message may not be editable anymore
    }

    return interaction.editReply({ content: '✅ Your reopen request has been submitted. Staff will review it.' });
}

async function handleReopenDecision(interaction, accepted) {
    await interaction.deferReply({ ephemeral: true });

    const parsed = parseBugButtonCustomId(interaction.customId);
    if (!parsed) {
        return interaction.editReply({ content: '❌ Invalid reopen decision data.' });
    }

    const { guildId, bugId } = parsed;

    if (interaction.guildId !== guildId) {
        return interaction.editReply({ content: '❌ This decision must be made in the original server.' });
    }

    if (!await hasStaffAccess(interaction)) {
        return interaction.editReply({ content: '❌ You need staff or admin permissions to review reopen requests.' });
    }

    const bug = await Bug.findOne({ guildId, bugId });
    if (!bug) {
        return interaction.editReply({ content: `❌ Bug report \`${bugId}\` not found.` });
    }

    if (bug.status !== BUG_STATUSES.REOPEN_REQUEST || !bug.reopenRequest?.pending) {
        return interaction.editReply({ content: '❌ There is no pending reopen request for this bug.' });
    }

    bug.reopenRequest.pending = false;
    bug.reopenRequest.decision = accepted ? 'accepted' : 'denied';
    bug.reopenRequest.decidedAt = new Date();
    bug.reopenRequest.decidedBy = interaction.user.id;

    const nextStatus = accepted ? BUG_STATUSES.OPEN : BUG_STATUSES.RESOLVED;

    const { thread } = await transitionBugStatus({
        client: interaction.client,
        bug,
        newStatus: nextStatus,
        reason: accepted ? 'Reopen request accepted' : 'Reopen request denied',
    });

    try {
        await interaction.message.edit({ components: [] });
    } catch {
        // message may no longer be editable
    }

    if (thread) {
        const embed = new EmbedBuilder()
            .setTitle(accepted ? '✅ Reopen Accepted' : '❌ Reopen Denied')
            .setColor(accepted ? 0x2ecc71 : 0xe74c3c)
            .setDescription(
                accepted
                    ? `This bug has been reopened by <@${interaction.user.id}>.`
                    : `The reopen request was denied by <@${interaction.user.id}>.`
            )
            .addFields({ name: '📊 Current Status', value: accepted ? '🔴 Open' : '🟢 Resolved', inline: true })
            .setTimestamp();

        await thread.send({ embeds: [embed] }).catch(() => {});
    }

    try {
        const reporter = await interaction.client.users.fetch(bug.reporterId);
        const dmEmbed = new EmbedBuilder()
            .setTitle(accepted ? '🔓 Bug Reopened' : '🟢 Reopen Request Denied')
            .setColor(accepted ? 0x2ecc71 : 0xe74c3c)
            .setDescription(
                accepted
                    ? `Your bug report \`${bug.bugId}\` was reopened by staff.`
                    : `Your reopen request for \`${bug.bugId}\` was denied by staff. The bug remains resolved.`
            )
            .setTimestamp();

        await reporter.send({ embeds: [dmEmbed] }).catch(() => {});
    } catch {
        // ignore DM failures
    }

    return interaction.editReply({
        content: accepted
            ? `✅ Bug \`${bugId}\` has been reopened.`
            : `✅ Reopen request for \`${bugId}\` has been denied.`,
    });
}

module.exports = {
    REOPEN_WINDOW_MS,
    sendReopenDM,
    handleReopenRequest,
    handleReopenDecision,
};
