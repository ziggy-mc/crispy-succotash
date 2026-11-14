const { ActivityType } = require("discord.js");
const loadCommands = require("../../handlers/commandHandler");
const {
  setClient,
  startHeartbeat,
  seedSystems,
  stopHeartbeat,
} = require("../../utils/systemMonitor");

const DEVLYN_API = "https://devlynlabs.com/api/v1/bot/status";
const DEVLYN_KEY = process.env.DEVLYN_API_KEY;

async function updateDevlynStatus(client) {
  if (!DEVLYN_KEY) return;
  try {
    const res = await fetch(DEVLYN_API, {
      method: "POST",
      signal: AbortSignal.timeout(10000),
      headers: {
        Authorization: `Bearer ${DEVLYN_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        bot_id: client.user.id,
        status: client.user.presence?.status || "online",
        server_count: client.guilds.cache.size,
        member_count: client.guilds.cache.reduce(
          (acc, g) => acc + (g.memberCount || 0),
          0
        ),
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      client.logger?.error?.(
        `[Devlyn API] Failed: ${res.status} ${text}`
      ) || console.error("[Devlyn API] Failed:", res.status, text);
    }
  } catch (err) {
    console.error("[Devlyn API] Error:", err);
  }
}

module.exports = {
  name: "clientReady",
  once: true,

  async execute(client) {
    await Promise.all([loadCommands(client)]);

    client.logger.info(`${client.user.tag} is online!`);

    const updateStatus = () => {
      client.user.setActivity("v2.2.0 | Tracking Reports", {
        type: ActivityType.Custom,
      });
    };

    updateStatus();


    // 🔥 initial push on ready
    await updateDevlynStatus(client);

    // 🔁 heartbeat to Devlyn API every 5 minutes
    client.repeat(() => updateDevlynStatus(client), 5 * 60 * 1000);

    setClient(client);
    startHeartbeat();
    client.addCleanup(stopHeartbeat);

    seedSystems(client).catch((err) =>
      client.logger.error("[SystemMonitor] seedSystems failed:", err)
    );
  },
};
