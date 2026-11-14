const BotStatus = require('../Schemas.js/BotStatus');
const mongoose = require('mongoose');
let client;
let stopTimer;
let flushing = false;
const recent = new Map();
const BOT_STATUS_ID = 'global_bot_status';
function setClient(value) { client = value; }
function saveStatus(systemId, type, status, responseTime) {
    if (recent.size >= 250 && !recent.has(systemId)) recent.delete(recent.keys().next().value);
    recent.set(systemId, { systemId, type, status: status.toUpperCase(), responseTime, lastUpdated: new Date() });
}
async function getBotStatus(c = client) {
    if (!c?.isReady()) return { status: 'Offline', detail: 'Discord connection unavailable' };
    if (mongoose.connection.readyState !== 1) return { status: 'Degraded', detail: 'Database unavailable' };
    const failed = [...recent.values()].some(s => s.status === 'OFFLINE' && Date.now() - s.lastUpdated < 300000);
    return failed ? { status: 'Degraded', detail: 'A recent operation failed' } : { status: 'Operational', detail: 'Gateway and database connected' };
}
async function flush() {
    if (flushing || mongoose.connection.readyState !== 1) return;
    flushing = true;
    try {
        const health = await getBotStatus();
        // One write per heartbeat rather than several reads/writes on every event.
        await BotStatus.updateOne({ _id: BOT_STATUS_ID }, {
            $set: { status: health.status, lastUpdated: new Date(), systems: [...recent.values()] },
        }, { upsert: true });
    } catch { /* stale heartbeat is surfaced as unknown by readers */ }
    finally { flushing = false; }
}
function startHeartbeat() {
    stopHeartbeat();
    const timer = setInterval(flush, 30000); timer.unref();
    stopTimer = () => clearInterval(timer);
    flush();
}
function stopHeartbeat() { if (stopTimer) stopTimer(); stopTimer = null; }
async function seedSystems() { /* Keep measured results only; unexecuted commands have no measured status. */ }
async function wrapExecution(systemId, type, fn) {
    const start = performance.now();
    try {
        const result = await fn();
        saveStatus(systemId, type, 'OPERATIONAL', Math.round(performance.now() - start));
        return result;
    } catch (error) {
        saveStatus(systemId, type, 'OFFLINE', Math.round(performance.now() - start));
        throw error;
    }
}
module.exports = { wrapExecution, getBotStatus, saveStatus, seedSystems, setClient, startHeartbeat, stopHeartbeat };
