const loadFiles = require("../utils/fileLoader");
const path = require("node:path");
const { wrapExecution } = require("../utils/systemMonitor");

module.exports = async function loadEvents(client) {
  let eventCount = 0;
  if (client.eventListeners) {
    for (const { emitter, name, execute } of client.eventListeners) emitter.off(name, execute);
  }
  client.eventListeners = [];
  if (!client.events) client.events = new Map();
  client.events.clear();

  try {
    const eventFiles = await loadFiles(path.join(__dirname, "..", "events"));

    if (eventFiles.length === 0) return client.logger.warn("[EventLoader] No event files found to load.");

    await Promise.all(
      eventFiles.map(async (file) => {
        const event = require(file);
        if (!event || event.isDisabled) return;

        const execute = (...args) =>
          wrapExecution("evt_" + event.name, "event", () => event.execute(...args, client), { forceOperational: !!event.once }).catch(error => client.logger.error(`[Event] ${event.name}: ${error.message}`));
        client.events.set(path.relative(__dirname, file), event);
        eventCount++;

        client.eventListeners.push({ emitter: event.rest ? client.rest : client, name: event.name, execute });
        if (event.rest) event.once ? client.rest.once(event.name, execute) : client.rest.on(event.name, execute);
        else event.once ? client.once(event.name, execute) : client.on(event.name, execute);
      })
    );

    client.logger.info(`[SystemMonitor] System Status initialized — monitoring ${eventCount} event(s).`);
  } catch (error) {
    console.error(error)
    client.logger.error(`[EventLoader] Error loading event files: ${error.message}`, error);
  }
};
