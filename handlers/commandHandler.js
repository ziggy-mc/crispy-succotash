const { REST, Routes } = require("discord.js");
const loadFiles = require("../utils/fileLoader");
const path = require("node:path");

module.exports = async function loadCommands(client) {
  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

  // Clear command collections
  ["prefix", "slash", "context"].forEach((type) => client.commands[type]?.clear());

  const localGlobal = [];
  const localDev = [];
  const syncedPrefix = [];

  const sources = [
    { type: "slash", folder: "slash", useData: true },
    { type: "context", folder: "context", useData: true },
    { type: "prefix", folder: "prefix", useData: false },
  ];

  // ================= LOAD COMMAND FILES =================
  await Promise.all(
    sources.map(async ({ type, folder, useData }) => {
      try {
        const files = await loadFiles(path.join(__dirname, "..", "commands", folder));

        if (!files.length) {
          return client.logger.warn(`[CommandLoader] No ${type} command files found.`);
        }

        await Promise.all(
          files.map(async (file) => {
            try {
              delete require.cache[require.resolve(file)];
              const cmd = require(file);

              if (!cmd || cmd.isDisabled) return;

              const name = useData ? cmd.data.name : cmd.name;
              client.commands[type]?.set(name, cmd);

              if (useData) {
                // Developer-only commands → dev guild only
                if (cmd.settings?.isDeveloperOnly) {
                  localDev.push(cmd.data.toJSON());
                } else {
                  // EVERYTHING ELSE → GLOBAL (user install + all guilds)
                  localGlobal.push(cmd.data.toJSON());
                }
              } else {
                syncedPrefix.push(name);
              }
            } catch (error) {
              client.logger.error(
                `[CommandLoader] Failed to load ${file}: ${error.message}`,
                error
              );
            }
          })
        );
      } catch (error) {
        client.logger.error(
          `[CommandLoader] Failed to load ${folder} commands: ${error.message}`,
          error
        );
      }
    })
  );

  // ================= GLOBAL COMMAND SYNC =================
  try {
    await rest.put(Routes.applicationCommands(process.env.APP_ID), {
      body: localGlobal,
    });

    client.logger.info(
      `[CommandLoader] Synced ${localGlobal.length} global command${
        localGlobal.length === 1 ? "" : "s"
      }.`
    );
  } catch (error) {
    client.logger.error(
      `[CommandLoader] Failed to sync global commands: ${error.message}`,
      error
    );
  }

  // ================= DEV GUILD SYNC =================
  if (
    client.config.developerGuildId &&
    /^(\d{17,19})$/.test(client.config.developerGuildId)
  ) {
    try {
      await rest.put(
        Routes.applicationGuildCommands(
          process.env.APP_ID,
          client.config.developerGuildId
        ),
        { body: localDev }
      );

      client.logger.info(
        `[CommandLoader] Synced ${localDev.length} developer guild command${
          localDev.length === 1 ? "" : "s"
        }.`
      );
    } catch (error) {
      client.logger.error(
        `[CommandLoader] Failed to sync developer guild commands: ${error.message}`,
        error
      );
    }
  }

  // ================= PREFIX LOG =================
  if (syncedPrefix.length) {
    client.logger.info(
      `[CommandLoader] Loaded prefix command${
        syncedPrefix.length === 1 ? "" : "s"
      }: ${syncedPrefix.join(", ")}`
    );
  }
};
