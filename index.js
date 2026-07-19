require("dotenv/config");
const { Client, GatewayIntentBits, Collection, Options, Partials, Events, ChannelType } = require("discord.js");
const mongoose = require("mongoose");
const express = require("express");
const logger = require("./utils/logger");
const loadEvents = require("./handlers/eventHandler");
const loadComponents = require("./handlers/componentHandler");
const config = require("./config/config");
const checkPermissions = require("./utils/checkPermissions");
const bugCleanup = require("./utils/bugCleanup"); // adjust path if needed
const {
  DASHBOARD_REFRESH_MS,
  getGlobalStats,
  getGuildStats,
  getUserDashboardData,
  getUserSettings,
  updateUserSettings,
  refreshAllDashboardCaches,
  reconcileCurrentState,
} = require("./utils/bugStatsService");


// --- Shard setup ---
const shardStart = Number(process.env.SHARD_START) || 0;
const shardEnd = Number(process.env.SHARD_END) || 0;
const totalShards = Math.max(Number(process.env.TOTAL_SHARDS) || 1, 1);

console.log(`[Shard] Starting shards ${shardStart}-${shardEnd} of ${totalShards}`);

// --- CLIENT ---
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
  allowedMentions: { parse: ["users", "roles"], repliedUser: false },
  makeCache: Options.cacheWithLimits({ PresenceManager: 0, ReactionManager: 0, ReactionUserManager: 0 }),
  shards: "auto"
});

// --- GLOBAL PROPERTIES ---
client.config = config;
client.logger = logger;
client.events = new Map();
client.commands = { slash: new Collection(), prefix: new Collection(), context: new Collection() };
client.components = { buttons: new Collection(), selectMenus: new Collection(), modals: new Collection() };
client.cooldowns = new Map();
client.helpers = { checkPermissions };

module.exports = client;

// --- DATABASE + LOGIN ---
(async () => {
  try {
    if (!process.env.MONGO_URL) return client.logger.error('[Database] MongoDB URL is missing in ".env"');

    await mongoose.connect(process.env.MONGO_URL);
    client.logger.info("[Database] MongoDB connected");

    await Promise.all([loadEvents(client), loadComponents(client)]);

    client.login(process.env.DISCORD_TOKEN);
  } catch (error) {
    logger.error("Login/database error:", error);
  }
})();

client.once("ready", () => {
  if (client.shard && client.shard.ids[0] !== 0) return;

  client.logger.warn(`[BugCleanup] RUNNING ON SHARD 0 ONLY`);
  client.logger.info(`[BugCleanup] Initializing cleaning setup...`);

  reconcileCurrentState().catch((err) => client.logger.error(`[BugStats] reconcile failed: ${err.message}`, err));
  refreshAllDashboardCaches().catch((err) => client.logger.error(`[BugDashboard] initial refresh failed: ${err.message}`, err));

  bugCleanup(client);

  setInterval(() => {
    bugCleanup(client);
  }, 5 * 60 * 1000);

  setInterval(() => {
    reconcileCurrentState().catch((err) => client.logger.error(`[BugStats] reconcile failed: ${err.message}`, err));
    refreshAllDashboardCaches().catch((err) => client.logger.error(`[BugDashboard] refresh failed: ${err.message}`, err));
  }, DASHBOARD_REFRESH_MS);
});

// --- EXPRESS WEB SERVER ---
const PORT = 3000 + shardStart;
const app = express();
app.use(express.json());

app.get("/api/bugs/stats/global", async (req, res) => {
  try {
    const stats = await getGlobalStats();
    return res.json({ ok: true, data: stats });
  } catch (error) {
    logger.error("[BugAPI] global stats error:", error);
    return res.status(500).json({ ok: false, error: "Failed to load global bug stats" });
  }
});

app.get("/api/bugs/stats/guild/:guildId", async (req, res) => {
  try {
    const stats = await getGuildStats(req.params.guildId);
    return res.json({ ok: true, data: stats });
  } catch (error) {
    logger.error("[BugAPI] guild stats error:", error);
    return res.status(500).json({ ok: false, error: "Failed to load guild bug stats" });
  }
});

app.get("/api/bugs/dashboard/:userId", async (req, res) => {
  try {
    const dashboard = await getUserDashboardData(req.params.userId);
    return res.json({ ok: true, data: dashboard });
  } catch (error) {
    logger.error("[BugAPI] user dashboard error:", error);
    return res.status(500).json({ ok: false, error: "Failed to load user dashboard" });
  }
});

app.get("/api/bugs/settings/:userId", async (req, res) => {
  try {
    const settings = await getUserSettings(req.params.userId);
    return res.json({
      ok: true,
      data: {
        userId: settings.userId,
        pingOnUpdate: settings.pingOnUpdate,
        dmOnUpdate: settings.dmOnUpdate,
        updatedAt: settings.updatedAt,
      },
    });
  } catch (error) {
    logger.error("[BugAPI] user settings read error:", error);
    return res.status(500).json({ ok: false, error: "Failed to load user settings" });
  }
});

app.post("/api/bugs/settings/:userId", async (req, res) => {
  try {
    const updates = {
      pingOnUpdate: req.body?.pingOnUpdate,
      dmOnUpdate: req.body?.dmOnUpdate,
    };
    const settings = await updateUserSettings(req.params.userId, updates);

    return res.json({
      ok: true,
      data: {
        userId: settings.userId,
        pingOnUpdate: settings.pingOnUpdate,
        dmOnUpdate: settings.dmOnUpdate,
        updatedAt: settings.updatedAt,
      },
    });
  } catch (error) {
    logger.error("[BugAPI] user settings update error:", error);
    return res.status(500).json({ ok: false, error: "Failed to update user settings" });
  }
});

app.get("/", (req, res) => res.send(`Shard ${shardStart}-${shardEnd} alive!`));
app.get("/ping", (req, res) => res.send(`Shard ${shardStart}-${shardEnd} pong!`));
app.listen(PORT, () => console.log(`Shard ${shardStart}-${shardEnd} web server running on port ${PORT}`));

// --- MESSAGE TRACKER ---
const { trackMessage } = require("./utils/spamTracker.js");
client.on("messageCreate", (message) => { if (!message.author.bot) trackMessage(message.author.id); });


// --- ERROR HANDLING ---
process.on("unhandledRejection", (reason) => logger.error("Unhandled Rejection:", reason));
process.on("uncaughtException", (error) => logger.error("Uncaught Exception:", error));
process.on("uncaughtExceptionMonitor", (error) => logger.warn("Exception Monitor:", error));
process.on("warning", (warning) => logger.warn("Node.js Warning:", warning));
