const { SlashCommandBuilder, EmbedBuilder, MessageFlags, ApplicationIntegrationType, InteractionContextType } = require('discord.js');
const Bug = require('../../../Schemas.js/cBug');
const { getPremiumEntitlement } = require('../../../utils/premiumEntitlement');
const { installedGuildContext, hasStaffAccess, visibleReports, escapeRegex, sourceName } = require('../../../utils/reportAccess');
const { premiumFooter } = require('../../../utils/bugQueue');

async function context(interaction, client) {
    const installedContext = installedGuildContext(interaction, client);
    return {
        userId: interaction.user.id, installedContext,
        premium: !!await getPremiumEntitlement(interaction.user.id),
        staffGuildId: installedContext && await hasStaffAccess(interaction) ? interaction.guildId : null,
    };
}
function queryFor(ctx) {
    return ctx.staffGuildId
        ? { $or: [{ reporterId: ctx.userId }, { guildId: ctx.staffGuildId }] }
        : { reporterId: ctx.userId };
}
module.exports = {
    data: new SlashCommandBuilder().setName('thread').setDescription('Check a report, including your eligible reports from other servers.')
        .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
        .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel)
        .addStringOption(o => o.setName('bug-id').setDescription('Custom Thread ID').setRequired(true).setAutocomplete(true))
        .addStringOption(o => o.setName('server-id').setDescription('Source server ID, if the same report ID exists in several servers.')),
    settings: { isGlobal: true }, cooldown: '2s',
    async autocomplete(interaction, client) {
        const ctx = await context(interaction, client);
        if (!ctx.premium && !ctx.installedContext) return interaction.respond([]);
        const candidates = await Bug.find({ ...queryFor(ctx), bugId: { $regex: escapeRegex(interaction.options.getFocused()), $options: 'i' } }).sort({ createdAt: -1 }).limit(25).lean();
        const bugs = await visibleReports(candidates, ctx, client);
        return interaction.respond(bugs.map(b => ({
            name: `${b.bugId} · ${sourceName(client, b.guildId)} · ${b.isQueued ? 'Queued' : b.status}`.slice(0, 100),
            value: `${b.guildId}:${b.bugId}`,
        })));
    },
    async execute(interaction, client) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const ctx = await context(interaction, client);
        if (!ctx.premium && !ctx.installedContext) return interaction.editReply('Global access in DMs and user-installed contexts requires Premium. Use this command in a server where MUIZI Tracker is installed.');
        const input = interaction.options.getString('bug-id');
        const split = /^(\d{17,20}):(.+)$/.exec(input);
        const bugId = split ? split[2] : input;
        const guildId = split?.[1] || interaction.options.getString('server-id');
        const candidates = await Bug.find({ ...queryFor(ctx), bugId, ...(guildId ? { guildId } : {}) }).limit(25).lean();
        const allowed = await visibleReports(candidates, ctx, client);
        const local = allowed.find(b => b.guildId === interaction.guildId);
        if (!local && allowed.length > 1) return interaction.editReply('Several servers have that report ID. Select a result from autocomplete or provide its source server ID.');
        const bug = local || allowed[0];
        if (!bug) return interaction.editReply('No accessible report found. Check its ID and source server.');
        const embed = new EmbedBuilder().setTitle(bug.bugId).setColor(bug.status === 'Resolved' ? 0x2ecc71 : 0x7c3aed)
            .addFields(
                { name: 'Title', value: bug.originalTitle.slice(0, 1024) },
                { name: 'Status', value: bug.isQueued ? 'Queued' : bug.status, inline: true },
                { name: 'Source server', value: `${sourceName(client, bug.guildId)}\n\`${bug.guildId}\``.slice(0, 1024) },
                { name: 'Thread', value: `[Open report](https://discord.com/channels/${bug.guildId}/${bug.threadId})` },
                { name: 'Reported', value: `<t:${Math.floor(new Date(bug.createdAt).getTime() / 1000)}:F>` },
            );
        if (bug.resolvedAt) embed.addFields({ name: 'Resolved', value: `<t:${Math.floor(new Date(bug.resolvedAt).getTime() / 1000)}:F>` });
        const footer = premiumFooter(await getPremiumEntitlement(ctx.userId));
        if (footer) embed.setFooter(footer);
        return interaction.editReply({ embeds: [embed] });
    },
};
