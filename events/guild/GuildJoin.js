const { EmbedBuilder } = require('discord.js');
const { LogError } = require('../../utils/logger');

module.exports = {
    name: "GuildJoin",
    once: false,
    async execute(guild, client) {  
        try {
            const logChannelId = client.config?.logChannelId;
            const channel = logChannelId ? client.channels.cache.get(logChannelId) : null;
            if (!channel) console.log('Log channel not found for GuildJoin.js');

            const embed = new EmbedBuilder()
                .setTitle('New Guild!')
                .setDescription(`Joined guild **${guild.name}** with ${guild.memberCount} members!`)
                .setColor('#00FF00')
                .setTimestamp();

            console.log(`Joined guild ${guild.name} with ${guild.memberCount} members!`);
            if (channel) {
                channel.send({ embeds: [embed] });
            }
        } catch (error) {
            LogError(error, client);
            console.log(error);
        }
    }
}