import {
  ButtonInteraction,
  TextChannel,
  ChannelType,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
} from "discord.js";
import type { TicketConfig, Ticket } from "./db";
import { logger } from "../lib/logger";

export async function createTicketChannel(
  interaction: ButtonInteraction,
  config: TicketConfig,
): Promise<TextChannel> {
  const guild = interaction.guild!;
  const user = interaction.user;

  const adminOverwrites = (config.adminRoleIds ?? []).map((roleId) => ({
    id: roleId,
    allow: [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.ReadMessageHistory,
      PermissionFlagsBits.ManageMessages,
      PermissionFlagsBits.AttachFiles,
    ],
  }));

  const channel = (await guild.channels.create({
    name: `ticket-${user.username}`.slice(0, 100).replace(/[^a-z0-9-]/gi, "-"),
    type: ChannelType.GuildText,
    permissionOverwrites: [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      {
        id: user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles,
        ],
      },
      {
        id: interaction.client.user!.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageChannels,
          PermissionFlagsBits.ManageMessages,
          PermissionFlagsBits.AttachFiles,
        ],
      },
      ...adminOverwrites,
    ],
  })) as TextChannel;

  return channel;
}

export function buildTicketEmbed(
  userId: string,
  username: string,
  avatarUrl: string,
  ticketId: number,
): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle(`🎫 تذكرة #${ticketId}`)
    .setDescription(
      `مرحباً <@${userId}>\nشكراً لفتح تذكرة. سيقوم فريق الدعم بمساعدتك قريباً.\n\nيرجى شرح مشكلتك بالتفصيل.`,
    )
    .setColor(0x5865f2)
    .setFooter({ text: `فُتح بواسطة ${username}`, iconURL: avatarUrl })
    .setTimestamp();
}

export function buildTicketButtons(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("ticket_claim").setLabel("استلام").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("ticket_close").setLabel("اغلاق").setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId("ticket_add_member")
      .setLabel("اضافة عضو")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("ticket_delete")
      .setLabel("حذف")
      .setStyle(ButtonStyle.Secondary),
  );
}

export async function collectTranscript(channel: TextChannel): Promise<string> {
  const messages = [];
  let lastId: string | undefined;

  try {
    while (true) {
      const fetched = await channel.messages.fetch({
        limit: 100,
        ...(lastId ? { before: lastId } : {}),
      });
      if (fetched.size === 0) break;
      messages.push(...fetched.values());
      lastId = fetched.last()?.id;
      if (fetched.size < 100) break;
    }
  } catch (err) {
    logger.warn({ err }, "Error fetching transcript messages");
  }

  messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

  const lines = messages.map((m) => {
    const time = m.createdAt.toISOString().replace("T", " ").slice(0, 19);
    const author = m.author.bot ? `[BOT] ${m.author.tag}` : m.author.tag;
    let content = m.content || "";
    if (m.embeds.length > 0) content += " [Embed]";
    if (m.attachments.size > 0) content += ` [${m.attachments.size} مرفق]`;
    return `[${time}] ${author}: ${content}`;
  });

  return lines.join("\n") || "لا توجد رسائل";
}

export async function sendCloseLog(
  logChannel: TextChannel,
  ticket: Ticket,
  reason: string,
  closedById: string,
  transcript: string,
  channelName: string,
): Promise<void> {
  const embed = new EmbedBuilder()
    .setTitle("📋 سجل التذكرة المغلقة")
    .setColor(0xff6b6b)
    .addFields(
      { name: "👤 صاحب التذكرة", value: `<@${ticket.userId}> (${ticket.username})`, inline: true },
      { name: "🔒 أُغلق بواسطة", value: `<@${closedById}>`, inline: true },
      { name: "📝 سبب الإغلاق", value: reason, inline: false },
      ...(ticket.claimedBy
        ? [{ name: "✅ استُلمت بواسطة", value: `<@${ticket.claimedBy}>`, inline: true }]
        : []),
      {
        name: "📅 تاريخ الإنشاء",
        value: ticket.createdAt.toISOString().replace("T", " ").slice(0, 19) + " UTC",
        inline: true,
      },
      {
        name: "📅 تاريخ الإغلاق",
        value: new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC",
        inline: true,
      },
    )
    .setTimestamp();

  await logChannel.send({
    embeds: [embed],
    files: [
      {
        attachment: Buffer.from(transcript, "utf-8"),
        name: `transcript-${channelName}-${ticket.id}.txt`,
      },
    ],
  });
}

export async function sendCloseDM(
  client: Client,
  userId: string,
  guildName: string,
  reason: string,
  closedById: string,
  transcript: string,
  channelName: string,
  ticketId: number,
): Promise<void> {
  try {
    const user = await client.users.fetch(userId);
    const embed = new EmbedBuilder()
      .setTitle("🔒 تم إغلاق تذكرتك")
      .setDescription(`تم إغلاق تذكرتك في **${guildName}**`)
      .setColor(0xff6b6b)
      .addFields(
        { name: "📝 سبب الإغلاق", value: reason, inline: false },
        { name: "🔒 أُغلق بواسطة", value: `<@${closedById}>`, inline: true },
      )
      .setTimestamp();

    await user.send({
      embeds: [embed],
      files: [
        {
          attachment: Buffer.from(transcript, "utf-8"),
          name: `transcript-${channelName}-${ticketId}.txt`,
        },
      ],
    });
  } catch (err) {
    logger.warn({ err, userId }, "Could not send DM to ticket owner");
  }
}
