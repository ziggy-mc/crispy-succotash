module.exports = async (ctx) => {
  // Register all event handlers here.
  // Each handler should be a function that takes `ctx`. (for messages: message, client)
  // Example: require("./handleXp")(ctx)
  // Add additional handlers to the array below (e.g., handleAfk, handleLevels, etc.)
  // === 3) LEVEL SYSTEM ===
    

    await userData.save();
  await Promise.all([
   require("./handleXp")(ctx),
    require("./handleAFK")(ctx),
  ]);
};