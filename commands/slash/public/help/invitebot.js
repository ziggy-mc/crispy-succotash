const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('invite')
        .setDescription('Get a invite link to invite MUIZI Tracker to your server!'),
    async execute(interaction) {
        try {
            // Reply to the interaction
            await interaction.reply({ 
                content: 'Here is the link! https://bugs.ziggymc.me/invite', 
                flags: 64
            });
        } catch (error) {
            await interaction.reply({ 
                content: `An error has occured, ${error.message}
                Please run this command again. If this issue persists, report it to the support server: https://bugs.ziggymc.me/support`, 
                flags: 64 
            });
        }
    },
};
