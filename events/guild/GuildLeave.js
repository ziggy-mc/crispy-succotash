const { EmbedBuilder } = require('discord.js');
const { LogError } = require('../../utils/logger');

module.exports = {
    name: "GuildLeave",
    once: false,
    async execute(guild, client) {
        try {
            const logChannelId = client.config?.logChannelId;
            const channel = logChannelId ? client.channels.cache.get(logChannelId) : null;
            if (!channel) console.log('Log channel not found for GuildLeave.js');

            const embed = new EmbedBuilder()
                .setTitle('Left Guild')
                .setDescription(`I have left the guild **${guild.name}** with ${guild.memberCount} members!`)
                .setColor('#FF0000')
                .setTimestamp();

            if (channel) {
                channel.send({ embeds: [embed] });
            }
            console.log(`Left guild ${guild.name} with ${guild.memberCount} members!`);
        } catch (error) {
            LogError(error, client);
            console.log(error);
        }
    }
}
