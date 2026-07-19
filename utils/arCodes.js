function ar(code) {
  return `AR-${code}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

module.exports = { ar };
