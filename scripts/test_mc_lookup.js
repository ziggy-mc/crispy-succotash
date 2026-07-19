require('dotenv/config');
const mongoose = require('mongoose');
const Users = require('../Schemas.js/User');
const McConnect = require('../Schemas.js/McConnect');

function escapeRegExp(str) {
    return String(str).replace(/[.*+?^${}()|[\\]\\]/g, "\\$&");
}

(async () => {
    try {
        if (!process.env.MONGO_URL) {
            console.error('MONGO_URL not set in environment. Aborting.');
            process.exit(1);
        }

        await mongoose.connect(process.env.MONGO_URL, { maxPoolSize: 5 });
        console.log('[test_mc_lookup] Mongo connected');

        const userId = '794228666518339604';
        const userData = await Users.findOne({ discordId: userId }).lean();
        console.log('[test_mc_lookup] userData:', JSON.stringify(userData, null, 2));

        let mcData = null;
        let resolved = { mcUsername: null, uuid: null, source: null, isLinked: false };

        if (userData) {
            const candidates = [
                userData.mcUsername,
                userData.minecraft?.username,
                userData.minecraft?.mcUsername,
                userData.minecraft?.name,
                userData.minecraft?.displayName,
                userData.username,
                userData.displayName
            ];

            for (const c of candidates) {
                if (typeof c === 'string' && c.trim() !== '') { resolved.mcUsername = c.trim(); break; }
            }

            // Treat any username present in Users as linked for testing convenience
            resolved.isLinked = Boolean(resolved.mcUsername) || (
                userData.linked === true ||
                userData.minecraft?.verified === true ||
                userData.minecraft?.verified === 'true' ||
                Boolean(userData.minecraft?.uuid) ||
                Boolean(userData.uuid)
            );

            console.log('[test_mc_lookup] resolved from Users:', resolved);

            if (resolved.mcUsername) {
                const usernameRegex = new RegExp(`^${escapeRegExp(resolved.mcUsername)}$`, 'i');
                mcData = await McConnect.findOne({ mcUsername: usernameRegex }).lean();
                if (mcData) {
                    resolved.source = 'Users -> McConnect by username';
                    console.log('[test_mc_lookup] found mcData by username');
                }
            }
        } else {
            console.log('[test_mc_lookup] No Users record found');
        }

        if (!mcData) {
            const or = [];
            if (resolved.mcUsername) or.push({ mcUsername: new RegExp(`^${escapeRegExp(resolved.mcUsername)}$`, 'i') });
            or.push({ discordId: userId }, { linkedDiscordId: userId }, { 'discord.id': userId });

            mcData = await McConnect.findOne({ $or: or }).lean();
            if (mcData) {
                const usedBy = mcData.mcUsername ? `username:${mcData.mcUsername}` : 'discordId match';
                resolved.source = `McConnect via ${usedBy}`;
                resolved.mcUsername = resolved.mcUsername || mcData.mcUsername || mcData.displayName;
                resolved.uuid = mcData.uuid || mcData.minecraftUUID || mcData.uuid;
                resolved.isLinked = true;
                console.log('[test_mc_lookup] found mcData via fallback:', resolved.source);
            }
        }

        if (!userData || !resolved.mcUsername || !resolved.isLinked) {
            console.log('[test_mc_lookup] RESULT: no linked Minecraft account found');
        } else if (!mcData) {
            console.log(`[test_mc_lookup] RESULT: linked in Users as ${resolved.mcUsername} but no McConnect entry`);
        } else {
            console.log('[test_mc_lookup] RESULT: success —', { mcUsername: resolved.mcUsername, uuid: resolved.uuid, source: resolved.source });
        }

        await mongoose.disconnect();
        process.exit(0);
    } catch (err) {
        console.error('[test_mc_lookup] error', err);
        process.exit(2);
    }
})();
