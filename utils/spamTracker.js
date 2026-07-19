// spamTracker.js
const spamData = new Map();

// Settings
const SPAM_INTERVAL = 5000; // 5 seconds
const SPAM_THRESHOLD = 5; // messages per interval before flagging

function trackMessage(userId) {
  const now = Date.now();
  const userData = spamData.get(userId) || { timestamps: [] };

  // Keep only recent timestamps
  userData.timestamps = userData.timestamps.filter((ts) => now - ts < SPAM_INTERVAL);

  // Add new message timestamp
  userData.timestamps.push(now);

  spamData.set(userId, userData);

  // Detect spam
  if (userData.timestamps.length >= SPAM_THRESHOLD) {
    console.log(`⚠️ User ${userId} might be spamming!`);
    // Here you can emit an event, log it, or take action (mute, warn, etc.)
  }
}

module.exports = { trackMessage };
