const mongoose = require("mongoose");

module.exports = {
  name: "guildDelete",
  async execute(guild) {
    try {
      console.log(`[GuildCleanup] Left guild ${guild.id}, cleaning database...`);

      const models = mongoose.models;

      for (const modelName in models) {
        const model = models[modelName];

        // ✅ Only touch schemas that actually use guildId
        if (model.schema.paths.guildId) {
          const res = await model.deleteMany({ guildId: guild.id });

          if (res.deletedCount) {
            console.log(`[GuildCleanup] ${modelName}: deleted ${res.deletedCount}`);
          }
        }
      }

    } catch (err) {
      console.error("[GuildCleanup] guildDelete error:", err);
    }
  }
};