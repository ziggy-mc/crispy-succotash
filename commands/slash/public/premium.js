const {
  SlashCommandBuilder
} = require("discord.js");

const PremiumRedeem = require("../../../Schemas.js/PremiumRedeem");
const {
  getCredits,
  deductCredits
} = require("../../../utils/devlyn");

const REDEEM_COOLDOWN = 30 * 24 * 60 * 60 * 1000;

const OPTIONS = {
  1: 1,
  7: 7,
  14: 14,
  30: 30
};

function unix(date) {
  return Math.floor(date.getTime() / 1000);
}

function getExpiration(days) {
  const now = new Date();

  const target = new Date(now);
  target.setDate(target.getDate() + days + 1);

  const dateString = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(target);

  // Eastern midnight for the calculated date.
  const easternMidnight = new Date(
    `${dateString}T00:00:00-04:00`
  );

  return easternMidnight;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("premium")
    .setDescription("Purchase Premium using DL credits.")
    .addIntegerOption(option =>
      option
        .setName("duration")
        .setDescription("How many days of Premium you want")
        .setRequired(false)
        .addChoices(
          {
            name: "1 Day - 1 Credit",
            value: 1
          },
          {
            name: "7 Days - 7 Credits",
            value: 7
          },
          {
            name: "14 Days - 14 Credits",
            value: 14
          },
          {
            name: "30 Days - 30 Credits",
            value: 30
          }
        )
    ),

  async execute(interaction) {
    const userId = interaction.user.id;
    const duration = interaction.options.getInteger("duration");

    try {
      let redemption = await PremiumRedeem.findOne({ userId });
      if (!duration) {
        const balance = await getCredits(userId);

        let message =
          `**MUIZI Tracker Premium**\n\n` +
          `DL Credits: **${balance}**\n\n` +
          `**Premium Shop**\n` +
          `1 Day - 1 credit\n` +
          `7 Days - 7 credits\n` +
          `14 Days - 14 credits\n` +
          `30 Days - 30 credits\n\n`;

        const now = new Date();

        if (redemption) {
          if (redemption.premiumUntil > now) {
            message +=
              `Premium expires <t:${unix(
                redemption.premiumUntil
              )}:F>.\n`;
          } else {
            message += "Premium is currently inactive.\n";
          }

          const nextPurchase = new Date(
            redemption.lastPurchaseAt.getTime() +
              REDEEM_COOLDOWN
          );

          if (nextPurchase > now) {
            message +=
              `You can redeem Premium again <t:${unix(
                nextPurchase
              )}:R>.`;
          } else {
            message += "You can redeem Premium again now.";
          }
        } else {
          message += "You can redeem Premium now.";
        }

        return interaction.reply({
          content: message,
          ephemeral: true
        });
      }

      /*
       * Make sure the selected amount is valid.
       */
      if (!OPTIONS[duration]) {
        return interaction.reply({
          content: "That Premium duration is invalid.",
          ephemeral: true
        });
      }

      const now = new Date();
      if (redemption?.lastPurchaseAt) {
        const nextPurchase = new Date(
          redemption.lastPurchaseAt.getTime() +
            REDEEM_COOLDOWN
        );

        if (now < nextPurchase) {
          return interaction.reply({
            content:
              `You have already redeemed Premium recently.\n` +
              `You can redeem Premium again <t:${unix(
                nextPurchase
              )}:R>.`,
            ephemeral: true
          });
        }
      }

      const balance = await getCredits(userId);

      if (balance < duration) {
        return interaction.reply({
          content:
            `You need **${duration} DL credits**, but you only have **${balance}**.`,
          ephemeral: true
        });
      }

      const guild = interaction.guild;

      if (!guild) {
        return interaction.reply({
          content: "This command must be used inside a server.",
          ephemeral: true
        });
      }

      const premiumRoleId = process.env.PREMIUM_ROLE_ID;

      if (!premiumRoleId) {
        throw new Error("PREMIUM_ROLE_ID is not configured.");
      }

      const premiumRole = guild.roles.cache.get(
        premiumRoleId
      );

      if (!premiumRole) {
        throw new Error(
          `Premium role ${premiumRoleId} was not found.`
        );
      }


      const member = await guild.members.fetch(userId);

      if (member.roles.cache.has(premiumRoleId)) {
        return interaction.reply({
          content:
            "You already have the Premium role. You cannot redeem Premium again yet.",
          ephemeral: true
        });
      }


      await deductCredits(
        userId,
        duration,
        `MTR Premium - ${duration} day${
          duration === 1 ? "" : "s"
        }`
      );

      const premiumUntil = getExpiration(duration);

      await PremiumRedeem.findOneAndUpdate(
        { userId },
        {
          userId,
          premiumUntil,
          lastPurchaseAt: now
        },
        {
          upsert: true,
          new: true
        }
      );


      await member.roles.add(
        premiumRole,
        `Muzi Tracker Premium purchased with ${duration} DL credits`
      );

      return interaction.reply({
        content:
          `✅ Premium activated for **${duration} day${
            duration === 1 ? "" : "s"
          }**!\n\n` +
          `Your Premium expires <t:${unix(
            premiumUntil
          )}:F>.\n\n` +
          `You can redeem Premium again <t:${unix(
            new Date(now.getTime() + REDEEM_COOLDOWN)
          )}:F>.`,
        ephemeral: true
      });
    } catch (error) {
      console.error("Premium purchase error:", error);


      if (error.status === 402) {
        return interaction.reply({
          content:
            error?.data?.error ||
            "You do not have enough DL credits.",
          ephemeral: true
        });
      }

      return interaction.reply({
        content:
          "Something went wrong while purchasing Premium.",
        ephemeral: true
      });
    }
  }
};
