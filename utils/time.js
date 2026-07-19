function getEDTDate() {
  const d = new Date().toLocaleDateString("en-US", { timeZone: "America/New_York" });
  const [m, day, y] = d.split("/");
  return `${y}-${m.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function getEDTMonth() {
  const d = new Date().toLocaleDateString("en-US", { timeZone: "America/New_York" });
  const [m, , y] = d.split("/");
  return `${y}-${m.padStart(2, "0")}`;
}

module.exports = { getEDTDate, getEDTMonth };
