const express = require('express');
const { timingSafeEqual } = require('node:crypto');
const mongoose = require('mongoose');
const { personalReports } = require('./personalReports');
const { getPremiumEntitlement } = require('./premiumEntitlement');
const { getGlobalStats, getGuildStats, getUserSettings, updateUserSettings } = require('./bugStatsService');
const { isSnowflake } = require('./reportAccess');

function apiAuthentication(expected) {
    return (req, res, next) => {
        const provided = Buffer.from(req.get('authorization') || '');
        const wanted = Buffer.from(`Bearer ${expected}`);
        if (!expected || provided.length !== wanted.length || !timingSafeEqual(provided, wanted)) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        next();
    };
}
function createApi(client, token, { databaseReady = () => mongoose.connection.readyState === 1 } = {}) {
    const app = express();
    app.disable('x-powered-by');
    app.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
    // No identity or infrastructure is exposed by public liveness checks.
    app.get(['/', '/ping'], (req, res) => res.json({ alive: true }));
    app.use('/api', apiAuthentication(token));
    const limits = new Map();
    app.use('/api', (req, res, next) => {
        const key = req.ip;
        const now = Date.now();
        for (const [id, entry] of limits) if (entry.until <= now) limits.delete(id);
        const entry = limits.get(key) || { until: now + 60000, count: 0 };
        entry.count++;
        limits.set(key, entry);
        if (entry.count > 120) return res.status(429).json({ error: 'Please retry shortly' });
        next();
    });
    app.use(express.json({ limit: '8kb', strict: true }));
    app.get('/api/health', (req, res) => res.json({
        gateway: client.isReady() ? 'operational' : 'unavailable',
        database: databaseReady() ? 'operational' : 'unavailable',
        checkedAt: new Date().toISOString(),
    }));
    app.use('/api', (req, res, next) => {
        if (!databaseReady() || !client.isReady()) return res.status(503).json({ error: 'Tracking temporarily unavailable' });
        next();
    });
    app.param('userId', (req, res, next, id) => isSnowflake(id) ? next() : res.status(400).json({ error: 'Invalid user ID' }));
    app.param('guildId', (req, res, next, id) => isSnowflake(id) ? next() : res.status(400).json({ error: 'Invalid server ID' }));
    app.get('/api/bugs/entitlement/:userId', async (req, res) => res.json({ premium: !!await getPremiumEntitlement(req.params.userId) }));
    app.get('/api/bugs/stats/global', async (req, res) => res.json({ ok: true, data: await getGlobalStats() }));
    app.get('/api/bugs/stats/guild/:guildId', async (req, res) => {
        if (!client.guilds.cache.has(req.params.guildId)) return res.status(404).json({ error: 'Server unavailable' });
        res.json({ ok: true, data: await getGuildStats(req.params.guildId) });
    });
    app.get('/api/bugs/dashboard/:userId', async (req, res) => {
        // Only the trusted website may assert a session identity. A browser must never receive this token.
        const global = req.query.scope === 'global';
        const data = await personalReports(client, req.params.userId, { installedContext: !global, global });
        res.json({ ok: true, data });
    });
    app.get('/api/bugs/settings/:userId', async (req, res) => {
        const settings = await getUserSettings(req.params.userId);
        const premium = !!await getPremiumEntitlement(req.params.userId);
        res.json({ ok: true, data: { userId: settings.userId, pingOnUpdate: settings.pingOnUpdate, dmOnUpdate: premium && settings.dmOnUpdate } });
    });
    app.post('/api/bugs/settings/:userId', async (req, res) => {
        const body = req.body || {};
        const keys = Object.keys(body);
        if (!keys.length || keys.some(key => !['pingOnUpdate', 'dmOnUpdate'].includes(key) || typeof body[key] !== 'boolean')) return res.status(400).json({ error: 'Expected notification booleans' });
        if (body.dmOnUpdate && !await getPremiumEntitlement(req.params.userId)) return res.status(403).json({ error: 'DM notifications require Premium' });
        const settings = await updateUserSettings(req.params.userId, body);
        res.json({ ok: true, data: { pingOnUpdate: settings.pingOnUpdate, dmOnUpdate: settings.dmOnUpdate } });
    });
    app.use((error, req, res, next) => {
        const status = [400, 403, 413, 429].includes(error.status) ? error.status : 503;
        if (status === 503) client.logger.error('[API] Request failed');
        res.status(status).json({ error: status === 403 ? 'Premium required for global access' : 'Request could not be completed' });
    });
    return app;
}
module.exports = { createApi, apiAuthentication };
