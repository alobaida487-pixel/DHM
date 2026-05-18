import {
  Client,
  GatewayIntentBits,
  Partials,
  Message,
  TextChannel,
  GuildMember,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import { handleTicketSetupCommand, registerGuildCommands } from "./commands";
import { handleButton } from "./buttons";
import { handleModal } from "./modals";
import { getConfig } from "./db";
import { logger } from "../lib/logger";

const PREFIX = "-تقييم";

let client: Client | null = null;

export async function startBot(): Promise<void> {
  const token = process.env.DISCORD_BOT_TOKEN;

  if (!token) {
    logger.warn("DISCORD_BOT_TOKEN not set — Discord bot disabled");
    return;
  }

  if (process.env.DISCORD_ENABLED === "false") {
    logger.info("Discord bot disabled via DISCORD_ENABLED=false");
    return;
  }

  client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.GuildMembers,
    ],
    partials: [Partials.Channel, Partials.Message],
  });

  client.once("ready", async (c) => {
    logger.info({ tag: c.user.tag }, "Discord bot ready");
    for (const guild of c.guilds.cache.values()) {
      await registerGuildCommands(c.user.id, guild.id);
    }
  });

  client.on("guildCreate", async (guild) => {
    if (!client?.user) return;
    await registerGuildCommands(client.user.id, guild.id);
  });

  client.on("messageCreate", async (message: Message) => {
    if (message.author.bot || !message.guild) return;
    if (!message.content.startsWith(PREFIX)) return;

    try {
      await handleRatePrefix(message);
    } catch (err) {
      logger.error({ err }, "Error handling rate prefix command");
    }
  });

  client.on("interactionCreate", async (interaction) => {
    try {
      if (interaction.isChatInputCommand()) {
        if (interaction.commandName === "ticket-setup") {
          await handleTicketSetupCommand(interaction);
        }
      } else if (interaction.isButton()) {
        await handleButton(interaction);
      } else if (interaction.isModalSubmit()) {
        await handleModal(interaction);
      }
    } catch (err) {
      logger.error({ err }, "Unhandled interaction error");
    }
  });

  client.on("error", (err) => {
    logger.error({ err }, "Discord client error");
  });

  await client.login(token);
  logger.info("Discord bot logged in");
}

async function handleRatePrefix(message: Message): Promise<void> {
  if (!message.guild || !message.guildId) return;

  const config = await getConfig(message.guildId);
  const adminRoleIds = config?.adminRoleIds ?? [];

  const member = message.member as GuildMember | null;
  const isAdmin =
    adminRoleIds.length === 0
      ? member?.permissions.has(PermissionFlagsBits.Administrator) ?? false
      : adminRoleIds.some((r) => member?.roles.cache.has(r));

  if (!isAdmin) {
    await message.reply("❌ هذا الأمر مخصص للإدارة فقط.");
    return;
  }

  const adminId = message.author.id;

  const stars = ["⭐", "⭐⭐", "⭐⭐⭐", "⭐⭐⭐⭐", "⭐⭐⭐⭐⭐"];

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    stars.map((label, i) =>
      new ButtonBuilder()
        .setCustomId(`rate_${i + 1}_${adminId}`)
        .setLabel(label)
        .setStyle(ButtonStyle.Primary),
    ),
  );

  const embed = new EmbedBuilder()
    .setDescription(`قيّم الاداري <@${adminId}> بكل صدق وأمانة`)
    .setColor(0xffd700)
    .setTimestamp();

  await (message.channel as TextChannel).send({ embeds: [embed], components: [row] });

  try {
    await message.delete();
  } catch {}
}

export function getClient(): Client | null {
  return client;
}
