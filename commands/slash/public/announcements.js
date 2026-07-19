const {
    SlashCommandBuilder,
    EmbedBuilder
} = require("discord.js");

const fs = require("fs");
const path = require("path");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("announcements")
        .setDescription("View the latest announcements, updates, and known bugs."),

    async execute(interaction) {

        const filePath = path.join(process.cwd(), "announce.json");

        if (!fs.existsSync(filePath)) {
            return interaction.reply({
                content: "No announcement data is currently available.",
                ephemeral: true
            });
        }

        let data;

        try {
            data = JSON.parse(fs.readFileSync(filePath, "utf8"));
        } catch (error) {
            console.error(error);

            return interaction.reply({
                content: "Announcement data is invalid.",
                ephemeral: true
            });
        }

        if (!Array.isArray(data.sections)) {
            return interaction.reply({
                content: "Announcement data is malformed.",
                ephemeral: true
            });
        }

        let firstMessageSent = false;

        for (const section of data.sections) {

            const name = section.name?.trim();
            const version = section.version?.trim();
            const published = section.published?.trim();

            // Filter out empty embeds
            const validEmbeds = Array.isArray(section.embeds)
                ? section.embeds.filter(e =>
                    (e.category?.trim() ||
                     e.title?.trim() ||
                     e.description?.trim() ||
                     e.footer?.trim() ||
                     e.thumbnail?.trim())
                )
                : [];

            // Skip entire section if everything is empty
            if (!name && !version && !published && validEmbeds.length === 0) {
                continue;
            }

            // Build plain text header
            let header = `📢 ${name || "Section"}`;
            if (version) header += `\nVersion: ${version}`;
            if (published) header += `\nPublished: ${published}`;

            // Build embeds for this section
            const embeds = [];

            for (const item of validEmbeds) {

                const embed = new EmbedBuilder()
                    .setColor("#9B59FF");

                if (item.category?.trim()) {
                    embed.setAuthor({ name: item.category });
                }

                if (item.title?.trim()) {
                    embed.setTitle(item.title);
                }

                if (item.description?.trim()) {
                    embed.setDescription(item.description);
                }

                // Footer with MUIZI Tracker
                if (item.footer?.trim()) {
                    embed.setFooter({
                        text: `${item.footer} • MUIZI Tracker`
                    });
                } else {
                    embed.setFooter({
                        text: `MUIZI Tracker`
                    });
                }

                if (item.thumbnail?.trim()) {
                    embed.setThumbnail(item.thumbnail);
                }

                embeds.push(embed);
            }

            // Send this section as ONE message
            if (!firstMessageSent) {
                firstMessageSent = true;
                await interaction.reply({
                    content: header,
                    embeds,
                    ephemeral: true
                });
            } else {
                await interaction.followUp({
                    content: header,
                    embeds,
                    ephemeral: true
                });
            }
        }

        if (!firstMessageSent) {
            return interaction.reply({
                content: "No announcements are available.",
                ephemeral: true
            });
        }
    }
};
