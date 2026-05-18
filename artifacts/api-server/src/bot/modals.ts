import { ModalSubmitInteraction, TextChannel, GuildMember, PermissionFlagsBits } from "discord.js";
import {
  getConfig,
  getTicketByChannelId,
  updateTicket,
} from "./db";
import {
  collectTranscript,
  sendCloseLog,
  sendCloseDM,
} from "./tickets";
import { logger } from "../lib/logger";

function getMemberRoleIds(interaction: ModalSubmitInteraction): string[] {
  if (!interaction.member) return [];
  if (interaction.member instanceof GuildMember) {
    return [...interaction.member.roles.cache.keys()];
  }
  return Array.isArray(interaction.member.roles) ? interaction.member.roles : [];
}

async function checkAdminRole(
  interaction: ModalSubmitInteraction,
  adminRoleIds: string[],
): Promise<boolean> {
  if (adminRoleIds.length === 0) {
    const member = interaction.member;
    if (member instanceof GuildMember) {
      return member.permissions.has(PermissionFlagsBits.Administrator);
    }
    return false;
  }
  const memberRoles = getMemberRoleIds(interaction);
  return adminRoleIds.some((r) => memberRoles.includes(r));
}

export async function handleModal(interaction: ModalSubmitInteraction): Promise<void> {
  const { customId } = interaction;

  if (customId === "modal_close_ticket") {
    await handleCloseModal(interaction);
  } else if (customId === "modal_add_member") {
    await handleAddMemberModal(interaction);
  }
}

async function handleCloseModal(interaction: ModalSubmitInteraction): Promise<void> {
  try {
    const reason = interaction.fields.getTextInputValue("close_reason");

    await interaction.reply({ content: "🔒 جارٍ إغلاق التذكرة...", ephemeral: true });

    const guildId = interaction.guildId!;
    const config = await getConfig(guildId);
    const adminRoleIds = config?.adminRoleIds ?? [];

    if (!(await checkAdminRole(interaction, adminRoleIds))) {
      await interaction.editReply({ content: "❌ ليس لديك صلاحية إغلاق التذاكر." });
      return;
    }

    const ticket = await getTicketByChannelId(interaction.channelId);
    if (!ticket) {
      await interaction.editReply({ content: "❌ لم يتم العثور على هذه التذكرة." });
      return;
    }

    if (ticket.status === "closed") {
      await interaction.editReply({ content: "❌ هذه التذكرة مغلقة بالفعل." });
      return;
    }

    const channel = interaction.channel as TextChannel;
    const channelName = channel.name;

    const transcript = await collectTranscript(channel);

    await updateTicket(interaction.channelId, {
      status: "closed",
      closedAt: new Date(),
      closeReason: reason,
    });

    await sendCloseDM(
      interaction.client,
      ticket.userId,
      interaction.guild?.name ?? "السيرفر",
      reason,
      interaction.user.id,
      transcript,
      channelName,
      ticket.id,
    );

    if (config?.logChannelId) {
      try {
        const logChannel = interaction.guild?.channels.cache.get(config.logChannelId) as
          | TextChannel
          | undefined;
        if (logChannel) {
          await sendCloseLog(logChannel, ticket, reason, interaction.user.id, transcript, channelName);
        }
      } catch (err) {
        logger.warn({ err }, "Failed to send close log");
      }
    }

    await channel.delete("إغلاق التذكرة");
  } catch (err) {
    logger.error({ err }, "Error handling close modal");
    try {
      await interaction.editReply({ content: "❌ حدث خطأ أثناء إغلاق التذكرة." });
    } catch {}
  }
}

async function handleAddMemberModal(interaction: ModalSubmitInteraction): Promise<void> {
  try {
    const userId = interaction.fields.getTextInputValue("user_id").trim();

    await interaction.deferReply({ ephemeral: true });

    const channel = interaction.channel as TextChannel;

    try {
      const member = await interaction.guild?.members.fetch(userId);
      if (!member) {
        await interaction.editReply({ content: "❌ لم يتم العثور على المستخدم." });
        return;
      }

      await channel.permissionOverwrites.create(member, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
        AttachFiles: true,
      });

      await interaction.editReply({
        content: `✅ تمت إضافة <@${member.id}> للتذكرة.`,
      });

      await channel.send(`➕ تمت إضافة <@${member.id}> للتذكرة بواسطة <@${interaction.user.id}>`);
    } catch {
      await interaction.editReply({
        content: "❌ لم يتم العثور على المستخدم. تأكد من صحة الـ ID.",
      });
    }
  } catch (err) {
    logger.error({ err }, "Error handling add member modal");
    try {
      await interaction.editReply({ content: "❌ حدث خطأ." });
    } catch {}
  }
}
