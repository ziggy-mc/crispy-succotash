const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { PermissionFlagsBits } = require('discord.js');
const Bug = require('../Schemas.js/cBug');
const Supporter = require('../Schemas.js/Supporter');
const Redeem = require('../Schemas.js/PremiumRedeem');
const threadCommand = require('../commands/slash/public/bug-status');
const manage = require('../commands/slash/public/manage');
const owner='123456789012345678', guildA='223456789012345678', guildB='323456789012345678';
function mockEntitlement(t,premium=false) {
    t.mock.method(Supporter,'findOne',()=>({lean:async()=>premium?{userId:owner}:null}));
    t.mock.method(Redeem,'findOne',()=>({lean:async()=>null}));
}
function fakeInteraction(guildId = guildB) {
    const replies=[];
    const i={ guildId, user:{id:owner}, authorizingIntegrationOwners:{0:guildId}, options:{getString:name=>name==='bug-id'?'thread-abc#123':null}, inCachedGuild:()=>false,
        deferReply:async()=>{},editReply:async response=>{replies.push(response);},replies };
    return i;
}
test('command definitions and component modules load and serialize without starting services', () => {
    function walk(dir) { for(const item of fs.readdirSync(dir,{withFileTypes:true})) { const file=path.join(dir,item.name); if(item.isDirectory())walk(file);else if(item.name.endsWith('.js')) { const module=require(file); if(module.data)assert.doesNotThrow(()=>module.data.toJSON(),file); } } }
    walk(path.join(__dirname,'../commands'));walk(path.join(__dirname,'../components'));
    assert.deepEqual(threadCommand.data.toJSON().integration_types,[0,1]);
});
test('free owner retrieves a readable report from another installed server with a source name', async t => {
    mockEntitlement(t);
    const report={reporterId:owner,guildId:guildA,bugId:'thread-abc#123',originalTitle:'Example',status:'Open',threadId:'423456789012345678',createdAt:new Date()};
    t.mock.method(Bug,'find',query=>{assert.equal(query.reporterId,owner);return {limit:()=>({lean:async()=>[report]})};});
    const source={id:guildA,name:'Source A',available:true,members:{fetch:async()=>({id:owner})},channels:{fetch:async()=>({permissionsFor:()=>({has:()=>true})})}};
    const client={guilds:{cache:new Map([[guildA,source],[guildB,{name:'Destination B',available:true}]])}};
    const i=fakeInteraction();await threadCommand.execute(i,client);
    const result=i.replies[0].embeds[0].toJSON();assert.ok(result.fields.some(field=>field.name==='Source server'&&field.value.includes('Source A')));
});
test('free DM and user-installed context deny before looking up any report', async t => {
    mockEntitlement(t);
    t.mock.method(Bug,'find',()=>{throw Error('report query must not run');});
    const client={guilds:{cache:new Map()}};
    for(const guildId of [null,guildA]) { const i=fakeInteraction(guildId);i.authorizingIntegrationOwners={1:owner};await threadCommand.execute(i,client);assert.match(i.replies[0],/requires Premium/); }
});
test('staff list pagination remains functional and revalidates staff access', async t => {
    let staff=true;
    const collector=new EventEmitter();collector.stop=()=>collector.emit('end');
    const i=fakeInteraction();i.inCachedGuild=()=>true;i.member={permissions:{has:()=>staff},roles:{cache:new Map()}};
    i.options={getSubcommand:()=> 'list',getString:()=> 'all'};i.deferReply=async()=>{};i.fetchReply=async()=>({createMessageComponentCollector:()=>collector});
    t.mock.method(Bug,'countDocuments',async()=>11);
    const chain={sort:()=>chain,skip:()=>chain,limit:async()=>[]};t.mock.method(Bug,'find',()=>chain);
    const client={logger:{error:()=>{}},guilds:{cache:new Map()}};
    await manage.execute(i,client);
    const before=i.replies.length;
    collector.emit('collect',{user:i.user,customId:'buglist_next',deferUpdate:async()=>{},inCachedGuild:()=>true,member:i.member,guildId:guildB});
    await new Promise(resolve=>setTimeout(resolve,20));
    assert.equal(i.replies.length,before+1);assert.equal(i.replies.at(-1).embeds[0].toJSON().footer.text.includes('2/2'),true);
    // A revoked source staff role must not retain the ephemeral list's authority.
    staff=false;
    const cfg=require('../Schemas.js/guildConfig');t.mock.method(cfg,'findOne',()=>({lean:async()=>null}));
    collector.emit('collect',{user:i.user,customId:'buglist_prev',deferUpdate:async()=>{},inCachedGuild:()=>true,member:i.member,guildId:guildB});
    await new Promise(resolve=>setTimeout(resolve,20));
    assert.match(i.replies.at(-1).content,/Staff access has changed/);
});
