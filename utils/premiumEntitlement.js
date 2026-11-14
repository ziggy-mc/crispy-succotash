const Supporter = require('../Schemas.js/Supporter');
const PremiumRedeem = require('../Schemas.js/PremiumRedeem');

// Manual/role supporters and credit redemptions are independent entitlements.
// Expiry is checked at read time, so access never depends on a cleanup timer.
async function getPremiumEntitlement(userId) {
    const [supporter, redemption] = await Promise.all([
        Supporter.findOne({ userId }).lean(),
        PremiumRedeem.findOne({ userId, premiumUntil: { $gt: new Date() } }).lean(),
    ]);
    return supporter || (redemption && { ...redemption, addedAt: redemption.lastPurchaseAt });
}
async function premiumUserIds(userIds) {
    const filter = userIds ? { userId: { $in: userIds } } : {};
    const [supporters, redemptions] = await Promise.all([
        Supporter.find(filter, 'userId').lean(),
        PremiumRedeem.find({ ...filter, premiumUntil: { $gt: new Date() } }, 'userId').lean(),
    ]);
    return new Set([...supporters, ...redemptions].map(s => s.userId));
}
module.exports = { getPremiumEntitlement, premiumUserIds };
