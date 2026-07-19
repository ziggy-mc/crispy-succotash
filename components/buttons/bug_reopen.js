const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const Bug = require('../../Schemas.js/cBug');
const Supporter = require('../../Schemas.js/Supporter');
const { premiumFooter } = require('../../utils/bugQueue');
const { pendingReopens } = require('../../utils/reopenRequests');

const REOPEN_WINDOW_MS = 24 * 60 * 60 * 1000;

module.exports = {
    customId: 'bug_reopen', // matched by prefix in componentCreate
    settings: { isGlobal: true },

    async execute(interaction, client) {
        await interaction.deferReply({ ephemeral: true });

        const parts   = interaction.customId.split(':');
        const guildId = parts[1];
        const bugId   = parts[2];

        // Only the reporter (premium) may request a reopen
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

        if (bug.status !== 'Resolved') {
            return interaction.editReply({ content: '❌ This bug report is not resolved.' });
        }

        if (!bug.resolvedAt || Date.now() - bug.resolvedAt.getTime() > REOPEN_WINDOW_MS) {
            return interaction.editReply({ content: '❌ The 24-hour reopen window has expired.' });
        }

        if (pendingReopens.has(bugId)) {
            return interaction.editReply({ content: '❌ A reopen request for this bug is already pending staff review.' });
        }

        // Post a staff-facing reopen request in the bug thread
        try {
            const guild  = await client.guilds.fetch(guildId);
            const thread = await guild.channels.fetch(bug.threadId).catch(() => null);

            if (!thread) {
                return interaction.editReply({ content: '❌ The original bug thread no longer exists.' });
            }

            if (thread.archived) await thread.setArchived(false, 'Reopen requested').catch(() => {});

            const requestEmbed = new EmbedBuilder()
                .setTitle('🔓 Bug Reopen Request')
                .setColor(0x9b59b6)
                .setDescription(
                    `<@${interaction.user.id}> has requested to reopen this bug report.\n` +
                    `A staff member can approve or dismiss this request.`
                )
                .addFields(
                    { name: '📋 Bug ID',  value: `\`${bug.bugId}\``,   inline: true },
                    { name: '👤 Reporter', value: `<@${bug.reporterId}>`, inline: true },
                )
                .setTimestamp();

            const footer = premiumFooter(isSupporter);
            if (footer) requestEmbed.setFooter(footer);

            const confirmRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`bug_confirm_reopen:${guildId}:${bugId}`)
                    .setLabel('Approve Reopen')
                    .setEmoji('✅')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId(`bug_deny_reopen:${guildId}:${bugId}`)
                    .setLabel('Dismiss')
                    .setEmoji('❌')
                    .setStyle(ButtonStyle.Secondary),
            );

            await thread.send({ embeds: [requestEmbed], components: [confirmRow] });
            pendingReopens.add(bugId);
            await interaction.editReply({ content: '✅ Your reopen request has been submitted. Staff will review it.' });
        } catch (err) {
            client.logger?.error?.(`[BugReopen] Failed to post reopen request: ${err.message}`);
            await interaction.editReply({ content: '❌ Failed to submit reopen request. The thread may no longer be accessible.' });
        }
    },
};