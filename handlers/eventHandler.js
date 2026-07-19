const loadFiles = require("../utils/fileLoader");
const path = require("node:path");
const { wrapExecution } = require("../utils/systemMonitor");

module.exports = async function loadEvents(client) {
  let eventCount = 0;
  client.events.clear();
  if (!client.events) client.events = new Map();

  try {
    const eventFiles = await loadFiles(path.join(__dirname, "..", "events"));

    if (eventFiles.length === 0) return client.logger.warn("[EventLoader] No event files found to load.");

    await Promise.all(
      eventFiles.map(async (file) => {
        const event = require(file);
        if (!event || event.isDisabled) return;

        const execute = (...args) =>
          wrapExecution("evt_" + event.name, "event", () => event.execute(...args, client), { forceOperational: !!event.once });
        client.events.set(event.name, event);
        eventCount++;

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
