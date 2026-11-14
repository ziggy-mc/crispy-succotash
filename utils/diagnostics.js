const { monitorEventLoopDelay } = require('node:perf_hooks');
function startDiagnostics(client) {
    if (process.env.BOT_DIAGNOSTICS !== '1') return () => {};
    const loop = monitorEventLoopDelay({ resolution: 20 });
    loop.enable();
    const report = () => {
        const memory = process.memoryUsage();
        const mb = value => +(value / 1024 / 1024).toFixed(2);
        client.logger.info(JSON.stringify({
            diagnostic: 'resources', uptimeSeconds: Math.round(process.uptime()),
            rssMB: mb(memory.rss), heapUsedMB: mb(memory.heapUsed), heapTotalMB: mb(memory.heapTotal),
            externalMB: mb(memory.external), arrayBuffersMB: mb(memory.arrayBuffers),
            eventLoopP99Ms: +(loop.percentile(99) / 1e6).toFixed(2),
            guilds: client.guilds.cache.size, users: client.users.cache.size,
            channels: client.channels.cache.size, cooldowns: client.cooldowns.size,
            dbPoolReady: require('mongoose').connection.readyState === 1,
        }));
        loop.reset();
    };
    report();
    const timer = setInterval(report, 60000); timer.unref();
    return () => { clearInterval(timer); loop.disable(); };
}
module.exports = { startDiagnostics };
