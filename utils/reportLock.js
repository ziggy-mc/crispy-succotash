// Serialize report slot decisions for one reporter in one guild without retaining idle users.
const pending = new Map();
async function withReportLock(key, task) {
    const previous = pending.get(key) || Promise.resolve();
    let release;
    const current = new Promise(resolve => { release = resolve; });
    pending.set(key, current);
    await previous;
    try { return await task(); }
    finally { release(); if (pending.get(key) === current) pending.delete(key); }
}
module.exports = { withReportLock };
