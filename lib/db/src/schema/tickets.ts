import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const ticketConfigTable = pgTable("ticket_config", {
  id: serial("id").primaryKey(),
  guildId: text("guild_id").notNull().unique(),
  logChannelId: text("log_channel_id"),
  adminRoleIds: text("admin_role_ids").array(),
  panelImage: text("panel_image"),
  panelDescription: text("panel_description"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const ticketsTable = pgTable("tickets", {
  id: serial("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  channelId: text("channel_id").notNull().unique(),
  userId: text("user_id").notNull(),
  username: text("username").notNull(),
  status: text("status").notNull().default("open"),
  claimedBy: text("claimed_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  closedAt: timestamp("closed_at"),
  closeReason: text("close_reason"),
});

export type TicketConfig = typeof ticketConfigTable.$inferSelect;
export type Ticket = typeof ticketsTable.$inferSelect;
