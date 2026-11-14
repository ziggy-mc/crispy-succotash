const { PermissionFlagsBits } = require('discord.js');
const parseTime = require('./timeUtils');
const { getPremiumEntitlement } = require('./premiumEntitlement');
module.exports = async function checkPermissions(type, target, command, client) {
    const { user = [], bot = [] } = command.permissions || {};
    const { isPremiumOnly, isServerOwnerOnly, isDeveloperOnly, isGlobal } = command.settings || {};
    const userId = target.user?.id || target.author?.id;
    const errors = [];
    if (user.some(p => !target.member?.permissions?.has(p))) errors.push('You are missing required permissions.');
    if (bot.some(p => !target.guild?.members?.me?.permissions?.has(p))) errors.push('I am missing required server permissions.');
    if (isPremiumOnly && !await getPremiumEntitlement(userId)) errors.push('This action requires Premium.');
    if (isServerOwnerOnly && (!target.guild || userId !== target.guild.ownerId)) errors.push('This action requires the server owner.');
    if (isDeveloperOnly && !client.config.developers.includes(userId)) errors.push('Developer only.');
    if (!isGlobal && !target.guild) errors.push('Use this command in a server where the bot is installed.');
    const reply = content => target.reply({ content, ...(type === 'interaction' ? { flags: 64 } : {}) });
    if (errors.length) { await reply(errors.join('\n')); return true; }
    const duration = parseTime(command.cooldown || '0s');
    if (duration > 0) {
        const key = `${target.guild?.id || 'dm'}:${userId}:${command.data?.name || command.name || command.customId}`;
        const now = Date.now();
        if (client.cooldowns.get(key) > now) { await reply('Please wait a moment before using this action again.'); return true; }
        client.cooldowns.set(key, now + duration);
    }
    return false;
};
