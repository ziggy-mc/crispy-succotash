module.exports = {
    name: 'guildDelete',
    async execute(guild, client) {
        client.logger.info(`[Guild] Removed from ${guild.id}; retained reports and configuration. Free access now excludes this guild.`);
    },
};
