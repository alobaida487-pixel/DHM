import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  TextChannel,
  ChannelType,
  REST,
  Routes,
  type RESTPostAPIChatInputApplicationCommandsJSONBody,
} from "discord.js";
import { getConfig, upsertConfig, addAdminRole, removeAdminRole } from "./db";
import { logger } from "../lib/logger";

export const ticketSetupCommand = new SlashCommandBuilder()
  .setName("ticket-setup")
  .setDescription("إعداد نظام التذاكر")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand((sub) =>
    sub
      .setName("config")
      .setDescription("إعداد الإعدادات الأساسية للتذاكر")
      .addChannelOption((opt) =>
        opt
          .setName("log_channel")
          .setDescription("قناة السجل لإرسال سجلات التذاكر")
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true),
      )
      .addStringOption((opt) =>
        opt.setName("image").setDescription("رابط صورة لوحة التذاكر (URL)").setRequired(false),
      )
      .addStringOption((opt) =>
        opt.setName("description").setDescription("وصف لوحة التذاكر").setRequired(false),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("add-role")
      .setDescription("إضافة رتبة إدارة يمكنها إدارة التذاكر")
      .addRoleOption((opt) =>
        opt.setName("role").setDescription("الرتبة المراد إضافتها").setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("remove-role")
      .setDescription("إزالة رتبة إدارة من التذاكر")
      .addRoleOption((opt) =>
        opt.setName("role").setDescription("الرتبة المراد إزالتها").setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("rating-channel")
      .setDescription("تحديد قناة إرسال التقييمات")
      .addChannelOption((opt) =>
        opt
          .setName("channel")
          .setDescription("القناة التي ستُرسل فيها التقييمات")
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("panel")
      .setDescription("إرسال لوحة التذاكر في قناة")
      .addChannelOption((opt) =>
        opt
          .setName("channel")
          .setDescription("القناة التي ستُرسل فيها لوحة التذاكر")
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true),
      ),
  );

export async function handleTicketSetupCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!interaction.guildId) return;
  const sub = interaction.options.getSubcommand();
  if (sub === "config") await handleConfig(interaction);
  else if (sub === "add-role") await handleAddRole(interaction);
  else if (sub === "remove-role") await handleRemoveRole(interaction);
  else if (sub === "rating-channel") await handleRatingChannel(interaction);
  else if (sub === "panel") await handlePanel(interaction);
}

async function handleConfig(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  const logChannel = interaction.options.getChannel("log_channel", true);
  const image = interaction.options.getString("image") ?? undefined;
  const description = interaction.options.getString("description") ?? undefined;

  try {
    await upsertConfig(interaction.guildId!, {
      logChannelId: logChannel.id,
      ...(image !== undefined ? { panelImage: image } : {}),
      ...(description !== undefined ? { panelDescription: description } : {}),
    });

    const embed = new EmbedBuilder()
      .setTitle("✅ تم إعداد نظام التذاكر")
      .setColor(0x57f287)
      .addFields(
        { name: "قناة السجل", value: `<#${logChannel.id}>`, inline: true },
        ...(image ? [{ name: "الصورة", value: "تم تعيينها", inline: true }] : []),
        ...(description ? [{ name: "الوصف", value: description, inline: false }] : []),
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logger.error({ err }, "Error in ticket-setup config");
    await interaction.editReply({ content: "❌ حدث خطأ أثناء حفظ الإعدادات." });
  }
}

async function handleRatingChannel(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  const ch = interaction.options.getChannel("channel", true);

  try {
    await upsertConfig(interaction.guildId!, { ratingChannelId: ch.id });
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle("✅ تم تعيين قناة التقييمات")
          .setDescription(`ستُرسل التقييمات في <#${ch.id}>`)
          .setColor(0x57f287)
          .setTimestamp(),
      ],
    });
  } catch (err) {
    logger.error({ err }, "Error setting rating channel");
    await interaction.editReply({ content: "❌ حدث خطأ." });
  }
}

async function handleAddRole(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  const role = interaction.options.getRole("role", true);

  try {
    await addAdminRole(interaction.guildId!, role.id);
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle("✅ تمت إضافة الرتبة")
          .setDescription(`تمت إضافة <@&${role.id}> كرتبة إدارة للتذاكر.`)
          .setColor(0x57f287)
          .setTimestamp(),
      ],
    });
  } catch (err) {
    logger.error({ err }, "Error adding admin role");
    await interaction.editReply({ content: "❌ حدث خطأ أثناء إضافة الرتبة." });
  }
}

async function handleRemoveRole(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  const role = interaction.options.getRole("role", true);

  try {
    await removeAdminRole(interaction.guildId!, role.id);
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle("✅ تمت إزالة الرتبة")
          .setDescription(`تمت إزالة <@&${role.id}> من رتب إدارة التذاكر.`)
          .setColor(0x57f287)
          .setTimestamp(),
      ],
    });
  } catch (err) {
    logger.error({ err }, "Error removing admin role");
    await interaction.editReply({ content: "❌ حدث خطأ أثناء إزالة الرتبة." });
  }
}

async function handlePanel(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  const targetChannel = interaction.options.getChannel("channel", true);

  try {
    const config = await getConfig(interaction.guildId!);

    if (!config) {
      await interaction.editReply({
        content: "❌ لم يتم إعداد النظام بعد. يرجى تشغيل `/ticket-setup config` أولاً.",
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle("فتح تذكرة دعم")
      .setDescription(
        config.panelDescription ||
          "اضغط على الزر أدناه لفتح تذكرة دعم وسيقوم فريقنا بمساعدتك في أقرب وقت ممكن.",
      )
      .setColor(0x5865f2)
      .setFooter({ text: interaction.guild?.name ?? "" })
      .setTimestamp();

    if (config.panelImage) embed.setImage(config.panelImage);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("create_ticket")
        .setLabel("فتح تذكرة")
        .setStyle(ButtonStyle.Primary),
    );

    const ch = interaction.guild?.channels.cache.get(targetChannel.id) as TextChannel | undefined;
    if (!ch) {
      await interaction.editReply({ content: "❌ لم يتم العثور على القناة." });
      return;
    }

    await ch.send({ embeds: [embed], components: [row] });
    await interaction.editReply({ content: `✅ تم إرسال لوحة التذاكر في <#${ch.id}>` });
  } catch (err) {
    logger.error({ err }, "Error sending ticket panel");
    await interaction.editReply({ content: "❌ حدث خطأ أثناء إرسال اللوحة." });
  }
}

export async function registerGuildCommands(applicationId: string, guildId: string): Promise<void> {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) return;

  const rest = new REST({ version: "10" }).setToken(token);
  const commands: RESTPostAPIChatInputApplicationCommandsJSONBody[] = [
    ticketSetupCommand.toJSON(),
  ];

  try {
    await rest.put(Routes.applicationGuildCommands(applicationId, guildId), { body: commands });
    logger.info({ guildId }, "Registered slash commands for guild");
  } catch (err) {
    logger.error({ err, guildId }, "Failed to register slash commands");
  }
}
