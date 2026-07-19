const checkPermissions = require("../../utils/checkPermissions");
const { wrapExecution } = require("../../utils/systemMonitor");

module.exports = {
  name: "interactionCreate",
  once: false,
  async execute(interaction, client) {

    // Handle autocomplete FIRST
    if (interaction.isAutocomplete()) {
      const command = client.commands.slash.get(interaction.commandName);
      if (command?.autocomplete) {
        try {
          await command.autocomplete(interaction, client);
        } catch (err) {
          console.error("Autocomplete error:", err);
        }
      }
      return; // stop here so it doesn't fall through
    }

    // Now handle slash commands
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.slash.get(interaction.commandName);
    if (!command)
      return interaction.reply({
        content: "Command is currently functioning abnormally",
        flags: 64
      });

    if (await client.helpers.checkPermissions("interaction", interaction, command, client))
      return;

    try {
      await wrapExecution("cmd_" + interaction.commandName, "command", () => command.execute(interaction, client));
    } catch (error) {
      client.logger.error(
        `[Interactions] Error executing slash command ${interaction.commandName}: ${error.message}`,
        error
      );

      if (interaction.replied || interaction.deferred)
        interaction.followUp({ content: "There was an error while executing this command!", flags: 64 });
      else
        interaction.reply({ content: "There was an error while executing this command!", flags: 64 });
    }
  },
};
