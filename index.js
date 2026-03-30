require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  PermissionsBitField,
  ChannelType,
  AttachmentBuilder
} = require("discord.js");

const {
  joinVoiceChannel,
  getVoiceConnection
} = require("@discordjs/voice");

const { createCanvas, loadImage } = require("canvas");
const express = require("express");

/* =========================
   WEB SERVER
========================= */
const app = express();

app.get("/", (req, res) => {
  res.status(200).send("Bot aktif");
});

app.get("/health", (req, res) => {
  res.status(200).send("OK");
});

app.use((req, res) => {
  res.status(200).send("Bot aktif");
});

app.listen(process.env.PORT || 3000, () => {
  console.log(`Web server aktif: ${process.env.PORT || 3000}`);
});

/* =========================
   DISCORD CLIENT
========================= */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildPresences
  ],
  partials: [Partials.Channel]
});

const PREFIX = process.env.PREFIX || ".";
const snipes = new Map();

/* =========================
   HELPERS
========================= */
function randomPercent() {
  return Math.floor(Math.random() * 101);
}

function getSpotifyImage(activity) {
  try {
    const largeImage = activity.assets?.largeImage || activity.assets?.largeImageURL?.();

    if (!largeImage) return null;

    if (typeof largeImage === "string" && largeImage.startsWith("spotify:")) {
      const imageId = largeImage.split(":")[1];
      return `https://i.scdn.co/image/${imageId}`;
    }

    if (typeof largeImage === "string" && largeImage.startsWith("mp:external/")) {
      return `https://media.discordapp.net/${largeImage}`;
    }

    if (typeof largeImage === "string" && largeImage.startsWith("https://")) {
      return largeImage;
    }

    return null;
  } catch {
    return null;
  }
}

function getVoiceChannel(member) {
  return member?.voice?.channel || null;
}

function canUseManageChannels(member) {
  return member.permissions.has(PermissionsBitField.Flags.ManageChannels);
}

