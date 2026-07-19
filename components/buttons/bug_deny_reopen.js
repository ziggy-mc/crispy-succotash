const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const Bug = require('../../Schemas.js/cBug');
const GuildConfig = require('../../Schemas.js/guildConfig');
const Supporter = require('../../Schemas.js/Supporter');
const { premiumFooter } = require('../../utils/bugQueue');
const { pendingReopens } = require('../../utils/reopenRequests');

async function hasStaffAccess(interaction) {
    if (interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return true;
    const guildConfig = await GuildConfig.findOne({ guildId: interaction.guildId });
    if (guildConfig?.bugStaffRoleId && interaction.member.roles.cache.has(guildConfig.bugStaffRoleId)) return true;
    return false;
}

module.exports = {
    customId: 'bug_deny_reopen', // matched by prefix in componentCreate

    async execute(interaction, client) {
        await interaction.deferReply({ ephemeral: true });

        const parts   = interaction.customId.split(':');
        const guildId = parts[1];
        const bugId   = parts[2];

        if (!await hasStaffAccess(interaction)) {
            return interaction.editReply({ content: '❌ You need staff or admin permissions to dismiss reopen requests.' });
        }

        const bug = await Bug.findOne({ guildId, bugId });
        if (!bug) {
            return interaction.editReply({ content: `❌ Bug report \`${bugId}\` not found.` });
        }

        pendingReopens.delete(bugId);

        // Remove buttons from the reopen-request message
        try {
            await interaction.message.edit({ components: [] });
        } catch { /* message may no longer be editable */ }

        // DM reporter about the dismissal
        try {
            const reporter  = await client.users.fetch(bug.reporterId);
            const supporter = await Supporter.findOne({ userId: bug.reporterId });
            const dmEmbed = new EmbedBuilder()
                .setTitle('❌ Reopen Request Dismissed')
                .setColor(0xe74c3c)
                .setDescription(`Your request to reopen bug report \`${bug.bugId}\` was dismissed by staff.`)
                .addFields({ name: '📋 Bug ID', value: `\`${bug.bugId}\``, inline: true })
                .setTimestamp();

            const footer = premiumFooter(supporter);
            if (footer) dmEmbed.setFooter(footer);

            await reporter.send({ embeds: [dmEmbed] });
        } catch { /* DMs may be closed */ }

        await interaction.editReply({ content: `✅ Reopen request for \`${bugId}\` has been dismissed.` });
    },
};