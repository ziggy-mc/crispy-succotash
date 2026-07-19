const PingStats = require("../../Schemas.js/pingStats");
const GuildConfig = require("../../Schemas.js/guildConfig");

function startOfDayUTC(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
function startOfWeekUTC(d) {
  const s = startOfDayUTC(d);
  s.setUTCDate(s.getUTCDate() - s.getUTCDay());
  return s;
}
function startOfMonthUTC(d) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}
function startOfYearUTC(d) {
  return new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
}

module.exports = {
  name: "messageCreate",
  async execute(message) {
    if (!message.guild || message.author.bot) return;

    const cfg = await GuildConfig.findOne({ guildId: message.guild.id });
    if (!cfg?.pingTracking) return;

    const users = message.mentions.users.size;
    const roles = message.mentions.roles.size;
    const everyone = message.mentions.everyone ? 1 : 0;
    if (users + roles + everyone === 0) return;

    const now = new Date();

    let stats = await PingStats.findOne({ guildId: message.guild.id });
    if (!stats) stats = new PingStats({ guildId: message.guild.id });

    // PRE-CALCULATED TIMES
    const todayStart = startOfDayUTC(now);
    const weekStart = startOfWeekUTC(now);
    const monthStart = startOfMonthUTC(now);
    const yearStart = startOfYearUTC(now);

    // RESET LOGIC
    if (!stats.lastDay || stats.lastDay.getTime() !== todayStart.getTime()) {
      stats.today = { user: 0, role: 0, everyone: 0 };
      stats.lastDay = todayStart;
    }
    if (!stats.lastWeek || stats.lastWeek.getTime() !== weekStart.getTime()) {
      stats.week = { user: 0, role: 0, everyone: 0 };
      stats.lastWeek = weekStart;
    }
    if (!stats.lastMonth || stats.lastMonth.getTime() !== monthStart.getTime()) {
      stats.month = { user: 0, role: 0, everyone: 0 };
      stats.lastMonth = monthStart;
    }
    if (!stats.lastYear || stats.lastYear.getTime() !== yearStart.getTime()) {
      stats.year = { user: 0, role: 0, everyone: 0 };
      stats.lastYear = yearStart;
    }

    // INCREMENT (safe)
    for (const key of ["today", "week", "month", "year"]) {
      stats[key].user = (stats[key].user || 0) + users;
      stats[key].role = (stats[key].role || 0) + roles;
      stats[key].everyone = (stats[key].everyone || 0) + everyone;
    }

    // SAFE SAVE (prevents shard overwrite issues)
    await PingStats.findOneAndUpdate(
  { guildId: message.guild.id },
  {
    $set: {
      today: stats.today,
      week: stats.week,
      month: stats.month,
      year: stats.year,
      lastDay: stats.lastDay,
      lastWeek: stats.lastWeek,
      lastMonth: stats.lastMonth,
      lastYear: stats.lastYear
    }
  },
  { upsert: true, new: true }
);
  }
};
