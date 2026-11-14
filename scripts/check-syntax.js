const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
let files = 0;
function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (['node_modules', '.git', 'logs'].includes(entry.name)) continue;
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(file);
        else if (entry.name.endsWith('.js')) {
            const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
            if (result.status !== 0) { process.stderr.write(result.stderr); process.exitCode = 1; }
            files++;
        }
    }
}
walk(path.join(__dirname, '..'));
console.log(`Syntax checked ${files} JavaScript files.`);
