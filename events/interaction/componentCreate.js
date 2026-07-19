const { ComponentType } = require("discord.js");
const { wrapExecution } = require("../../utils/systemMonitor");

module.exports = {
  name: "interactionCreate",
  once: false,
  async execute(interaction, client) {
    if (interaction.isButton() && interaction.isStringSelectMenu() && interaction.isModalSubmit()) return;

    let component;

    switch (true) {
      case interaction.isButton():
        component = client.components.buttons.get(interaction.customId)
          || client.components.buttons.get(interaction.customId.split(':')[0]);
        break;
      case interaction.isStringSelectMenu():
      case interaction.componentType === ComponentType.ChannelSelect:
      case interaction.componentType === ComponentType.MentionableSelect:
      case interaction.componentType === ComponentType.UserSelect:
      case interaction.componentType === ComponentType.RoleSelect:
        component = client.components.selectMenus.get(interaction.customId);
        break;
      case interaction.isModalSubmit():
      case interaction.componentType === ComponentType.TextInput:
        component = client.components.modals.get(interaction.customId);
        break;
      default:
        return;
    }

    if (!component) return;
    if (await client.helpers.checkPermissions("interaction", interaction, component, client)) return;

    try {
      await wrapExecution("cmd_" + (interaction.customId ?? "").split(":")[0], "command", () => component.execute(interaction, client));
    } catch (error) {
      client.logger.error(`[Interactions] Error executing component ${interaction.customId}: ${error.message}`, error);
      if (interaction.replied || interaction.deferred) interaction.followUp({ content: "There was an error while executing this component!", flags: 64 });
      else interaction.reply({ content: "There was an error while executing this component!", flags: 64 });
  }
 } 
}