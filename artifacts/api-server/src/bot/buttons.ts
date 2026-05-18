import {
  ButtonInteraction,
  GuildMember,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  TextChannel,
  EmbedBuilder,
} from "discord.js";
import {
  getConfig,
  getTicketByChannelId,
  getOpenTicketByUser,
  createTicketRecord,
  updateTicket,
  deleteTicketRecord,
} from "./db";
import { createTicketChannel, buildTicketEmbed, buildTicketButtons } from "./tickets";
import { logger } from "../lib/logger";

function getMemberRoleIds(interaction: ButtonInteraction): string[] {
  if (!interaction.member) return [];
  if (interaction.member instanceof GuildMember) {
    return [...interaction.member.roles.cache.keys()];
  }
  return Array.isArray(interaction.member.roles) ? interaction.member.roles : [];
}

async function checkAdminRole(
  interaction: ButtonInteraction,
  adminRoleIds: string[],
): Promise<boolean> {
  if (adminRoleIds.length === 0) {
    const member = interaction.member;
    if (member instanceof GuildMember) {
      return member.permissions.has("Administrator");
    }
    return false;
  }
  const memberRoles = getMemberRoleIds(interaction);
  return adminRoleIds.some((r) => memberRoles.includes(r));
}

export async function handleButton(interaction: ButtonInteraction): Promise<void> {
  const { customId } = interaction;

  if (customId === "create_ticket") {
    await handleCreateTicket(interaction);
  } else if (customId === "ticket_claim") {
    await handleClaim(interaction);
  } else if (customId === "ticket_close") {
    await handleClose(interaction);
  } else if (customId === "ticket_add_member") {
    await handleAddMember(interaction);
  } else if (customId === "ticket_delete") {
    await handleDelete(interaction);
  }
}

async function handleCreateTicket(interaction: ButtonInteraction): Promise<void> {
  try {
    await interaction.deferReply({ ephemeral: true });

    const guildId = interaction.guildId!;
    const config = await getConfig(guildId);

    if (!config) {
      await interaction.editReply({
        content: "❌ لم يتم إعداد نظام التذاكر. تواصل مع الإدارة.",
      });
      return;
    }

    const existing = await getOpenTicketByUser(guildId, interaction.user.id);
    if (existing) {
      await interaction.editReply({
        content: `❌ لديك تذكرة مفتوحة بالفعل: <#${existing.channelId}>`,
      });
      return;
    }

    const channel = await createTicketChannel(interaction, config);

    const ticket = await createTicketRecord({
      guildId,
      channelId: channel.id,
      userId: interaction.user.id,
      username: interaction.user.username,
    });

    const embed = buildTicketEmbed(
      interaction.user.id,
      interaction.user.username,
      interaction.user.displayAvatarURL(),
      ticket.id,
    );
    const buttons = buildTicketButtons();

    await channel.send({
      content: `<@${interaction.user.id}>`,
      embeds: [embed],
      components: [buttons],
    });

    await interaction.editReply({ content: `✅ تم إنشاء تذكرتك: <#${channel.id}>` });
  } catch (err) {
    logger.error({ err }, "Error creating ticket");
    try {
      await interaction.editReply({ content: "❌ حدث خطأ أثناء إنشاء التذكرة." });
    } catch {}
  }
}

async function handleClaim(interaction: ButtonInteraction): Promise<void> {
  try {
    const guildId = interaction.guildId!;
    const config = await getConfig(guildId);
    const adminRoleIds = config?.adminRoleIds ?? [];

    if (!(await checkAdminRole(interaction, adminRoleIds))) {
      await interaction.reply({
        content: "❌ ليس لديك صلاحية استلام التذاكر.",
        ephemeral: true,
      });
      return;
    }

    const ticket = await getTicketByChannelId(interaction.channelId);
    if (!ticket) {
      await interaction.reply({ content: "❌ لم يتم العثور على هذه التذكرة.", ephemeral: true });
      return;
    }

    if (ticket.status === "closed") {
      await interaction.reply({ content: "❌ هذه التذكرة مغلقة بالفعل.", ephemeral: true });
      return;
    }

    await updateTicket(interaction.channelId, {
      status: "claimed",
      claimedBy: interaction.user.id,
    });

    const embed = new EmbedBuilder()
      .setDescription(`✅ تم استلام التذكرة بواسطة <@${interaction.user.id}>`)
      .setColor(0x57f287)
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  } catch (err) {
    logger.error({ err }, "Error claiming ticket");
    try {
      await interaction.reply({ content: "❌ حدث خطأ.", ephemeral: true });
    } catch {}
  }
}

async function handleClose(interaction: ButtonInteraction): Promise<void> {
  try {
    const guildId = interaction.guildId!;
    const config = await getConfig(guildId);
    const adminRoleIds = config?.adminRoleIds ?? [];

    if (!(await checkAdminRole(interaction, adminRoleIds))) {
      await interaction.reply({
        content: "❌ ليس لديك صلاحية إغلاق التذاكر. هذا الإجراء مخصص للإدارة فقط.",
        ephemeral: true,
      });
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId("modal_close_ticket")
      .setTitle("إغلاق التذكرة");

    const reasonInput = new TextInputBuilder()
      .setCustomId("close_reason")
      .setLabel("سبب الإغلاق")
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder("اكتب سبب إغلاق التذكرة هنا...")
      .setRequired(true)
      .setMaxLength(500);

    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput));
    await interaction.showModal(modal);
  } catch (err) {
    logger.error({ err }, "Error showing close modal");
  }
}

async function handleAddMember(interaction: ButtonInteraction): Promise<void> {
  try {
    const guildId = interaction.guildId!;
    const config = await getConfig(guildId);
    const adminRoleIds = config?.adminRoleIds ?? [];

    if (!(await checkAdminRole(interaction, adminRoleIds))) {
      await interaction.reply({
        content: "❌ ليس لديك صلاحية إضافة أعضاء للتذاكر.",
        ephemeral: true,
      });
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId("modal_add_member")
      .setTitle("إضافة عضو للتذكرة");

    const userIdInput = new TextInputBuilder()
      .setCustomId("user_id")
      .setLabel("معرف المستخدم (User ID)")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("مثال: 123456789012345678")
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(userIdInput));
    await interaction.showModal(modal);
  } catch (err) {
    logger.error({ err }, "Error showing add member modal");
  }
}

async function handleDelete(interaction: ButtonInteraction): Promise<void> {
  try {
    const guildId = interaction.guildId!;
    const config = await getConfig(guildId);
    const adminRoleIds = config?.adminRoleIds ?? [];

    if (!(await checkAdminRole(interaction, adminRoleIds))) {
      await interaction.reply({
        content: "❌ ليس لديك صلاحية حذف التذاكر.",
        ephemeral: true,
      });
      return;
    }

    await interaction.reply({ content: "🗑️ جارٍ حذف التذكرة...", ephemeral: true });

    await deleteTicketRecord(interaction.channelId);

    const channel = interaction.channel as TextChannel;
    await channel.delete("حذف التذكرة بواسطة الإدارة");
  } catch (err) {
    logger.error({ err }, "Error deleting ticket");
    try {
      await interaction.reply({ content: "❌ حدث خطأ أثناء الحذف.", ephemeral: true });
    } catch {}
  }
}
