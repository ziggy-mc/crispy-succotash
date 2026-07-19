const { PermissionFlagsBits } = require("discord.js");

module.exports = {
  name: "ping",
  description: "Replies with Pong!",
  permissions: {
    user: [],
    bot: [PermissionFlagsBits.ReadMessageHistory],
  },
  cooldown: "2s",
  execute: async (message, args, client) => {
    const sentMessage = await message.reply("Pinging...");
    const botLatency = sentMessage.createdTimestamp - message.createdTimestamp;
    const apiLatency = client.ws.ping;

    sentMessage.edit(`Pong!\nBot Latency: ${botLatency} ms\nAPI Latency: ${apiLatency} ms`);
  },
};