const { EmbedBuilder } = require('discord.js');
const Bug = require('../Schemas.js/cBug');
const GuildConfig = require('../Schemas.js/guildConfig');
const Supporter = require('../Schemas.js/Supporter');
const UserSettings = require('../Schemas.js/bugUserSettings'); // <-- ADDED
const { premiumFooter } = require('../utils/bugQueue');
const { onBugCreated } = require('../utils/bugStatsService');

const STATUS_EMOJI = { 'Open': '🔴', 'In Progress': '🟡', 'Resolved': '🟢' };

function randomLetters(n) {
    const chars = 'abcdefghijklmnopqrstuvwxyz';
    return Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function randomNumbers(n) {
    return Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');
}

async function generateUniqueBugId(guildId) {
    let id, exists;
    do {
        id = `bug-${randomLetters(5)}#${randomNumbers(6)}`;
        exists = await Bug.findOne({ guildId, bugId: id });
    } while (exists);
    return id;
}

module.exports = {
    name: 'threadCreate',
    once: false,
    async execute(thread, newlyCreated) {
        console.log(`[DEBUG threadCreate] fired | id=${thread.id} | newlyCreated=${newlyCreated} | parentId=${thread.parentId}`);

        const ageMs = Date.now() - thread.createdTimestamp;
        if (!newlyCreated && ageMs > 30_000) return;

        const client = thread.client;

        try {
            const guildConfig = await GuildConfig.findOne({ guildId: thread.guild.id });
            if (!guildConfig?.bugForumChannelId) return;

            console.log(`[DEBUG threadCreate] parentId=${thread.parentId} | expected=${guildConfig.bugForumChannelId} | match=${thread.parentId === guildConfig.bugForumChannelId}`);
            if (thread.parentId !== guildConfig.bugForumChannelId) return;

            const fullThread = await thread.fetch().catch((err) => {
                console.warn(`[DEBUG threadCreate] thread.fetch() failed: ${err.message}`);
                return thread;
            });

            const ownerId = fullThread.ownerId ?? fullThread.owner?.id ?? thread.ownerId;
            console.log(`[DEBUG threadCreate] ownerId=${ownerId}`);

            if (!ownerId) {
                client.logger.warn(`[BugTracker] Could not resolve ownerId for thread ${thread.id}`);
                return;
            }

            // ============================
            // LOAD USER NOTIFICATION SETTINGS
            // ============================
            const userSettings =
                (await UserSettings.findOne({ userId: ownerId })) ||
                { pingOnUpdate: true, dmOnUpdate: false };

            // ============================
            // SUPPORTER CHECK
            // ============================
            const isSupporter = await Supporter.findOne({ userId: ownerId });
            const maxActive = isSupporter ? 5 : 2;

            const activeCount = await Bug.countDocuments({
                guildId: thread.guild.id,
                reporterId: ownerId,
                isQueued: false,
                status: { $ne: 'Resolved' },
            });

            const originalTitle = fullThread.name;
            const bugId = await generateUniqueBugId(thread.guild.id);
            const isQueued = activeCount >= maxActive;

           

            const createdBug = await Bug.create({
                guildId: thread.guild.id,
                bugId,
                threadId: fullThread.id,
                originalTitle,
                reporterId: ownerId,
                status: 'Open',
                isQueued,
            });

            await onBugCreated(createdBug);

            client.logger.info(
                `[BugTracker] Registered ${bugId} → Thread ${fullThread.id} (Guild ${thread.guild.id})${isQueued ? ' [QUEUED]' : ''}`
            );

            // ============================
            // QUEUED BUG LOGIC
            // ============================
            if (isQueued) {
                const queuePos = await Bug.countDocuments({
                    guildId: thread.guild.id,
                    reporterId: ownerId,
                    isQueued: true,
                });

                const queueEmbed = new EmbedBuilder()
                    .setTitle('⏳ Bug Report Queued')
                    .setColor(0xf39c12)
                    .setDescription(
                        `You already have **${activeCount}** active bug report${activeCount !== 1 ? 's' : ''}. ` +
                        `This report has been placed in the queue and will become active once one of your current reports is resolved or removed.\n\n` +
                        (isSupporter
                            ? `As a supporter you can have up to **3** active reports.`
                            : `Regular users can have **1** active report at a time.`)
                    )
                    .addFields(
                        { name: '📋 Bug ID', value: `\`${bugId}\``, inline: true },
                        { name: '📋 Queue Position', value: `${queuePos}`, inline: true },
                    )
                    .setTimestamp();

                const queueFooter = premiumFooter(isSupporter);
                if (queueFooter) queueEmbed.setFooter(queueFooter);

                await fullThread.send({ embeds: [queueEmbed] }).catch(() => {});
                await fullThread.setArchived(true, 'Bug report queued').catch(() => {});

                // ============================
                // DM ONLY IF USER ENABLED IT
                // ============================
                if (userSettings.dmOnUpdate) {
                    try {
                        const reporter = await client.users.fetch(ownerId);
                        await reporter.send({ embeds: [queueEmbed] });
                    } catch { /* ignore */ }
                }

                return;
            }

            // ============================
            // ACTIVE BUG EMBED
            // ============================
            const threadEmbed = new EmbedBuilder()
                .setTitle('🐛 Bug Report Received')
                .setColor(0x3498db)
                .setDescription(
                    `Thank you for reporting a bug! We appreciate your help in making things better.\n\n` +
                    `You can check the status of your report at any time using \`/bug\` and entering your bug ID.`
                )
                .addFields(
                    { name: '📋 Bug ID', value: `\`${bugId}\``, inline: true },
                    { name: '📋 Title', value: originalTitle, inline: true },
                    { name: '👤 Reporter', value: `<@${ownerId}>`, inline: true },
                    { name: '🔗 Thread', value: `<#${fullThread.id}>`, inline: false },
                    { name: '📊 Status', value: `${STATUS_EMOJI['Open']} Open`, inline: true },
                )
                .setTimestamp();

            const activeFooter = premiumFooter(isSupporter);
            if (activeFooter) threadEmbed.setFooter(activeFooter);

            // ============================
// PING LOGIC (EXACT BEHAVIOR REQUESTED)
// ============================
// 1. If user enabled pings → ping user
// 2. If staff role exists → ping staff
// 3. If both apply → ping both
// 4. If neither → ping nobody

let pingParts = [];

// User wants pings
if (userSettings.pingOnUpdate) {
    pingParts.push(`<@${ownerId}>`);
}

// Staff role configured
if (guildConfig.bugPingRoleId) {
    pingParts.push(`<@&${guildConfig.bugPingRoleId}>`);
}

// If nothing was added → no ping
const pingContent = pingParts.length > 0 ? pingParts.join(' ') : null;

await fullThread.send({
    content: pingContent ?? undefined,
    embeds: [threadEmbed]
}).catch(() => {});

            // ============================
            // DM CONFIRMATION (RESPECT SETTINGS)
            // ============================
            const reporter = await client.users.fetch(ownerId).catch(() => null);
            if (!reporter) return;

            const dmEmbed = new EmbedBuilder()
                .setTitle('🐛 Bug Report Received')
                .setColor(0x3498db)
                .setDescription(
                    `Thank you for reporting a bug! We appreciate your help in making things better.\n\n` +
                    `You can check the status of your report at any time using \`/bug\` and entering your bug ID.`
                )
                .addFields(
                    { name: '📋 Your Bug ID', value: `\`${bugId}\``, inline: true },
                    { name: '🔗 Your Report', value: `<#${fullThread.id}>`, inline: true },
                    { name: '📊 Current Status', value: `${STATUS_EMOJI['Open']} Open`, inline: true },
                )
                .setTimestamp();

            if (activeFooter) dmEmbed.setFooter(activeFooter);

            if (userSettings.dmOnUpdate) {
                try {
                    await reporter.send({ embeds: [dmEmbed] });
                    client.logger.info(`[BugTracker] DM sent to ${reporter.tag} (${ownerId})`);
                } catch (dmErr) {
                    client.logger.warn(`[BugTracker] DM failed for ${ownerId}: ${dmErr.message}`);
                }
            }

        } catch (err) {
            client.logger.error(`[BugTracker] Failed to register bug: ${err.message}`, err);
        }
    },
};