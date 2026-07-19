const {
    SlashCommandBuilder,
    EmbedBuilder
} = require('discord.js');

const Supporter = require('../../../Schemas.js/Supporter'); // Adjust path if needed

module.exports = {
    data: new SlashCommandBuilder()
        .setName('supporter')
        .setDescription('Check supporter information for a user.')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('The user to check')
                .setRequired(true)
        ),
    settings: { isDeveloperOnly: true },

    async execute(interaction) {
        const user = interaction.options.getUser('user');

        try {
            const supporter = await Supporter.findOne({
                userId: user.id
            });

            if (!supporter) {
                return interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor('Red')
                            .setTitle('Supporter Lookup')
                            .setDescription(`${user.tag} is not a supporter.`)
                    ],
                    ephemeral: true
                });
            }

            const embed = new EmbedBuilder()
                .setColor('Green')
                .setTitle('Supporter Information')
                .setThumbnail(user.displayAvatarURL({ dynamic: true }))
                .addFields(
                    {
                        name: 'User ID',
                        value: supporter.userId,
                        inline: true
                    },
                    {
                        name: 'Username',
                        value: supporter.username,
                        inline: true
                    },
                    {
                        name: 'Role ID',
                        value: supporter.roleId,
                        inline: true
                    },
                    {
                        name: 'Role Name',
                        value: supporter.roleName,
                        inline: true
                    },
                    {
                        name: 'Added At',
                        value: `<t:${Math.floor(
                            supporter.addedAt.getTime() / 1000
                        )}:F>`,
                        inline: false
                    }
                )
                .setTimestamp();

            await interaction.reply({
                embeds: [embed]
            });

        } catch (err) {
            console.error(err);

            await interaction.reply({
                content: 'An error occurred while checking the supporter database.',
                ephemeral: true
            });
        }
    }
};