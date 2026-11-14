const { test } = require('node:test');
const assert = require('node:assert/strict');
const Supporter = require('../Schemas.js/Supporter');
const PremiumRedeem = require('../Schemas.js/PremiumRedeem');
const { getPremiumEntitlement } = require('../utils/premiumEntitlement');
const { cleanupExpiredPremium } = require('../utils/premiumCleanup');
for (const [name, manual, expires, expected] of [
    ['free account', false, null, false],
    ['manual supporter', true, null, true],
    ['active redemption without supporter row', false, Date.now()+3600000, true],
    ['expired redemption', false, Date.now()-1, false],
    ['manual supporter survives expired redemption', true, Date.now()-1, true],
]) test(name, async t => {
    t.mock.method(Supporter, 'findOne', () => ({ lean:async () => manual ? { userId:'owner' } : null }));
    t.mock.method(PremiumRedeem, 'findOne', query => ({ lean:async () => expires && expires > query.premiumUntil.$gt.getTime() ? { premiumUntil: new Date(expires), lastPurchaseAt:new Date() } : null }));
    assert.equal(!!await getPremiumEntitlement('owner'), expected);
});
test('expiry maintenance never deletes an independent manual grant or cooldown history', async t => {
    t.mock.method(Supporter, 'deleteOne', () => { throw Error('must not delete grant'); });
    t.mock.method(PremiumRedeem, 'deleteOne', () => { throw Error('must not delete history'); });
    assert.equal((await cleanupExpiredPremium()).removed, 0);
});
