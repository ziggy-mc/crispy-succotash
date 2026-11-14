const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Supporter = require('../Schemas.js/Supporter');
const Redeem = require('../Schemas.js/PremiumRedeem');
const Settings = require('../Schemas.js/BugUserSettings');
const Cache = require('../Schemas.js/BugUserDashboardCache');
const Bug = require('../Schemas.js/cBug');
const { createApi } = require('../utils/internalApi');
const token = 'local-test-token-with-at-least-32-characters';
const id = '123456789012345678';
const client = { isReady: () => true, logger:{error:()=>{}}, guilds:{cache:new Map()} };
async function setup(t, ready = true) {
    const server = createApi(client, token, { databaseReady: () => ready }).listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
    return (path, options = {}) => fetch(`http://127.0.0.1:${server.address().port}${path}`, { signal: AbortSignal.timeout(3000), ...options });
}
function entitlement(t, premium = false) {
    t.mock.method(Supporter, 'findOne', () => ({ lean:async () => premium ? {userId:id} : null }));
    t.mock.method(Redeem, 'findOne', () => ({ lean:async () => null }));
}
test('every private route rejects missing and invalid service tokens', async t => {
    const request = await setup(t);
    for (const path of ['/api/health',`/api/bugs/dashboard/${id}`,`/api/bugs/settings/${id}`,'/api/bugs/stats/global']) {
        assert.equal((await request(path)).status, 401);
        assert.equal((await request(path,{headers:{authorization:'Bearer wrong'}})).status, 401);
    }
    assert.equal((await request('/ping')).status,200);
});
test('health distinguishes reachable API from disconnected database', async t => {
    const request = await setup(t, false);
    const response = await request('/api/health',{headers:{authorization:`Bearer ${token}`}});
    assert.equal(response.status,200); assert.equal((await response.json()).database,'unavailable');
    assert.equal((await request(`/api/bugs/dashboard/${id}`,{headers:{authorization:`Bearer ${token}`}})).status,503);
});
test('client premium flag cannot grant global account access', async t => {
    entitlement(t);
    const request = await setup(t);
    const response = await request(`/api/bugs/dashboard/${id}?scope=global&premium=true`,{headers:{authorization:`Bearer ${token}`}});
    assert.equal(response.status,403);
});
test('notification endpoint enforces entitlement and validates input', async t => {
    entitlement(t);
    const request = await setup(t);
    for (const [body,status] of [[{dmOnUpdate:true},403],[{dmOnUpdate:'true'},400],[{premium:true},400],[{},400]]) {
        const response = await request(`/api/bugs/settings/${id}`, {method:'POST', headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(body)});
        assert.equal(response.status,status);
    }
});
test('settings upsert has no conflicting Mongo paths and preserves free ping setting', async t => {
    entitlement(t);
    let update;
    t.mock.method(Settings,'findOneAndUpdate', async (query, value) => { update=value; return {userId:id,pingOnUpdate:false,dmOnUpdate:false}; });
    t.mock.method(Cache,'deleteOne',async()=>({deletedCount:1}));
    const request = await setup(t);
    const response = await request(`/api/bugs/settings/${id}`,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({pingOnUpdate:false})});
    assert.equal(response.status,200);
    assert.equal(update.$set.pingOnUpdate,false); assert.equal('pingOnUpdate' in update.$setOnInsert,false);
});
test('premium dashboard owns its query and includes source server, real queued status and counters', async t => {
    entitlement(t,true);
    const records=[{ reporterId:id, guildId:'A',bugId:'same',originalTitle:'Queued bug',status:'Open',isQueued:true,createdAt:new Date(),threadId:'T' }];
    let closed=false;
    t.mock.method(Bug,'find',query=>{
        assert.equal(query.reporterId,id);
        const chain={sort:()=>chain,lean:()=>chain,cursor:()=>({ async *[Symbol.asyncIterator](){yield* records;}, close:async()=>{closed=true;} })}; return chain;
    });
    t.mock.method(Settings,'findOneAndUpdate',async()=>({pingOnUpdate:true,dmOnUpdate:true}));
    const request=await setup(t);
    const response=await request(`/api/bugs/dashboard/${id}?scope=global`,{headers:{authorization:`Bearer ${token}`}});
    const body=await response.json();
    assert.equal(response.status,200);assert.equal(body.data.bugs[0].status,'Queued');assert.match(body.data.bugs[0].guildName,/Unavailable server/);assert.equal(body.data.queuedBugs,1);assert.equal(body.data.openBugs,0);assert.equal(closed,true);
});
