// Bounded, expiring request guard. Report keys include their source guild.
const entries = new Map();
const pendingReopens = {
    has(key) { const expiry = entries.get(key); if (expiry <= Date.now()) { entries.delete(key); return false; } return !!expiry; },
    add(key) {
        for (const [id, expiry] of entries) if (expiry <= Date.now()) entries.delete(id);
        if (entries.size >= 1000) entries.delete(entries.keys().next().value);
        entries.set(key, Date.now() + 24 * 3600000);
    },
    delete(key) { entries.delete(key); },
};
module.exports = { pendingReopens };
