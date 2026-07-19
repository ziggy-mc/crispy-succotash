const {
    SlashCommandBuilder, EmbedBuilder,
    ActionRowBuilder, ButtonBuilder, ButtonStyle,
    StringSelectMenuBuilder, PermissionFlagsBits,
} = require('discord.js');
const Bug = require('../../../Schemas.js/cBug');
const GuildConfig = require('../../../Schemas.js/guildConfig');
const { dmReporterUpdate, promoteQueuedBug } = require('../../../utils/bugQueue');

const STATUS_COLOR = { 'Open': 0xe74c3c, 'In Progress': 0xf39c12, 'Resolved': 0x2ecc71 };
const STATUS_EMOJI = { 'Open': '🔴', 'In Progress': '🟡', 'Resolved': '🟢' };

function buildEmbed(bug) {
    return new EmbedBuilder()
        .setTitle(`🛠️ Bug Panel — ${bug.bugId}`)
        .setColor(STATUS_COLOR[bug.status] ?? 0x3498db)
        .addFields(
            { name: 'Original Title', value: bug.originalTitle,                           inline: false },
            { name: 'Status',         value: `${STATUS_EMOJI[bug.status]} ${bug.status}`, inline: true  },
            { name: 'Reporter',       value: `<@${bug.reporterId}>`,                      inline: true  },
            { name: 'Thread',         value: `<#${bug.threadId}>`,                        inline: false },
            { name: 'Reported',       value: `<t:${Math.floor(bug.createdAt / 1000)}:F>`, inline: true  },
            ...(bug.resolvedAt ? [{
                name:   '✅ Resolved At',
                value:  `<t:${Math.floor(bug.resolvedAt / 1000)}:F>`,
                inline: true,
            }] : []),
        );
}

const statusRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
        .setCustomId('bug_status_select')
        .setPlaceholder('Set status...')
        .addOptions([
            { label: '🔴 Open',        value: 'Open'        },
            { label: '🟡 In Progress', value: 'In Progress' },
            { label: '🟢 Resolved',    value: 'Resolved'    },
        ])
);

const deleteRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
        .setCustomId('bug_delete')
        .setLabel('Delete Bug')
        .setEmoji('🗑️')
        .setStyle(ButtonStyle.Danger)
);

async function hasStaffAccess(interaction) {
    const member = interaction.member;
    if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;

    const guildConfig = await GuildConfig.findOne({ guildId: interaction.guildId });
    if (guildConfig?.bugStaffRoleId && member.roles.cache.has(guildConfig.bugStaffRoleId)) return true;

    return false;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('bugss')
        .setDescription('Staff: manage a bug report.')
        .addStringOption(option =>
            option.setName('bug-id')
                .setDescription('The bug ID to manage')
                .setRequired(true)
                .setAutocomplete(true)
        ),

    async autocomplete(interaction) {
        const focused = interaction.options.getFocused();
        const bugs = await Bug.find({
            guildId: interaction.guildId,
            bugId: { $regex: focused, $options: 'i' }
        }).limit(25);

        await interaction.respond(
            bugs.map(b => ({
                name:  `${b.bugId} — ${b.status}${b.isQueued ? ' [queued]' : ''}`,
                value: b.bugId,
            }))
        );
    },
    settings: {isDeveloperOnly: true },

    async execute(interaction, client) {
        if (!await hasStaffAccess(interaction)) {
            return interaction.reply({ content: '❌ You need to be an Administrator or have the configured staff role to use this command.', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        const bugId = interaction.options.getString('bug-id');
        let bug     = await Bug.findOne({ guildId: interaction.guildId, bugId });

        if (!bug) {
            return interaction.editReply({ content: `❌ No bug found with ID \`${bugId}\`.` });
        }

        await interaction.editReply({
            embeds:     [buildEmbed(bug)],
            components: [statusRow, deleteRow],
        });

        const msg = await interaction.fetchReply();
        const collector = msg.createMessageComponentCollector({ time: 5 * 60 * 1000 });

        collector.on('collect', async i => {
            if (i.user.id !== interaction.user.id) {
                return i.reply({ content: '❌ Only the person who opened this panel can use it.', ephemeral: true });
            }

            await i.deferUpdate();

            // ── Status change ──
            if (i.customId === 'bug_status_select') {
                const newStatus = i.values[0];
                const update    = {
                    status:     newStatus,
                    resolvedAt: newStatus === 'Resolved' ? new Date() : null,
                };

                bug = await Bug.findOneAndUpdate({ guildId: interaction.guildId, bugId }, update, { new: true });

                // Post a status-update message in the bug thread
                try {
                    const thread = await client.channels.fetch(bug.threadId);
                    if (thread) {
                        const threadUpdateEmbed = new EmbedBuilder()
                            .setTitle('📊 Bug Status Updated')
                            .setColor(STATUS_COLOR[bug.status] ?? 0x3498db)
                            .addFields(
                                { name: '📊 New Status', value: `${STATUS_EMOJI[bug.status]} ${bug.status}`, inline: true },
                                { name: '🔧 Updated By', value: `<@${interaction.user.id}>`,                  inline: true },
                                ...(bug.resolvedAt ? [{ name: '✅ Resolved At', value: `<t:${Math.floor(bug.resolvedAt.getTime() / 1000)}:F>`, inline: false }] : []),
                            )
                            .setTimestamp();
                        await thread.send({ embeds: [threadUpdateEmbed] });

                        // Lock the thread when resolved so only staff/mods can post
                        if (newStatus === 'Resolved') {
                            await thread.setLocked(true, 'Bug resolved').catch(() => {});
                        } else {
                            // Unlock if status is moved back out of Resolved
                            await thread.setLocked(false, 'Bug status updated').catch(() => {});
                        }
                    }
                } catch { /* thread may no longer be accessible */ }

                // DM reporter about the status change
                await dmReporterUpdate(client, bug.reporterId, bug, 'updated');

                // If resolved, promote any queued bug for this reporter
                if (newStatus === 'Resolved') {
                    await promoteQueuedBug(client, interaction.guildId, bug.reporterId);
                }

                try {
                    await interaction.editReply({
                        embeds:     [buildEmbed(bug)],
                        components: [statusRow, deleteRow],
                    });
                } catch { /* message may no longer be accessible */ }
            }

            // ── Delete ──
            if (i.customId === 'bug_delete') {
                collector.stop('deleted');

                const reporterId = bug.reporterId;
                const guildId    = interaction.guildId;

                await Bug.deleteOne({ guildId, bugId });

                // DM reporter that the bug was deleted
                await dmReporterUpdate(client, reporterId, bug, 'deleted');

                // Promote any queued bug for this reporter
                await promoteQueuedBug(client, guildId, reporterId);

                const ranInsideThread = interaction.channelId === bug.threadId;

                try {
                    const thread = await client.channels.fetch(bug.threadId);
                    if (thread) await thread.delete('Bug deleted via panel');
                } catch { /* thread may already be gone */ }

                if (!ranInsideThread) {
                    try {
                        await interaction.editReply({
                            content:    `✅ Bug \`${bugId}\` has been deleted.`,
                            embeds:     [],
                            components: [],
                        });
                    } catch { /* message no longer accessible */ }
                }
            }
        });

        collector.on('end', async (_, reason) => {
            if (reason !== 'deleted') {
                try {
                    await interaction.editReply({ components: [] });
                } catch { /* channel or message may no longer exist */ }
            }
        });
    },
};