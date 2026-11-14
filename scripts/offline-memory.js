// Offline footprint only: no dotenv, login, database, or API startup.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const discord = require('discord.js');
require('mongoose'); require('express'); require('winston');
const source = fs.readFileSync(path.join(root, 'index.js'), 'utf8');
const match = source.match(/const client = new Client\(([\s\S]*?)\n\s*\}\);/);
if (!match) throw new Error('Client options not found');
const client = vm.runInNewContext(`new Client(${match[1]}\n})`, { ...discord });
function load(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) load(file);
        else if (entry.name.endsWith('.js')) require(file);
    }
}
for (const folder of ['commands', 'events', 'components']) load(path.join(root, folder));
function sample() {
    const memory = process.memoryUsage();
    console.log(JSON.stringify({ atSeconds: Math.round(process.uptime()), ...Object.fromEntries(Object.entries(memory).map(([k, v]) => [k + 'MB', +(v / 1048576).toFixed(2)])), node: process.version, mode: 'offline-no-connections' }));
}
sample(); setTimeout(sample, 5000); setTimeout(() => { sample(); client.destroy(); }, 10000);
