const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const Bug = require('../../../Schemas.js/cBug');
const GuildConfig = require('../../../Schemas.js/guildConfig');
const Supporter = require('../../../Schemas.js/Supporter');
const { premiumFooter } = require('../../../utils/bugQueue');

const STATUS_COLOR = { 'Open': 0xe74c3c, 'In Progress': 0xf39c12, 'Resolved': 0x2ecc71 };
const encode = (text) => encodeURIComponent(text);

const statusMap = {
    'Open': 'open',
    'In Progress': 'in-progress',
    'Resolved': 'completed'
};
const STATUS_EMOJI = { 'Open': '🔴', 'In Progress': '🟡', 'Resolved': '🟢' };

async function isStaff(interaction) {
    const member = interaction.member;
    if (!member) return false; // DM context — no guild membership
    if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
    const guildConfig = await GuildConfig.findOne({ guildId: interaction.guildId });
    return !!(guildConfig?.bugStaffRoleId && member.roles.cache.has(guildConfig.bugStaffRoleId));
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('bug')
        .setDescription('Check the status of a bug report.')
        .addStringOption(option =>
            option.setName('bug-id')
                .setDescription('The bug ID (e.g. bug-xkz#4829)')
                .setRequired(true)
                .setAutocomplete(true)
        ),

    async autocomplete(interaction) {
        const focused      = interaction.options.getFocused();
        const staff        = await isStaff(interaction);
        const isSupporter  = await Supporter.findOne({ userId: interaction.user.id });
        const inGuild      = !!interaction.guildId;

        // Premium (supporter): their own bugs across all guilds (takes priority over staff role)
        // Staff (non-premium): all bugs in this guild
        // Free non-staff: their own bugs in this guild only (or across DMs if no guild)
        const query = { bugId: { $regex: focused, $options: 'i' } };
        if (isSupporter) {
            query.reporterId = interaction.user.id;
        } else if (staff) {
            query.guildId = interaction.guildId;
        } else {
            query.reporterId = interaction.user.id;
            if (inGuild) query.guildId = interaction.guildId;
        }

        const bugs = await Bug.find(query).limit(25);

        await interaction.respond(
            bugs.map(b => ({
                name:  `${b.bugId}${b.guildId !== interaction.guildId ? ' 🌐' : ''} — ${b.isQueued ? '⏳ Queued' : b.status}`,
                value: b.bugId,
            }))
        );
    },
    settings: { isGlobal: true },

    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const bugId      = interaction.options.getString('bug-id');
        const staff      = await isStaff(interaction);
        const isSupporter = await Supporter.findOne({ userId: interaction.user.id });

        // Try current guild first; premium users may also find their bugs from other guilds.
        // In DMs there is no guild, so skip the guild-scoped lookup.
        let bug = interaction.guildId
            ? await Bug.findOne({ guildId: interaction.guildId, bugId })
            : null;
        if (!bug && (isSupporter || !interaction.guildId)) {
            bug = await Bug.findOne({ bugId, reporterId: interaction.user.id });
        }

        if (!bug) {
            return interaction.editReply({ content: `❌ No bug found with ID \`${bugId}\`.` });
        }

        // Non-staff can only view their own bugs
        if (!staff && bug.reporterId !== interaction.user.id) {
            return interaction.editReply({ content: `❌ You can only view your own bug reports.` });
        }

        const isCrossGuild = bug.guildId !== interaction.guildId;

        const displayStatus = bug.isQueued
            ? '⏳ Queued (waiting for an active slot)'
            : `${STATUS_EMOJI[bug.status]} ${bug.status}`;
        const displayColor = bug.isQueued
            ? 0xf39c12
            : (STATUS_COLOR[bug.status] ?? 0x3498db);

        const embed = new EmbedBuilder()
            .setTitle(`${bug.isQueued ? '⏳' : STATUS_EMOJI[bug.status]} ${bug.bugId}`)
            .setColor(displayColor)
            .addFields(
                { name: '📋 Original Title', value: bug.originalTitle,          inline: false },
                { name: '📊 Status',         value: displayStatus,               inline: true  },
                { name: '👤 Reported By',    value: `<@${bug.reporterId}>`,      inline: true  },
                { name: '🔗 Thread',         value: `<#${bug.threadId}>`,        inline: false },
                { name: '📅 Reported',       value: `<t:${Math.floor(bug.createdAt / 1000)}:F>`, inline: false },
                ...(isCrossGuild ? [{ name: '🌐 Server', value: `Server ID: \`${bug.guildId}\``, inline: false }] : []),
            );

        if (bug.resolvedAt) {
            embed.addFields({
                name:  '✅ Resolved At',
                value: `<t:${Math.floor(bug.resolvedAt / 1000)}:F>`,
                inline: false,
            });
        }

        const footer = premiumFooter(isSupporter);
        if (footer) embed.setFooter(footer);

        await interaction.editReply({ embeds: [embed] });
    },
};