const { ActivityType } = require("discord.js");
const loadCommands = require("../../handlers/commandHandler");
const {
  setClient,
  startHeartbeat,
  seedSystems,
} = require("../../utils/systemMonitor");

const DEVLYN_API = "https://devlynlabs.com/api/v1/bot/status";
const DEVLYN_KEY = process.env.DEVLYN_API_KEY;

async function updateDevlynStatus(client) {
  try {
    const res = await fetch(DEVLYN_API, {
      method: "POST",
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
      client.user.setActivity("v1.3.1 | Tracking Bugs", {
        type: ActivityType.Custom,
      });
    };

    updateStatus();
    setInterval(updateStatus, 60 * 1000);

    // 🔥 initial push on ready
    await updateDevlynStatus(client);

    // 🔁 heartbeat to Devlyn API every 5 minutes
    setInterval(() => updateDevlynStatus(client), 60 * 1000);

    setClient(client);
    startHeartbeat();

    seedSystems(client).catch((err) =>
      client.logger.error("[SystemMonitor] seedSystems failed:", err)
    );
  },
};