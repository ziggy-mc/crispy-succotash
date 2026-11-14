const { onCollect } = require('../../../utils/collectorSafety');
const { hasStaffAccess, escapeRegex } = require('../../../utils/reportAccess');
const { getPremiumEntitlement } = require('../../../utils/premiumEntitlement');
const {
    SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits,
    ActionRowBuilder, ButtonBuilder, ButtonStyle,
    StringSelectMenuBuilder,
} = require('discord.js');

const Bug = require('../../../Schemas.js/cBug');
const GuildConfig = require('../../../Schemas.js/guildConfig');
const { dmReporterUpdate, promoteQueuedBug } = require('../../../utils/bugQueue');
const UserPremium = require('../../../Schemas.js/Supporter');
const { getUserSettings, onBugUpdated, onBugDeleted } = require('../../../utils/bugStatsService');
const { applyStatusTag } = require('../../../utils/bugForumTags');

async function isPremium(userId) {
    const user = await getPremiumEntitlement(userId);
    return Boolean(user);
}

// ===================== SHARED =====================
const STATUS_COLOR = {
    'Open': 0xe74c3c,
    'In Progress': 0xf39c12,
    'Resolved': 0x2ecc71
};

const STATUS_EMOJI = {
    'Open': '🔴',
    'In Progress': '🟡',
    'Resolved': '🟢'
};



// ===================== BUG LIST =====================
const BUGS_PER_PAGE = 10;

function buildListEmbed(bugs, total, page, totalPages, filter) {
    const filterLabel =
        filter === 'all'
            ? 'All'
            : `${STATUS_EMOJI[filter] ?? '⏳'} ${filter}`;

    const embed = new EmbedBuilder()
        .setTitle(`🐛 Thread List — ${filterLabel}`)
        .setColor(0x3498db)
        .setFooter({
            text: `Page ${page}/${totalPages} • ${total} total`
        })
        .setTimestamp();

    if (bugs.length === 0) {
        embed.setDescription(
            'No threads found matching that filter.'
        );

        return embed;
    }

    const lines = bugs.map(b => {
        const statusLabel = b.isQueued
            ? '⏳ Queued'
            : `${STATUS_EMOJI[b.status]} ${b.status}`;

        return `**\`${b.bugId}\`** — ${statusLabel}\n↳ <@${b.reporterId}> · <#${b.threadId}> · ${b.originalTitle.slice(0, 120)}`;
    });

    embed.setDescription(lines.join('\n\n'));

    return embed;
}

// ===================== BUG PANEL =====================
function buildEmbed(bug) {
    return new EmbedBuilder()
        .setTitle(`🛠️ Report Panel — ${bug.bugId}`)
        .setColor(
            STATUS_COLOR[bug.status] ?? 0x3498db
        )
        .addFields(
            {
                name: 'Original Title',
                value: bug.originalTitle,
                inline: false
            },
            {
                name: 'Status',
                value: `${STATUS_EMOJI[bug.status]} ${bug.status}`,
                inline: true
            },
            {
                name: 'Reporter',
                value: `<@${bug.reporterId}>`,
                inline: true
            },
            {
                name: 'Thread',
                value: `<#${bug.threadId}>`,
                inline: false
            },
            {
                name: 'Reported',
                value: `<t:${Math.floor(bug.createdAt / 1000)}:F>`,
                inline: true
            },
            ...(bug.resolvedAt ? [{
                name: '✅ Resolved At',
                value: `<t:${Math.floor(bug.resolvedAt / 1000)}:F>`,
                inline: true,
            }] : []),
        );
}

const statusRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
        .setCustomId('bug_status_select')
        .setPlaceholder('Set status...')
        .addOptions([
            { label: '🔴 Open', value: 'Open' },
            { label: '🟡 In Progress', value: 'In Progress' },
            { label: '🟢 Resolved', value: 'Resolved' },
        ])
);

const deleteRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
        .setCustomId('bug_delete')
        .setLabel('Delete Thread')
        .setEmoji('🗑️')
        .setStyle(ButtonStyle.Danger)
);

