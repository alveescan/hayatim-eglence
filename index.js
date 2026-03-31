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
const fs = require("fs");
const path = require("path");
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

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function resolveShipImagePath() {
  const assetsDir = path.join(__dirname, "assets");

  if (!fs.existsSync(assetsDir)) {
    throw new Error(`assets klasoru bulunamadi: ${assetsDir}`);
  }

  const files = fs.readdirSync(assetsDir);
  console.log("Assets klasoru icerigi:", files);

  const exactShip = files.find((file) => file.toLowerCase() === "ship.png");
  if (exactShip) {
    const fullPath = path.join(assetsDir, exactShip);
    console.log("Kullanilan ship arka plan:", fullPath);
    return fullPath;
  }

  const anyPng = files.find((file) => file.toLowerCase().endsWith(".png"));
  if (anyPng) {
    const fullPath = path.join(assetsDir, anyPng);
    console.log("ship.png bulunamadi, ilk png kullaniliyor:", fullPath);
    return fullPath;
  }

  throw new Error(`assets klasorunde png yok. Bulunan dosyalar: ${files.join(", ") || "bos"}`);
}

function drawRoundedImage(ctx, img, x, y, w, h, radius = 24) {
  ctx.save();
  roundRect(ctx, x, y, w, h, radius);
  ctx.clip();

  const scale = Math.max(w / img.width, h / img.height);
  const drawWidth = img.width * scale;
  const drawHeight = img.height * scale;
  const drawX = x + (w - drawWidth) / 2;
  const drawY = y + (h - drawHeight) / 2;

  ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
  ctx.restore();
}

function drawVerticalFill(ctx, x, y, w, h, percent) {
  // iç padding: görseldeki boş barın içine otursun diye
  const padX = Math.max(8, Math.round(w * 0.08));
  const padTop = Math.max(10, Math.round(h * 0.07));
  const padBottom = Math.max(10, Math.round(h * 0.03));

  const innerX = x + padX;
  const innerY = y + padTop;
  const innerW = w - padX * 2;
  const innerH = h - padTop - padBottom;

  const fillH = Math.max(0, Math.round((innerH * percent) / 100));
  const fillY = innerY + (innerH - fillH);

  if (fillH > 0) {
    const grad = ctx.createLinearGradient(innerX, innerY, innerX, innerY + innerH);
    grad.addColorStop(0, "#5b0013");
    grad.addColorStop(0.45, "#7c0820");
    grad.addColorStop(1, "#b50020");

    ctx.save();
    roundRect(ctx, innerX, innerY, innerW, innerH, Math.max(12, Math.round(innerW * 0.18)));
    ctx.clip();

    ctx.fillStyle = grad;
    ctx.fillRect(innerX, fillY, innerW, fillH);

    // hafif parlama
    const gloss = ctx.createLinearGradient(innerX, fillY, innerX, fillY + fillH);
    gloss.addColorStop(0, "rgba(255,255,255,0.18)");
    gloss.addColorStop(0.25, "rgba(255,255,255,0.06)");
    gloss.addColorStop(1, "rgba(255,255,255,0.00)");
    ctx.fillStyle = gloss;
    ctx.fillRect(innerX, fillY, innerW, fillH);

    ctx.restore();
  }
}

function drawPercentText(ctx, x, y, w, h, percent, canvasWidth) {
  const fontSize = Math.max(28, Math.round(canvasWidth * 0.028));
  ctx.font = `bold ${fontSize}px Arial`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.lineWidth = Math.max(3, Math.round(canvasWidth * 0.002));
  ctx.strokeStyle = "rgba(70, 0, 0, 0.65)";
  ctx.fillStyle = "#ffffff";

  const textX = x + w / 2;
  const textY = y + Math.max(28, h * 0.12);

  ctx.strokeText(`%${percent}`, textX, textY);
  ctx.fillText(`%${percent}`, textX, textY);
}

function drawHeartProgress(ctx, x, y, h, percent, canvasWidth) {
  const totalHearts = 5;
  const activeHearts = Math.max(0, Math.min(totalHearts, Math.ceil(percent / 20)));
  const spacing = h / (totalHearts - 1);
  const lineLen = Math.max(18, Math.round(canvasWidth * 0.02));
  const heartFont = Math.max(24, Math.round(canvasWidth * 0.022));

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `${heartFont}px Arial`;

  for (let i = 0; i < totalHearts; i++) {
    const cy = y + i * spacing;
    const isActive = i < activeHearts;

    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, cy);
    ctx.lineTo(x + lineLen, cy);
    ctx.stroke();

    ctx.fillStyle = isActive ? "#d91533" : "rgba(80, 0, 0, 0.45)";
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 1.5;
    ctx.strokeText("❤", x + lineLen + heartFont * 0.9, cy);
    ctx.fillText("❤", x + lineLen + heartFont * 0.9, cy);
  }
}

async function buildShipCard(user1, user2, percent) {
  const backgroundPath = resolveShipImagePath();
  const backgroundBuffer = fs.readFileSync(backgroundPath);
  const background = await loadImage(backgroundBuffer);

  const width = background.width;
  const height = background.height;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  const avatar1 = await loadImage(
    user1.displayAvatarURL({ extension: "png", size: 512 })
  );
  const avatar2 = await loadImage(
    user2.displayAvatarURL({ extension: "png", size: 512 })
  );

  ctx.drawImage(background, 0, 0, width, height);

  // Bu oranlar senin seçtiğin PNG’ye göre ayarlandı
  const leftBox = {
    x: Math.round(width * 0.089),
    y: Math.round(height * 0.247),
    w: Math.round(width * 0.257),
    h: Math.round(height * 0.474)
  };

  const rightBox = {
    x: Math.round(width * 0.622),
    y: Math.round(height * 0.247),
    w: Math.round(width * 0.257),
    h: Math.round(height * 0.474)
  };

  const barBox = {
    x: Math.round(width * 0.455),
    y: Math.round(height * 0.221),
    w: Math.round(width * 0.118),
    h: Math.round(height * 0.543)
  };

  // Avatarlar frame içine taşmadan otursun
  const avatarInset = Math.max(10, Math.round(width * 0.008));

  drawRoundedImage(
    ctx,
    avatar1,
    leftBox.x + avatarInset,
    leftBox.y + avatarInset,
    leftBox.w - avatarInset * 2,
    leftBox.h - avatarInset * 2,
    Math.max(18, Math.round(width * 0.015))
  );

  drawRoundedImage(
    ctx,
    avatar2,
    rightBox.x + avatarInset,
    rightBox.y + avatarInset,
    rightBox.w - avatarInset * 2,
    rightBox.h - avatarInset * 2,
    Math.max(18, Math.round(width * 0.015))
  );

  // Orta bar dolumu
  drawVerticalFill(ctx, barBox.x, barBox.y, barBox.w, barBox.h, percent);

  // Yüzde yazısı
  drawPercentText(ctx, barBox.x, barBox.y, barBox.w, barBox.h, percent, width);

  // Sağdaki kalp scale
  drawHeartProgress(
    ctx,
    Math.round(width * 0.585),
    Math.round(height * 0.325),
    Math.round(height * 0.36),
    percent,
    width
  );

  return canvas.toBuffer("image/png");
}

/* =========================
   READY
========================= */
client.once("clientReady", async () => {
  console.log(`${client.user.tag} olarak giriş yapildi.`);

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

        console.log(`Otomatik olarak ${channel.name} kanalina katildi.`);
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