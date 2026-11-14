// Explicit, additive index preparation; never syncIndexes/dropIndexes.
require('dotenv/config');
const mongoose = require('mongoose');
async function main() {
    if (!process.env.MONGO_URL) throw new Error('MONGO_URL is required');
    await mongoose.connect(process.env.MONGO_URL, { autoIndex: false, ...(process.env.MONGO_DB ? { dbName: process.env.MONGO_DB } : {}) });
    try {
        await require('../Schemas.js/cBug').createIndexes();
        console.log('Report indexes created; existing documents and indexes retained.');
    } finally { await mongoose.disconnect(); }
}
main().catch(() => { console.error('Index preparation failed. Check local database access and existing unique-key conflicts.'); process.exitCode = 1; });
