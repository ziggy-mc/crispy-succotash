const { wrapExecution } = require("../../utils/systemMonitor");

module.exports = {
  name: "interactionCreate",
  once: false,
  async execute(interaction, client) {
    if (!interaction.isUserContextMenuCommand() && !interaction.isMessageContextMenuCommand()) return;
    const context = client.commands.context.get(interaction.commandName);
    if (!context) return;

    if (await client.helpers.checkPermissions("interaction", interaction, context, client)) return;

    try {
      await wrapExecution("cmd_" + interaction.commandName, "command", () => context.execute(interaction, client));
    } catch (error) {
      client.logger.error(`[Interactions] Error executing context command ${interaction.commandName}: ${error.message}`, error);
      if (interaction.replied || interaction.deferred) interaction.followUp({ content: "There was an error while executing this command!", flags: 64 });
      else interaction.reply({ content: "There was an error while executing this command!", flags: 64 });
    }
  },
};
