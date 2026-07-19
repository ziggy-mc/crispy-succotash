const BotStatus = require("../Schemas.js/BotStatus");

// Module-level client reference — set once on ready, used by heartbeat and status updates
let _client = null;
let _heartbeatInterval = null;

const BOT_STATUS_ID = "global_bot_status";

/**
 * Stores the Discord client so the monitor can check connection state
 * without requiring it to be passed on every call.
 * @param {import("discord.js").Client} client
 */
function setClient(client) {
  _client = client;
}

/**
 * Resolves status string based on execution time (ms).
 * @param {number} ms
 * @returns {"Operational"|"Minor"|"Degraded"|"Critical"}
 */
function resolveStatus(ms) {
  if (ms < 2500) return "Operational";
  if (ms < 5000) return "Minor";
  if (ms <= 7500) return "Degraded";
  return "Critical";
}

/**
 * Reads the embedded systems array, derives the overall bot status, and
 * writes it back to the single BotStatus document (upsert — never duplicates).
 */
async function updateBotStatus() {
  let doc;
  try {
    doc = await BotStatus.findById(BOT_STATUS_ID).lean();
  } catch {
    return; // DB unavailable — leave existing BotStatus as-is
  }

  const systems = doc?.systems ?? [];
  const summary = { operational: 0, minor: 0, degraded: 0, critical: 0, offline: 0 };
  for (const s of systems) {
    const key = s.status.toLowerCase();
    if (key in summary) summary[key]++;
  }

  const total = systems.length;
  let status;

  if (!_client?.isReady() || _client?.ws?.status !== 0) {
    status = "Offline";
  } else if (summary.offline > 0 || (total > 0 && summary.critical / total >= 0.5)) {
    status = "Major Outage";
  } else if (summary.critical > 0 || summary.degraded > 0 || summary.minor > 0) {
    status = "Degraded";
  } else {
    status = "Operational";
  }

  // Always update the ONE global document — upsert ensures no duplicate on restart
  await BotStatus.findOneAndUpdate(
    { _id: BOT_STATUS_ID },
    { status, lastUpdated: new Date(), summary },
    { upsert: true, new: true }
  );
}

/**
 * Persists a status record for a given system inside the single BotStatus document.
 * Updates the matching entry in the embedded systems array, or adds it if absent.
 * Runs fire-and-forget — never blocks execution.
 * @param {string} systemId
 * @param {"command"|"event"} type
 * @param {"Operational"|"Minor"|"Degraded"|"Critical"|"Offline"} status
 * @param {number} responseTime ms
 */
function saveStatus(systemId, type, status, responseTime) {
  const entry = { systemId, type, status, responseTime, lastUpdated: new Date() };

  // Try to update an existing entry in the embedded array
  BotStatus.findOneAndUpdate(
    { _id: BOT_STATUS_ID, "systems.systemId": systemId },
    {
      $set: {
        "systems.$.status": status,
        "systems.$.responseTime": responseTime,
        "systems.$.lastUpdated": entry.lastUpdated,
      },
    }
  ).then((doc) => {
    if (!doc) {
      // Entry not yet in the array — push it (also creates the parent doc if missing)
      return BotStatus.findOneAndUpdate(
        { _id: BOT_STATUS_ID },
        { $push: { systems: entry } },
        { upsert: true }
      );
    }
  }).then(() => {
    updateBotStatus().catch(() => {});
  }).catch(() => {});
}

/**
 * Seeds the single BotStatus document with every known command and event on bot
 * startup.  Each system is inserted only if it is not already present, so
 * repeated restarts never create duplicates or reset existing status data.
 *
 * @param {import("discord.js").Client} client
 */
