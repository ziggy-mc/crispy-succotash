const {test}=require('node:test');
const assert=require('node:assert/strict');
const {withReportLock}=require('../utils/reportLock');
const {initializeLifecycle}=require('../utils/lifecycle');
const checkPermissions=require('../utils/checkPermissions');
test('same reporter slot decisions serialize and a failed decision releases the lock',async()=>{
    const events=[];
    await Promise.allSettled([
        withReportLock('A:user',async()=>{events.push('first');await new Promise(resolve=>setTimeout(resolve,5));events.push('end');throw Error();}),
        withReportLock('A:user',async()=>{events.push('second');}),
    ]);
    assert.deepEqual(events,['first','end','second']);
    await withReportLock('A:user',async()=>events.push('third'));
    assert.equal(events.at(-1),'third');
});
test('maintenance does not overlap and shutdown clears repeaters',async()=>{
    const client={logger:{error:()=>{}}};initializeLifecycle(client);
    let active=0,maximum=0,calls=0;
    const invoke=client.repeat(async()=>{calls++;active++;maximum=Math.max(maximum,active);await new Promise(resolve=>setTimeout(resolve,5));active--;},10000);
    await Promise.all([invoke(),invoke(),invoke()]);assert.equal(maximum,1);assert.equal(calls,1);await client.cleanup();
});
test('commands without cooldowns retain no user keys; blocked commands return a boolean',async()=>{
    const client={cooldowns:new Map(),config:{developers:[]}};
    const target={user:{id:'user'},guild:{id:'A'},reply:async()=>({id:'reply'})};
    assert.equal(await checkPermissions('interaction',target,{},client),false);assert.equal(client.cooldowns.size,0);
    assert.equal(await checkPermissions('interaction',target,{settings:{isDeveloperOnly:true}},client),true);
});
