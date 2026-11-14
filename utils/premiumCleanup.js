// Kept as a compatibility module. Expiration is enforced on every entitlement read.
// Redemption history tracks cooldowns; manual supporter grants are independent and retained.
async function cleanupExpiredPremium() { return { mode: 'read-time-expiry', removed: 0 }; }
function startPremiumCleanup() { return () => {}; }
module.exports = { cleanupExpiredPremium, startPremiumCleanup };
