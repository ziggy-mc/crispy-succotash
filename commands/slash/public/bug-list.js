const {
    SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits,
} = require('discord.js');
const Bug = require('../../../Schemas.js/cBug');
const GuildConfig = require('../../../Schemas.js/guildConfig');

const STATUS_EMOJI = { 'Open': '🔴', 'In Progress': '🟡', 'Resolved': '🟢' };
const BUGS_PER_PAGE    = 10;
const COLLECTOR_TIMEOUT = 5 * 60 * 1000;

async function hasStaffAccess(interaction) {
    const member = interaction.member;
    if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
    const guildConfig = await GuildConfig.findOne({ guildId: interaction.guildId });
    return !!(guildConfig?.bugStaffRoleId && member.roles.cache.has(guildConfig.bugStaffRoleId));
}

function buildListEmbed(bugs, total, page, totalPages, filter) {
    const filterLabel = filter === 'all' ? 'All' : `${STATUS_EMOJI[filter] ?? '⏳'} ${filter}`;

    const embed = new EmbedBuilder()
        .setTitle(`🐛 Bug List — ${filterLabel}`)
        .setColor(0x3498db)
        .setFooter({ text: `Page ${page}/${totalPages} • ${total} total` })
        .setTimestamp();

    if (bugs.length === 0) {
        embed.setDescription('No bugs found matching that filter.');
        return embed;
    }

    const lines = bugs.map(b => {
        const statusLabel = b.isQueued ? '⏳ Queued' : `${STATUS_EMOJI[b.status]} ${b.status}`;
        return `**\`${b.bugId}\`** — ${statusLabel}\n↳ <@${b.reporterId}> · <#${b.threadId}> · ${b.originalTitle}`;
    });

    embed.setDescription(lines.join('\n\n'));
    return embed;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('buglist')
        .setDescription('Staff: list bug reports in this server.')
        .addStringOption(opt =>
            opt.setName('filter')
                .setDescription('Filter by status (default: all active)')
                .setRequired(false)
                .addChoices(
                    { name: '🔴 Open',        value: 'Open'        },
                    { name: '🟡 In Progress', value: 'In Progress' },
                    { name: '🟢 Resolved',    value: 'Resolved'    },
                    { name: '⏳ Queued',      value: 'Queued'      },
                    { name: '📋 All',         value: 'all'         },
                )
        ),
settings: {isDeveloperOnly: true },

    async execute(interaction, client) {
        if (!await hasStaffAccess(interaction)) {
            return interaction.reply({
                content: '❌ You need to be an Administrator or have the configured staff role to use this command.',
                ephemeral: true,
            });
        }

        await interaction.deferReply({ ephemeral: true });

        const filter = interaction.options.getString('filter') ?? 'active';

        // Build mongo query based on filter
        let query = { guildId: interaction.guildId };
        if (filter === 'Queued') {
            query.isQueued = true;
        } else if (filter === 'all') {
            // no extra filter
        } else if (filter === 'active') {
            query.isQueued = false;
            query.status   = { $ne: 'Resolved' };
        } else {
            // specific status filter
            query.status   = filter;
            query.isQueued = false;
        }

        const total      = await Bug.countDocuments(query);
        const totalPages = Math.max(1, Math.ceil(total / BUGS_PER_PAGE));
        let page         = 1;

        const fetchPage = (p) =>
            Bug.find(query)
                .sort({ createdAt: -1 })
                .skip((p - 1) * BUGS_PER_PAGE)
                .limit(BUGS_PER_PAGE);

        let bugs = await fetchPage(page);

        const embed = buildListEmbed(bugs, total, page, totalPages, filter === 'active' ? 'Active' : filter);

        // Build navigation buttons if more than one page
        const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

        const buildRow = (p) => new ActionRowBuilder().addComponents(
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
                .setDisabled(p >= totalPages),
        );

        const components = totalPages > 1 ? [buildRow(page)] : [];

        await interaction.editReply({ embeds: [embed], components });

        if (totalPages <= 1) return;

        const msg       = await interaction.fetchReply();
        const collector = msg.createMessageComponentCollector({ time: 5 * 60 * 1000 });

        collector.on('collect', async i => {
            if (i.user.id !== interaction.user.id) {
                return i.reply({ content: '❌ Only the person who opened this list can page through it.', ephemeral: true });
            }

            await i.deferUpdate();

            if (i.customId === 'buglist_prev' && page > 1) page--;
            if (i.customId === 'buglist_next' && page < totalPages) page++;

            bugs = await fetchPage(page);
            const newEmbed = buildListEmbed(bugs, total, page, totalPages, filter === 'active' ? 'Active' : filter);

            await interaction.editReply({ embeds: [newEmbed], components: [buildRow(page)] });
        });

        collector.on('end', async () => {
            try {
                await interaction.editReply({ components: [] });
            } catch { /* message may no longer exist */ }
        });
    },
};
