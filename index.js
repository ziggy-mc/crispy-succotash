require('dotenv/config');
const { Client, GatewayIntentBits, Collection, Options, Partials, Events } = require('discord.js');
const mongoose = require('mongoose');
const logger = require('./utils/logger');
const loadEvents = require('./handlers/eventHandler');
const loadComponents = require('./handlers/componentHandler');
const config = require('./config/config');
const { createApi } = require('./utils/internalApi');
const { initializeLifecycle } = require('./utils/lifecycle');
const { startDiagnostics } = require('./utils/diagnostics');
const { reconcileCurrentState } = require('./utils/bugStatsService');
const bugCleanup = require('./utils/bugCleanup');

function validateConfig() {
    for (const name of ['MONGO_URL', 'DISCORD_TOKEN', 'APP_ID', 'BOT_API_TOKEN']) {
        if (!process.env[name]) throw new Error(`Missing required environment variable: ${name}`);
    }
    if (process.env.BOT_API_TOKEN.length < 32) throw new Error('BOT_API_TOKEN must contain at least 32 characters');
}

async function start() {
    validateConfig();
    const client = new Client({
        // Keep member intent for staff/role features; message content for prefix commands and ping tracking.
        intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildMembers,
            GatewayIntentBits.MessageContent, GatewayIntentBits.DirectMessages],
        partials: [Partials.Channel],
        allowedMentions: { parse: ['users', 'roles'], repliedUser: false },
        makeCache: Options.cacheWithLimits({
            ...Options.DefaultMakeCacheSettings,
            MessageManager: 25, PresenceManager: 0, ReactionManager: 0, ReactionUserManager: 0,
        }),
        sweepers: { ...Options.DefaultSweeperSettings, messages: { interval: 300, lifetime: 600 } },
        shards: 'auto',
    });
    client.config = config; client.logger = logger;
    client.events = new Map();
    client.commands = { slash: new Collection(), prefix: new Collection(), context: new Collection() };
    client.components = { buttons: new Collection(), selectMenus: new Collection(), modals: new Collection() };
    client.cooldowns = new Map();
    client.helpers = { checkPermissions: require('./utils/checkPermissions') };
    initializeLifecycle(client);
    let server;
    let stopping = false;
    async function stop() {
        if (stopping) return;
        stopping = true;
        if (server) {
            server.close();
            server.closeIdleConnections();
        }
        await client.cleanup();
        client.destroy();
        await mongoose.disconnect();
    }
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
    client.once(Events.ClientReady, async () => {
        client.addCleanup(startDiagnostics(client));
        client.repeat(() => {
            const now = Date.now();
            for (const [key, expiry] of client.cooldowns) if (expiry <= now) client.cooldowns.delete(key);
        }, 60000);
        if (client.shard && client.shard.ids[0] !== 0) return;
        const cleanup = client.repeat(() => bugCleanup(client), 5 * 60000);
        await cleanup();
        // Event deltas keep stats current. Reconcile only on explicit local/admin request;
        // running it alongside mutations can overwrite newer totals.
        if (process.env.BUG_STATS_RECONCILE_ON_START === '1') await reconcileCurrentState();
    });
    try {
        await mongoose.connect(process.env.MONGO_URL, {
            ...(process.env.MONGO_DB ? { dbName: process.env.MONGO_DB } : {}),
            maxPoolSize: 10, minPoolSize: 0, maxIdleTimeMS: 60000, serverSelectionTimeoutMS: 10000,
            autoIndex: process.env.NODE_ENV !== 'production',
        });
        await Promise.all([loadEvents(client), loadComponents(client)]);
        const shardStart = Number(process.env.SHARD_START) || 0;
        const port = Number(process.env.BOT_API_PORT) || 3000 + shardStart;
        server = createApi(client, process.env.BOT_API_TOKEN).listen(port, process.env.BOT_API_HOST || '127.0.0.1');
        server.on('error', error => { logger.error(`[API] ${error.code || 'Listen failed'}`); stop().then(() => { process.exitCode = 1; }); });
        await client.login(process.env.DISCORD_TOKEN);
        return client;
    } catch (error) { await stop(); throw error; }
}
if (require.main === module) start().catch(error => { logger.error(`[Startup] ${error.message}`); process.exitCode = 1; });
module.exports = { start, validateConfig };