function getShipStatus(percent) {
  if (percent >= 90) return "Mukemmel uyum";
  if (percent >= 70) return "Cok iyi gidiyor";
  if (percent >= 50) return "Fena degil";
  if (percent >= 25) return "Olabilir";
  return "Biraz zayif";
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

async function buildShipCard(user1, user2, percent) {
  const width = 900;
  const height = 420;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  const background = await loadImage("./assets/ship.png");
  const avatar1 = await loadImage(user1.displayAvatarURL({ extension: "png", size: 512 }));
  const avatar2 = await loadImage(user2.displayAvatarURL({ extension: "png", size: 512 }));

  ctx.drawImage(background, 0, 0, width, height);

  function drawAvatar(img, x, y, size) {
    ctx.save();

    roundRect(ctx, x, y, size, size, 22);
    ctx.clip();
    ctx.drawImage(img, x, y, size, size);

    ctx.restore();
  }

  // Avatar konumları
  drawAvatar(avatar1, 92, 96, 230);
  drawAvatar(avatar2, 578, 96, 230);

  // Yüzde
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "rgba(255, 105, 180, 0.65)";
  ctx.lineWidth = 8;
  ctx.font = "bold 56px Sans";

  ctx.strokeText(`%${percent}`, width / 2, 308);
  ctx.fillText(`%${percent}`, width / 2, 308);

  // Alt yorum
  const statusText = getShipStatus(percent);
  ctx.font = "bold 28px Sans";
  ctx.lineWidth = 6;
  ctx.strokeText(statusText, width / 2, 344);
  ctx.fillText(statusText, width / 2, 344);

  // Progress bar
  const barX = 145;
  const barY = 365;
  const barW = 610;
  const barH = 28;
  const fillW = Math.max(18, Math.floor((barW * percent) / 100));

  const grad = ctx.createLinearGradient(barX, barY, barX + barW, barY);
  grad.addColorStop(0, "#ff8fb8");
  grad.addColorStop(0.5, "#ffb3d1");
  grad.addColorStop(1, "#caa6ff");

  ctx.save();
  roundRect(ctx, barX, barY, fillW, barH, 14);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.restore();

  return canvas.toBuffer("image/png");
}

/* =========================
   READY
========================= */
client.once("clientReady", async () => {
  console.log(`${client.user.tag} olarak giriş yapıldı.`);

  client.user.setPresence({
    activities: [{ name: "eglence zamani" }],
    status: "dnd"
  });

  if (process.env.AUTO_JOIN_VOICE_CHANNEL_ID && process.env.GUILD_ID) {
    try {
      const guild = await client.guilds.fetch(process.env.GUILD_ID);
      const channel = await guild.channels.fetch(process.env.AUTO_JOIN_VOICE_CHANNEL_ID);

      if (channel && channel.isVoiceBased()) {
        joinVoiceChannel({
          channelId: channel.id,
          guildId: guild.id,
          adapterCreator: guild.voiceAdapterCreator,
          selfDeaf: true,
          selfMute: false
        });

        console.log(`Otomatik olarak ${channel.name} kanalına katıldı.`);
      }
    } catch (err) {
      console.error("Auto join voice hatasi:", err);
    }
  }
});

/* =========================
   SNIPE SYSTEM
========================= */
client.on("messageDelete", async (message) => {
  try {
    if (!message.guild) return;
    if (message.author?.bot) return;

    snipes.set(message.channel.id, {
      content: message.content || "Mesaj icerigi yok.",
      authorTag: message.author?.tag || "Bilinmeyen Kullanici",
      authorId: message.author?.id || "Bilinmiyor",
      avatar: message.author?.displayAvatarURL({ extension: "png", size: 256 }) || null,
      createdAt: Date.now(),
      attachments: message.attachments?.map((a) => a.url) || []
    });
  } catch (err) {
    console.error("Snipe kayit hatasi:", err);
  }
});

/* =========================
   COMMANDS
========================= */
client.on("messageCreate", async (message) => {
  try {
    if (!message.guild) return;
    if (message.author.bot) return;
    if (!message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
    const command = args.shift()?.toLowerCase();

    if (command === "join") {
      const voiceChannel = getVoiceChannel(message.member);

      if (!voiceChannel) {
        return message.reply("Once bir ses kanalina girmen gerekiyor.");
      }

      const permissions = voiceChannel.permissionsFor(message.guild.members.me);
      if (
        !permissions.has(PermissionsBitField.Flags.Connect) ||
        !permissions.has(PermissionsBitField.Flags.ViewChannel)
      ) {
        return message.reply("Bu ses kanalina baglanma yetkim yok.");
      }

      joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: voiceChannel.guild.id,
        adapterCreator: voiceChannel.guild.voiceAdapterCreator,
        selfDeaf: true,
        selfMute: false
      });

      client.user.setPresence({
        activities: [{ name: "eglence zamani" }],
        status: "dnd"
      });

      return message.reply(`"${voiceChannel.name}" kanalina katildim.`);
    }

    if (command === "leave") {
      const connection = getVoiceConnection(message.guild.id);

      if (!connection) {
        return message.reply("Zaten bir ses kanalinda degilim.");
      }

      connection.destroy();

      client.user.setPresence({
        activities: [{ name: "eglence zamani" }],
        status: "dnd"
      });

      return message.reply("Ses kanalindan ayrildim.");
    }

    if (command === "snipe") {
      const snipe = snipes.get(message.channel.id);

      if (!snipe) {
        return message.reply("Bu kanalda gosterilecek silinmis mesaj yok.");
      }

      const embed = new EmbedBuilder()
        .setColor(0x2b2d31)
        .setAuthor({
          name: `${snipe.authorTag}`,
          iconURL: snipe.avatar || undefined
        })
        .setDescription(snipe.content)
        .setFooter({
          text: `Kullanici ID: ${snipe.authorId}`
        })
        .setTimestamp(snipe.createdAt);

      if (snipe.attachments.length > 0) {
        embed.addFields({
          name: "Ekler",
          value: snipe.attachments.join("\n").slice(0, 1024)
        });
      }

      return message.reply({ embeds: [embed] });
    }

    if (command === "av" || command === "avatar") {
      const target =
        message.mentions.users.first() ||
        (args[0] ? await client.users.fetch(args[0]).catch(() => null) : null) ||
        message.author;

      const avatarURL = target.displayAvatarURL({ extension: "png", size: 2048 });

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`${target.username} kullanicisining avatari`)
        .setImage(avatarURL)
        .setURL(avatarURL);

      return message.reply({ embeds: [embed] });
    }

    if (command === "spotify") {
      let targetMember =
        message.mentions.members.first() ||
        (args[0] ? await message.guild.members.fetch(args[0]).catch(() => null) : null) ||
        message.member;

      if (!targetMember) {
        targetMember = message.member;
      }

      const spotifyActivity = targetMember.presence?.activities?.find(
        (activity) => activity.name === "Spotify" || activity.type === 2
      );

      if (!spotifyActivity) {
        return message.reply("Bu kullanici su anda Spotify dinlemiyor ya da Spotify aktivitesi gorunmuyor.");
      }

      const song = spotifyActivity.details || "Bilinmeyen Sarki";
      const artist = spotifyActivity.state || "Bilinmeyen Sanatci";
      const album = spotifyActivity.assets?.largeText || "Bilinmeyen Album";
      const trackId = spotifyActivity.syncId;
      const spotifyUrl = trackId ? `https://open.spotify.com/track/${trackId}` : null;
      const image = getSpotifyImage(spotifyActivity);

      const embed = new EmbedBuilder()
        .setColor(0x1db954)
        .setAuthor({
          name: `${targetMember.user.username} Spotify dinliyor`,
          iconURL: targetMember.displayAvatarURL({ extension: "png" })
        })
        .addFields(
          { name: "Sarki", value: song, inline: false },
          { name: "Sanatci", value: artist, inline: true },
          { name: "Album", value: album, inline: true }
        )
        .setFooter({ text: "Spotify" })
        .setTimestamp();

      if (spotifyUrl) embed.setURL(spotifyUrl);
      if (image) embed.setThumbnail(image);

      return message.reply({ embeds: [embed] });
    }

    if (command === "ship") {
      let user1 = message.author;
      let user2 = null;

      const mentionedUser =
        message.mentions.users.first() ||
        (args[0] ? await client.users.fetch(args[0]).catch(() => null) : null);

      if (mentionedUser) {
        if (mentionedUser.bot) {
          return message.reply("Botlarla ship yapilamaz.");
        }
        if (mentionedUser.id === message.author.id) {
          return message.reply("Kendinle kendini shipleyemezsin.");
        }
        user2 = mentionedUser;
      } else {
        const candidates = message.guild.members.cache
          .filter((m) => !m.user.bot && m.id !== message.author.id)
          .map((m) => m.user);

        if (!candidates.length) {
          return message.reply("Ship icin uygun bir kullanici bulamadim.");
        }

        user2 = candidates[Math.floor(Math.random() * candidates.length)];
      }

      const percent = randomPercent();
      const cardBuffer = await buildShipCard(user1, user2, percent);
      const attachment = new AttachmentBuilder(cardBuffer, { name: "ship.png" });

      return message.reply({
        content: `[\`${user1.username}\` & \`${user2.username}\`]\nUyum: **%${percent}**`,
        files: [attachment]
      });
    }

    if (command === "nuke") {
      if (!canUseManageChannels(message.member)) {
        return message.reply("Bu komut icin Kanallari Yonet yetkin olmali.");
      }

      const botPerms = message.channel.permissionsFor(message.guild.members.me);
      if (!botPerms.has(PermissionsBitField.Flags.ManageChannels)) {
        return message.reply("Bu islem icin Kanallari Yonet yetkim yok.");
      }

      const oldChannel = message.channel;

      if (
        oldChannel.type !== ChannelType.GuildText &&
        oldChannel.type !== ChannelType.GuildAnnouncement
      ) {
        return message.reply("Bu komut sadece yazi kanallarinda kullanilabilir.");
      }

      try {
        const cloned = await oldChannel.clone({
          name: oldChannel.name,
          position: oldChannel.position,
          topic: oldChannel.topic ?? undefined,
          nsfw: oldChannel.nsfw,
          rateLimitPerUser: oldChannel.rateLimitPerUser,
          parent: oldChannel.parent,
          permissionOverwrites: oldChannel.permissionOverwrites.cache,
          reason: `Nuked by ${message.author.tag}`
        });

        if (oldChannel.parentId && oldChannel.permissionsLocked) {
          await cloned.lockPermissions().catch(() => null);
        }

        await oldChannel.delete(`Nuked by ${message.author.tag}`);
        await cloned.send(`Nuked by ${message.author}`);
      } catch (err) {
        console.error("Nuke hatasi:", err);
        return message.reply("Kanal temizlenirken bir hata olustu.");
      }
    }

    if (command === "help") {
      const embed = new EmbedBuilder()
        .setColor(0x2b2d31)
        .setTitle("Komut Menusu")
        .setDescription("Kullanilabilir komutlar asagida listelenmistir.")
        .addFields(
          {
            name: "Ses",
            value: "`.join`\n`.leave`",
            inline: true
          },
          {
            name: "Mesaj",
            value: "`.snipe`\n`.nuke`",
            inline: true
          },
          {
            name: "Kullanici",
            value: "`.av`\n`.avatar`\n`.spotify`",
            inline: true
          },
          {
            name: "Eglence",
            value: "`.ship`\n`.ship @kullanici`",
            inline: true
          },
          {
            name: "Bilgi",
            value: "`.help`\n`.serverinfo`",
            inline: true
          }
        )
        .setFooter({
          text: `Prefix: ${PREFIX}`
        });

      return message.reply({ embeds: [embed] });
    }

    if (command === "serverinfo") {
      const guild = message.guild;
      const owner = await guild.fetchOwner().catch(() => null);

      const textChannels = guild.channels.cache.filter(
        (c) => c.type === ChannelType.GuildText
      ).size;

      const voiceChannels = guild.channels.cache.filter(
        (c) => c.type === ChannelType.GuildVoice
      ).size;

      const categoryChannels = guild.channels.cache.filter(
        (c) => c.type === ChannelType.GuildCategory
      ).size;

      const embed = new EmbedBuilder()
        .setColor(0x2b2d31)
        .setTitle(guild.name)
        .setThumbnail(guild.iconURL({ extension: "png", size: 1024 }))
        .addFields(
          {
            name: "Sunucu ID",
            value: guild.id,
            inline: true
          },
          {
            name: "Kurucu",
            value: owner ? `${owner.user.tag}` : "Bilinmiyor",
            inline: true
          },
          {
            name: "Kurulus Tarihi",
            value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:F>`,
            inline: false
          },
          {
            name: "Uye Sayisi",
            value: `${guild.memberCount}`,
            inline: true
          },
          {
            name: "Rol Sayisi",
            value: `${guild.roles.cache.size}`,
            inline: true
          },
          {
            name: "Boost Seviyesi",
            value: `${guild.premiumTier}`,
            inline: true
          },
          {
            name: "Boost Sayisi",
            value: `${guild.premiumSubscriptionCount || 0}`,
            inline: true
          },
          {
            name: "Dogrulama Seviyesi",
            value: `${guild.verificationLevel}`,
            inline: true
          },
          {
            name: "Kanallar",
            value: `Yazi: ${textChannels}\nSes: ${voiceChannels}\nKategori: ${categoryChannels}`,
            inline: false
          }
        );

      return message.reply({ embeds: [embed] });
    }
  } catch (err) {
    console.error("Komut hatasi:", err);
    return message.reply("Komut calistirilirken bir hata olustu.");
  }
});

/* =========================
   ERROR HANDLERS
========================= */
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});

/* =========================
   LOGIN
========================= */
client.login(process.env.TOKEN);