async function seedSystems(client) {
  const systems = [];

  for (const [name] of client.commands?.slash ?? [])    systems.push({ systemId: "cmd_" + name, type: "command" });
  for (const [name] of client.commands?.context ?? [])  systems.push({ systemId: "cmd_" + name, type: "command" });
  for (const [name] of client.commands?.prefix ?? [])   systems.push({ systemId: "cmd_" + name, type: "command" });
  for (const [name] of client.events ?? [])             systems.push({ systemId: "evt_" + name, type: "event" });

  // Ensure the parent document exists
  await BotStatus.findOneAndUpdate(
    { _id: BOT_STATUS_ID },
    { $setOnInsert: { status: "Operational", lastUpdated: new Date(), summary: { operational: 0, minor: 0, degraded: 0, critical: 0, offline: 0 }, systems: [] } },
    { upsert: true }
  );

  // Add all new systems concurrently — each op only inserts if systemId is absent (preserves existing data)
  await Promise.all(
    systems.map((sys) =>
      BotStatus.updateOne(
        { _id: BOT_STATUS_ID, "systems.systemId": { $ne: sys.systemId } },
        { $push: { systems: { ...sys, status: "Operational", responseTime: 0, lastUpdated: new Date() } } }
      )
    )
  );

  await updateBotStatus().catch(() => {});
}

/**
 * Wraps an async function with execution-time tracking and status recording.
 *
 * @param {string} systemId          — command or event name
 * @param {"command"|"event"} type
 * @param {Function} fn              — async function to execute
 * @param {object} [options]
 * @param {boolean} [options.forceOperational] — when true, always records OPERATIONAL on success
 *                                               (use for once-fired events like "ready")
 * @returns {Promise<*>}             — resolves / rejects exactly as fn does
 */
async function wrapExecution(systemId, type, fn, options = {}) {
  const { forceOperational = false } = options;
  const start = Date.now();
  try {
    const result = await fn();
    const elapsed = Date.now() - start;
    const status = forceOperational ? "Operational" : resolveStatus(elapsed);
    saveStatus(systemId, type, status, elapsed);
    return result;
  } catch (err) {
    const elapsed = Date.now() - start;
    saveStatus(systemId, type, "OFFLINE", elapsed);
    throw err; // re-throw so existing error handlers still work
  }
}

/**
 * Evaluates overall bot status from the single BotStatus document.
 *
 * @param {import("discord.js").Client} [client]
 * @returns {Promise<{status: string, detail: string}>}
 */
async function getBotStatus(client) {
  if (client && !_client) setClient(client);
  const c = _client;

  if (!c?.isReady() || c?.ws?.status !== 0) {
    return { status: "Offline", detail: "Discord WebSocket is not ready" };
  }

  let doc;
  try {
    doc = await BotStatus.findById(BOT_STATUS_ID).lean();
  } catch {
    return { status: "Degraded", detail: "Unable to query BotStatus collection" };
  }

  const systems = doc?.systems ?? [];

  if (!systems.length) {
    return { status: "Operational", detail: "No systems recorded yet" };
  }

  const counts = { OPERATIONAL: 0, MINOR: 0, DEGRADED: 0, CRITICAL: 0, OFFLINE: 0 };
  for (const s of systems) counts[s.status] = (counts[s.status] || 0) + 1;

  const total = systems.length;

  if (counts.OFFLINE > 0 || counts.CRITICAL / total >= 0.5) {
    return { status: "MAJOR OUTAGE", detail: `${counts.OFFLINE} offline, ${counts.CRITICAL} critical` };
  }
  if (counts.CRITICAL > 0 || counts.DEGRADED > 0 || counts.MINOR > 0) {
    return { status: "Degraded", detail: `${counts.DEGRADED} degraded, ${counts.MINOR} minor, ${counts.CRITICAL} critical` };
  }
  return { status: "Operational", detail: "All systems operational" };
}

/**
 * Starts a repeating heartbeat that refreshes the global BotStatus document
 * every 30 seconds. Safe to call multiple times — clears any prior interval.
 */
function startHeartbeat() {
  if (_heartbeatInterval) clearInterval(_heartbeatInterval);
  _heartbeatInterval = setInterval(() => {
    updateBotStatus().catch(() => {});
  }, 30 * 1000);
}

/**
 * Stops the heartbeat interval (useful for graceful shutdown).
 */
function stopHeartbeat() {
  if (_heartbeatInterval) {
    clearInterval(_heartbeatInterval);
    _heartbeatInterval = null;
  }
}

module.exports = { wrapExecution, getBotStatus, saveStatus, seedSystems, setClient, startHeartbeat, stopHeartbeat };
