const PremiumRedeem = require("../Schemas.js/PremiumRedeem");

const TIME_ZONE = "America/New_York";

function getLocalTime() {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });

  const parts = formatter.formatToParts(new Date());

  const values = {};

  for (const part of parts) {
    if (part.type !== "literal") {
      values[part.type] = part.value;
    }
  }

  return values;
}

async function cleanupExpiredPremium(client) {
  try {
    const now = new Date();

    const expired = await PremiumRedeem.find({
      premiumUntil: {
        $lte: now
      }
    });

    for (const redemption of expired) {
      try {
        for (const guild of client.guilds.cache.values()) {
          try {
            const member = await guild.members
              .fetch(redemption.userId)
              .catch(() => null);

            if (!member) continue;

            const premiumRoleId =
              process.env.PREMIUM_ROLE_ID;

            if (
              premiumRoleId &&
              member.roles.cache.has(premiumRoleId)
            ) {
              await member.roles.remove(
                premiumRoleId,
                "Muzi Tracker Premium expired"
              );
            }
          } catch (error) {
            console.error(
              `Failed removing Premium from ${redemption.userId}:`,
              error
            );
          }
        }

  
        const nextPurchase = new Date(
          redemption.lastPurchaseAt.getTime() +
            30 * 24 * 60 * 60 * 1000
        );

        if (nextPurchase <= now) {
          await PremiumRedeem.deleteOne({
            userId: redemption.userId
          });
        } else {
          await PremiumRedeem.updateOne(
            { userId: redemption.userId },
            {
              $set: {
                premiumUntil: new Date(0)
              }
            }
          );
        }
      } catch (error) {
        console.error(
          `Premium cleanup failed for ${redemption.userId}:`,
          error
        );
      }
    }

    console.log(
      `[Premium] Cleanup complete. ${expired.length} expired record(s) checked.`
    );
  } catch (error) {
    console.error(
      "[Premium] Cleanup error:",
      error
    );
  }
}

function startPremiumCleanup(client) {
  let lastCleanupDate = null;

  const check = async () => {
    const local = getLocalTime();

    const date = `${local.year}-${local.month}-${local.day}`;
    const hour = Number(local.hour);
    const minute = Number(local.minute);

    if (
      hour === 0 &&
      minute === 0 &&
      lastCleanupDate !== date
    ) {
      lastCleanupDate = date;

      await cleanupExpiredPremium(client);
    }
  };


  cleanupExpiredPremium(client).catch(console.error);


  setInterval(check, 60 * 1000);

  console.log(
    `[Premium] Midnight cleanup started for ${TIME_ZONE}.`
  );
}

module.exports = {
  cleanupExpiredPremium,
  startPremiumCleanup
};
