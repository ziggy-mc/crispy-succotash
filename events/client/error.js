const { EmbedBuilder } = require("discord.js");

module.exports = {
  name: "error",
  once: false,
  async execute(error, client) {
    client.logger.error(`[Client] an error occurred ${error.name || "UnknownError"}: ${error.message}`, error);
    //! make the embed send to a channel you can code the rest of it or use webhooks
    // const embed = new EmbedBuilder()
    //   .setAuthor({ name: `Error in ${client.user.username}`, iconURL: client.user.displayAvatarURL({ size: 2048 }) })
    //   .setColor("Red")
    //   .addFields({ name: "Error Message", value: `\`\`\`yml\n${error.message ? (error.message.length > 1024 ? error.message.slice(0, 1021) + "..." : error.message) : "No message"}\`\`\``, inline: false }, { name: "Stack Trace", value: `\`\`\`yml\n${error.stack ? (error.stack.length > 1024 ? error.stack.slice(0, 1000) + "..." : error.stack) : "No stack trace"}\`\`\``, inline: false })
    //   .setTimestamp();
  },
};