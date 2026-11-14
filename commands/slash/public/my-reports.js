const { SlashCommandBuilder, EmbedBuilder, ApplicationIntegrationType, InteractionContextType } = require('discord.js');
const { personalReports } = require('../../../utils/personalReports');
const { installedGuildContext, escapeRegex } = require('../../../utils/reportAccess');
module.exports = {
    data: new SlashCommandBuilder().setName('myreports').setDescription('Your report summary, filters, and source servers.')
        .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
        .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel)
        .addStringOption(o => o.setName('status').setDescription('Filter reports').addChoices(...['Open', 'In Progress', 'Resolved', 'Queued'].map(value => ({ name: value, value }))))
        .addStringOption(o => o.setName('search').setDescription('Search report titles or IDs').setMaxLength(100))
        .addIntegerOption(o => o.setName('page').setDescription('Page number').setMinValue(1))
        .addStringOption(o => o.setName('sort').setDescription('Report order').addChoices({ name: 'Newest first', value: 'new' }, { name: 'Oldest first', value: 'old' })),
    settings: { isGlobal: true }, cooldown: '5s',
    async execute(interaction, client) {
        await interaction.deferReply({ flags: 64 });
        try {
            const installedContext = installedGuildContext(interaction, client);
            const data = await personalReports(client, interaction.user.id, { installedContext, global: !installedContext });
            const status = interaction.options.getString('status');
            const search = (interaction.options.getString('search') || '').toLowerCase();
            let reports = data.bugs.filter(b => (!status || b.status === status) && `${b.title} ${b.bugId}`.toLowerCase().includes(search));
            if (interaction.options.getString('sort') === 'old') reports.reverse();
            const pages = Math.max(1, Math.ceil(reports.length / 5));
            const page = Math.min(interaction.options.getInteger('page') || 1, pages);
            const embed = new EmbedBuilder().setTitle('Your reports').setColor(0x7c3aed)
                .setDescription(`**${data.openBugs} active · ${data.queuedBugs} queued · ${data.resolvedBugs} resolved**\nScope: ${data.scope === 'global' ? 'Premium account' : 'installed servers'}${data.limited ? ' · latest 200 accessible reports' : ''}`)
                .setFooter({ text: `Page ${page}/${pages} · ${reports.length} matching · use /myreports page to continue` });
            for (const b of reports.slice((page - 1) * 5, page * 5)) embed.addFields({
                name: `${b.bugId} · ${b.status}`.slice(0, 256),
                value: `${b.title.slice(0, 300)}\n${b.guildName.slice(0, 100)} · [Open thread](${b.threadUrl})`,
            });
            if (!reports.length) embed.addFields({ name: 'No matching reports', value: 'Try another filter, or create a report in a configured forum. Only reports you are authorized to access appear here.' });
            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            if (error.status === 403) return interaction.editReply(error.message);
            throw error;
        }
    },
};
