const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PermissionFlagsBits, ChannelType } = require('discord.js');
const { mayViewReport, installedGuildContext, createSourceReader, visibleReports, escapeRegex } = require('../utils/reportAccess');
const report = { reporterId: 'owner', guildId: 'A', threadId: 'thread' };
const free = { report, userId: 'owner', premium: false, installedContext: true, sourceReadable: true };
for (const [name, input, expected] of [
    ['free owner across installed readable servers', free, true],
    ['free DM denied', { ...free, installedContext: false }, false],
    ['free user install without bot denied', { ...free, installedContext: false }, false],
    ['removed source denied', { ...free, sourceReadable: false }, false],
    ['restricted source denied', { ...free, sourceReadable: false }, false],
    ['premium owner DM allowed', { ...free, premium: true, installedContext: false, sourceReadable: false }, true],
    ['premium cannot read another owner', { ...free, premium: true, userId: 'other' }, false],
    ['destination staff cannot read source private report', { ...free, userId: 'staff', staffGuildId: 'B' }, false],
    ['source staff may read source report', { ...free, userId: 'staff', staffGuildId: 'A' }, true],
]) test(name, () => assert.equal(mayViewReport(input), expected));

test('actual Discord integration owners object must authorize this guild', () => {
    const client = { guilds: { cache: new Map([['A', { available: true }]]) } };
    assert.equal(installedGuildContext({ guildId: 'A', authorizingIntegrationOwners: { 0: 'A' } }, client), true);
    assert.equal(installedGuildContext({ guildId: 'A', authorizingIntegrationOwners: { 1: 'owner' } }, client), false);
    assert.equal(installedGuildContext({ guildId: 'B', authorizingIntegrationOwners: { 0: 'B' } }, client), false);
    assert.equal(installedGuildContext({ guildId: null, authorizingIntegrationOwners: { 0: '0' } }, client), false);
});
function source({ view = true, privateThread = false, threadMember = false, member = true, available = true } = {}) {
    let fetches = 0;
    const guild = { id: 'A', available, members: { fetch: async () => { fetches++; return member ? { id: 'owner' } : null; } }, channels: { fetch: async () => ({ type: privateThread ? ChannelType.PrivateThread : ChannelType.PublicThread, permissionsFor: () => ({ has: permission => permission === PermissionFlagsBits.ViewChannel && view }), members: { fetch: async () => { if (!threadMember) throw Error(); return {}; } } }) } };
    const client = { guilds: { cache: new Map([['A', guild]]) } };
    return { client, fetches: () => fetches };
}
test('source reader checks membership, ViewChannel, private thread membership and availability', async () => {
    for (const [options, expected] of [[{},true], [{view:false},false], [{member:false},false], [{available:false},false], [{privateThread:true},false], [{privateThread:true,threadMember:true},true]]) {
        const { client } = source(options);
        assert.equal(await createSourceReader(client, 'owner')(report), expected);
    }
});
test('members cached for one request only; permission revocation affects next request', async () => {
    const state = source();
    const reader = createSourceReader(state.client, 'owner');
    assert.equal(await reader(report), true); assert.equal(await reader(report), true); assert.equal(state.fetches(), 1);
    state.client.guilds.cache.get('A').members.fetch = async () => null;
    assert.equal(await createSourceReader(state.client, 'owner')(report), false);
});
test('visible reports never inherit staff authority from another guild', async () => {
    const state = source();
    const reports = [report, { ...report, reporterId: 'other' }, { ...report, guildId: 'removed' }];
    const visible = await visibleReports(reports, { userId:'owner', premium:false, installedContext:true, staffGuildId:'B' }, state.client);
    assert.deepEqual(visible, [report]);
});
test('autocomplete input is a literal bounded regular expression', () => {
    const text = '.*[a](a+)+$';
    assert.equal(new RegExp(escapeRegex(text)).test(text), true);
    assert.equal(new RegExp(escapeRegex(text)).test('anything'), false);
});
