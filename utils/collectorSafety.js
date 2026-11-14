// Catch asynchronous collector failures; EventEmitter does not await listeners.
function onCollect(collector, interaction, client, handler) {
    const cleanup = () => collector.stop('shutdown');
    client.addCleanup?.(cleanup);
    collector.once('end', () => client.removeCleanup?.(cleanup));
    let busy = false;
    collector.on('collect', event => {
        if (busy) { event.reply({ content: 'An action is already in progress. Please wait a moment.', flags: 64 }).catch(() => {}); return; }
        busy = true;
        Promise.resolve().then(() => handler(event)).catch(async () => {
            client.logger.error('[Components] Report action failed');
            try {
                if (event.deferred || event.replied) await event.editReply({ content: 'This action could not be completed. Reopen the command to refresh the report.', embeds: [], components: [] });
                else await event.reply({ content: 'This action could not be completed. Please try again.', flags: 64 });
            } catch { /* expired interaction */ }
            collector.stop('error');
        }).finally(() => { busy = false; });
    });
}
module.exports = { onCollect };
