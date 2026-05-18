import { Client, GatewayIntentBits, Partials } from "discord.js";
import { handleTicketSetupCommand, registerGuildCommands } from "./commands";
import { handleButton } from "./buttons";
import { handleModal } from "./modals";
import { logger } from "../lib/logger";

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

export function getClient(): Client | null {
  return client;
}