// ===================== COMMAND =====================
module.exports = {
    data: new SlashCommandBuilder()
        .setName('manage')
        .setDescription('Manage threads')
        .addSubcommand(sub =>
            sub.setName('list')
                .setDescription('List of reports')
                .addStringOption(opt =>
                    opt.setName('filter')
                        .setDescription('Filter by status')
                        .addChoices(
                            { name: '🔴 Open', value: 'Open' },
                            { name: '🟡 In Progress', value: 'In Progress' },
                            { name: '🟢 Resolved', value: 'Resolved' },
                            { name: '⏳ Queued', value: 'Queued' },
                            { name: '📋 All', value: 'all' },
                        )
                )
        )
        .addSubcommand(sub =>
            sub.setName('thread')
                .setDescription('Manage a report')
                .addStringOption(option =>
                    option.setName('thread-id')
                        .setDescription('The Custom Thread ID')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
        ),

    async autocomplete(interaction) {
        if (!await hasStaffAccess(interaction)) return interaction.respond([]);
        if (
            interaction.options.getSubcommand() !== 'thread'
        ) {
            return;
        }

        const focused = interaction.options.getFocused();

        const bugs = await Bug.find({
            guildId: interaction.guildId,
            bugId: {
                $regex: escapeRegex(focused),
                $options: 'i'
            }
        }).limit(25);

        await interaction.respond(
            bugs.map(b => ({
                name: `${b.bugId} — ${b.status}${b.isQueued ? ' [queued]' : ''}`,
                value: b.bugId,
            }))
        );
    },

    async execute(interaction, client) {
        if (!await hasStaffAccess(interaction)) {
            return interaction.reply({
                content: '❌ You need to be an Administrator or have the configured staff role.',
                ephemeral: true,
            });
        }

        const sub = interaction.options.getSubcommand();

        // ===================== LIST =====================
        if (sub === 'list') {
            await interaction.deferReply({
                ephemeral: true
            });

            const filter =
                interaction.options.getString('filter') ??
                'active';

            let query = {
                guildId: interaction.guildId
            };

            if (filter === 'Queued') {
                query.isQueued = true;
            } else if (filter === 'all') {
            } else if (filter === 'active') {
                query.isQueued = false;
                query.status = {
                    $ne: 'Resolved'
                };
            } else {
                query.status = filter;
                query.isQueued = false;
            }

            const total = await Bug.countDocuments(query);

            const totalPages = Math.max(
                1,
                Math.ceil(total / BUGS_PER_PAGE)
            );

            let page = 1;

            const fetchPage = (p) =>
                Bug.find(query)
                    .sort({ createdAt: -1 })
                    .skip((p - 1) * BUGS_PER_PAGE)
                    .limit(BUGS_PER_PAGE);

            let bugs = await fetchPage(page);

            const buildRow = (p) =>
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('buglist_prev')
                        .setLabel('◀ Prev')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(p <= 1),

                    new ButtonBuilder()
                        .setCustomId('buglist_page')
                        .setLabel(`${p} / ${totalPages}`)
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(true),

                    new ButtonBuilder()
                        .setCustomId('buglist_next')
                        .setLabel('Next ▶')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(
                            p >= totalPages
                        ),
                );

            await interaction.editReply({
                embeds: [
                    buildListEmbed(
                        bugs,
                        total,
                        page,
                        totalPages,
                        filter
                    )
                ],
                components:
                    totalPages > 1
                        ? [buildRow(page)]
                        : [],
            });

            if (totalPages <= 1) return;

            const msg = await interaction.fetchReply();

            const collector =
                msg.createMessageComponentCollector({
                    time: 5 * 60 * 1000
                });

            collector.once('end', () => interaction.editReply({ components: [] }).catch(() => {}));
            onCollect(collector, interaction, client, async i => {
                if (
                    i.user.id !== interaction.user.id
                ) {
                    return i.reply({
                        content:
                            '❌ Only the opener can use this.',
                        ephemeral: true
                    });
                }

                await i.deferUpdate();
            if (!await hasStaffAccess(i)) { collector.stop('permissions'); return interaction.editReply({ content: 'Staff access has changed. Reopen the command after checking your roles.', embeds: [], components: [] }); }


                if (
                    i.customId === 'buglist_prev' &&
                    page > 1
                ) {
                    page--;
                }

                if (
                    i.customId === 'buglist_next' &&
                    page < totalPages
                ) {
                    page++;
                }

                bugs = await fetchPage(page);

                await interaction.editReply({
                    embeds: [
                        buildListEmbed(
                            bugs,
                            total,
                            page,
                            totalPages,
                            filter
                        )
                    ],
                    components: [
                        buildRow(page)
                    ],
                });
            });

            return;
        }

        // ===================== BUG PANEL =====================
        if (sub === 'thread') {
            await interaction.deferReply({
                ephemeral: true
            });

            const bugId =
                interaction.options.getString('thread-id');

            let bug = await Bug.findOne({
                guildId: interaction.guildId,
                bugId
            });

            if (!bug) {
                return interaction.editReply({
                    content:
                        `❌ No thread found with ID \`${bugId}\`.`
                });
            }

            await interaction.editReply({
                embeds: [
                    buildEmbed(bug)
                ],
                components: [
                    statusRow,
                    deleteRow
                ],
            });

            const msg = await interaction.fetchReply();

            const collector =
                msg.createMessageComponentCollector({
                    time: 5 * 60 * 1000
                });

            collector.once('end', () => interaction.editReply({ components: [] }).catch(() => {}));
            onCollect(collector, interaction, client, async i => {
                if (
                    i.user.id !== interaction.user.id
                ) {
                    return i.reply({
                        content:
                            '❌ Only the opener can use this.',
                        ephemeral: true
                    });
                }

                await i.deferUpdate();
            if (!await hasStaffAccess(i)) { collector.stop('permissions'); return interaction.editReply({ content: 'Staff access has changed. Reopen the command after checking your roles.', embeds: [], components: [] }); }
            bug = await Bug.findOne({ guildId: interaction.guildId, bugId });
            if (!bug) { collector.stop('missing'); return interaction.editReply({ content: 'This report no longer exists.', embeds: [], components: [] }); }

                if (
                    i.customId === 'bug_status_select'
                ) {
                    const newStatus = i.values[0];
                    if (!['Open', 'In Progress', 'Resolved'].includes(newStatus) || newStatus === bug.status) return;

                    const previousBug =
                        bug.toObject();

                    bug = await Bug.findOneAndUpdate(
                        {
                            guildId:
                                interaction.guildId,
                            bugId
                        },
                        {
                            status: newStatus,
                            resolvedAt:
                                newStatus === 'Resolved'
                                    ? new Date()
                                    : null,
                        },
                        {
                            new: true
                        }
                    );

                    await onBugUpdated(
                        previousBug,
                        bug
                    );

                    // ===== APPLY DISCORD FORUM TAG =====
                    try {
                        const thread =
                            await client.channels.fetch(
                                bug.threadId
                            );

                        if (thread) {
                            await applyStatusTag(
                                thread,
                                interaction.guildId,
                                newStatus
                            );
                        }
                    } catch (tagErr) {
                        client.logger?.warn?.(
                            `[BugTracker] Failed to update forum tag for ${bug.bugId}: ${tagErr.message}`
                        );
                    }

                    // ===== THREAD LOCK / UNLOCK =====
                    try {
                        const thread =
                            await client.channels.fetch(
                                bug.threadId
                            );

                        if (thread) {
                            const settings =
                                await getUserSettings(
                                    bug.reporterId
                                );

                            const pingContent =
                                settings?.pingOnUpdate
                                    ? `<@${bug.reporterId}>`
                                    : null;

                            if (
                                newStatus ===
                                'Resolved'
                            ) {
                                await thread.setLocked(
                                    true,
                                    'Thread report resolved'
                                );
                            } else {
                                await thread.setLocked(
                                    false,
                                    'Thread reopened / updated'
                                );
                            }

                            await thread.send({
                                content:
                                    pingContent ??
                                    undefined,

                                embeds: [
                                    new EmbedBuilder()
                                        .setTitle(
                                            '📊 Status Updated'
                                        )
                                        .setColor(
                                            STATUS_COLOR[newStatus] ??
                                            0x3498db
                                        )
                                        .addFields(
                                            {
                                                name: 'Status',
                                                value:
                                                    `${STATUS_EMOJI[newStatus]} ${newStatus}`,
                                                inline: true
                                            },
                                            {
                                                name: 'Updated By',
                                                value:
                                                    `<@${interaction.user.id}>`,
                                                inline: true
                                            }
                                        )
                                        .setTimestamp()
                                ]
                            });
                        }
                    } catch {}

                    // ===== ONLY DM IF PREMIUM + USER ENABLED DMS =====
                    const premium =
                        await isPremium(
                            bug.reporterId
                        );

                    const settings =
                        await getUserSettings(
                            bug.reporterId
                        );

                    if (
                        premium &&
                        settings?.dmOnUpdate
                    ) {
                        await dmReporterUpdate(
                            client,
                            bug.reporterId,
                            bug,
                            'updated'
                        );
                    }

                    if (
                        newStatus ===
                        'Resolved'
                    ) {
                        await promoteQueuedBug(
                            client,
                            interaction.guildId,
                            bug.reporterId
                        );
                    }

                    await interaction.editReply({
                        embeds: [
                            buildEmbed(bug)
                        ],
                        components: [
                            statusRow,
                            deleteRow
                        ],
                    });
                }

                if (
                    i.customId === 'bug_delete'
                ) {
                    const removed = await Bug.findOneAndDelete({ guildId: interaction.guildId, bugId });
                    if (!removed) return;
                    await onBugDeleted(removed);

                    // ===== DELETE FORUM THREAD =====
                    try {
                        const thread =
                            await client.channels.fetch(
                                bug.threadId
                            );

                        if (thread) {
                            await interaction.editReply({
                                content:
                                    `✅ Thread \`${bugId}\` deleted.`,
                                embeds: [],
                                components: [],
                            });

                            await thread.delete(
                                'Thread deleted via manage command'
                            );
                        }
                    } catch (err) {
                        console.error(
                            'Failed to delete thread:',
                            err
                        );

                        await interaction.editReply({
                            content:
                                `:x: Thread \`${bugId}\` failed to delete.`,
                            embeds: [],
                            components: [],
                        });
                    }

                    // ===== DM + QUEUE (RESPECT USER SETTINGS) =====
                    const settings =
                        await getUserSettings(
                            bug.reporterId
                        );

                    if (settings?.dmOnUpdate) {
                        await dmReporterUpdate(
                            client,
                            bug.reporterId,
                            bug,
                            'deleted'
                        );
                    }

                    await promoteQueuedBug(
                        client,
                        interaction.guildId,
                        bug.reporterId
                    );
                }
            });
        }
    },
};
