const {
    SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType,
} = require('discord.js');
const GuildConfig = require('../../../Schemas.js/guildConfig');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setup')
        .setDescription('Configure the bug tracker for this server.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(sub =>
            sub.setName('forum')
                .setDescription('Set the forum channel where bug threads are created.')
                .addChannelOption(opt =>
                    opt.setName('channel')
                        .setDescription('The forum channel to watch for bug reports')
                        .addChannelTypes(ChannelType.GuildForum)
                        .setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub.setName('staffrole')
                .setDescription('Set the role that can manage bug reports.')
                .addRoleOption(opt =>
                    opt.setName('role')
                        .setDescription('The staff role for bug management')
                        .setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub.setName('pingrole')
                .setDescription('Set a role to ping in the thread when a new bug is reported.')
                .addRoleOption(opt =>
                    opt.setName('role')
                        .setDescription('The role to ping on new bug reports (use @everyone to clear)')
                        .setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub.setName('view')
                .setDescription('View the current bug tracker configuration.')
        ),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();

        if (sub === 'forum') {
            const channel = interaction.options.getChannel('channel');

            await GuildConfig.findOneAndUpdate(
                { guildId: interaction.guildId },
                { $set: { bugForumChannelId: channel.id } },
                { upsert: true, new: true }
            );

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle('✅ Bug Tracker Configured')
                        .setColor(0x2ecc71)
                        .setDescription(`Bug reports will now be tracked in <#${channel.id}>.\n\nWhen someone creates a thread in that forum, the bot will automatically assign it a bug ID and notify the reporter via DM. (Requires premium to receive dm)`)
                        .setTimestamp(),
                ],
                ephemeral: true,
            });
        }

        if (sub === 'staffrole') {
            const role = interaction.options.getRole('role');

            await GuildConfig.findOneAndUpdate(
                { guildId: interaction.guildId },
                { $set: { bugStaffRoleId: role.id } },
                { upsert: true, new: true }
            );

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle('✅ Staff Role Set')
                        .setColor(0x2ecc71)
                        .setDescription(`Members with <@&${role.id}> can now use \`/manage bug\` to manage bug reports.`)
                        .setTimestamp(),
                ],
                ephemeral: true,
            });
        }

        if (sub === 'pingrole') {
            const role = interaction.options.getRole('role');
            // If @everyone is selected, clear the ping role
            const roleId = role.id === interaction.guildId ? null : role.id;

            await GuildConfig.findOneAndUpdate(
                { guildId: interaction.guildId },
                { $set: { bugPingRoleId: roleId } },
                { upsert: true, new: true }
            );

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle(roleId ? '✅ Ping Role Set' : '✅ Ping Role Cleared')
                        .setColor(0x2ecc71)
                        .setDescription(
                            roleId
                                ? `<@&${roleId}> will be pinged in the thread whenever a new bug report is submitted.`
                                : `No role will be pinged on new bug reports.`
                        )
                        .setTimestamp(),
                ],
                ephemeral: true,
            });
        }

        if (sub === 'view') {
            const config = await GuildConfig.findOne({ guildId: interaction.guildId });

            const forumValue = config?.bugForumChannelId
                ? `<#${config.bugForumChannelId}>`
                : '❌ Not configured — use `/setup forum`';

            const staffRoleValue = config?.bugStaffRoleId
                ? `<@&${config.bugStaffRoleId}>`
                : 'Administrators only (no staff role set)';

            const pingRoleValue = config?.bugPingRoleId
                ? `<@&${config.bugPingRoleId}>`
                : 'None (no ping on new reports)';

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle('⚙️ Bug Tracker Configuration')
                        .setColor(0x3498db)
                        .addFields(
                            { name: '📋 Bug Forum Channel', value: forumValue,      inline: false },
                            { name: '👥 Staff Role',        value: staffRoleValue,  inline: false },
                            { name: '🔔 Ping Role',         value: pingRoleValue,   inline: false },
                        )
                        .setTimestamp(),
                ],
                ephemeral: true,
            });
        }
    },
};
