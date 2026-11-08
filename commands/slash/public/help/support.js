const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('support')
        .setDescription('Get the link to the support server of MUIZI Tracker!'),
    async execute(interaction) {
        try {
            // Reply to the interaction
            await interaction.reply({ 
                content: 'Here is the link! https://mtr.evtrg.com/support', 
                flags: 64
            });
        } catch (error) {
            await interaction.reply({ 
                content: `${error.message}
                Please run this command again. If this issue persists, report it to the support server: https://mtr.evtrg.com/support`, 
                flags: 64     
            });
        }
    },
};
