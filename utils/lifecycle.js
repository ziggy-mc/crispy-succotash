function initializeLifecycle(client) {
    const cleanups = new Set();
    client.addCleanup = cleanup => { cleanups.add(cleanup); return cleanup; };
    client.removeCleanup = cleanup => cleanups.delete(cleanup);
    client.repeat = (task, ms) => {
        let running = false;
        const invoke = async () => {
            if (running) return;
            running = true;
            try { await task(); } catch (error) { client.logger.error(`[Maintenance] ${error.message}`); }
            finally { running = false; }
        };
        const timer = setInterval(invoke, ms); timer.unref();
        client.addCleanup(() => clearInterval(timer));
        return invoke;
    };
    client.cleanup = async () => {
        await Promise.allSettled([...cleanups].map(fn => fn()));
        cleanups.clear();
    };
}
module.exports = { initializeLifecycle };
