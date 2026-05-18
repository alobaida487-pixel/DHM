import { db, ticketConfigTable, ticketsTable } from "@workspace/db";
import { eq, and, ne } from "drizzle-orm";

export type TicketConfig = typeof ticketConfigTable.$inferSelect;
export type Ticket = typeof ticketsTable.$inferSelect;

export async function getConfig(guildId: string): Promise<TicketConfig | null> {
  const [config] = await db
    .select()
    .from(ticketConfigTable)
    .where(eq(ticketConfigTable.guildId, guildId))
    .limit(1);
  return config ?? null;
}

export async function upsertConfig(
  guildId: string,
  data: Partial<Omit<TicketConfig, "id" | "guildId">>,
) {
  const existing = await getConfig(guildId);
  if (existing) {
    await db
      .update(ticketConfigTable)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(ticketConfigTable.guildId, guildId));
  } else {
    await db.insert(ticketConfigTable).values({ guildId, adminRoleIds: [], ...data });
  }
}

export async function addAdminRole(guildId: string, roleId: string) {
  const config = await getConfig(guildId);
  const current = config?.adminRoleIds ?? [];
  if (!current.includes(roleId)) {
    await upsertConfig(guildId, { adminRoleIds: [...current, roleId] });
  }
}

export async function removeAdminRole(guildId: string, roleId: string) {
  const config = await getConfig(guildId);
  const current = config?.adminRoleIds ?? [];
  await upsertConfig(guildId, { adminRoleIds: current.filter((r) => r !== roleId) });
}

export async function createTicketRecord(data: {
  guildId: string;
  channelId: string;
  userId: string;
  username: string;
}): Promise<Ticket> {
  const [ticket] = await db.insert(ticketsTable).values({ ...data, status: "open" }).returning();
  return ticket!;
}

export async function getTicketByChannelId(channelId: string): Promise<Ticket | null> {
  const [ticket] = await db
    .select()
    .from(ticketsTable)
    .where(eq(ticketsTable.channelId, channelId))
    .limit(1);
  return ticket ?? null;
}

export async function getOpenTicketByUser(guildId: string, userId: string): Promise<Ticket | null> {
  const [ticket] = await db
    .select()
    .from(ticketsTable)
    .where(
      and(
        eq(ticketsTable.guildId, guildId),
        eq(ticketsTable.userId, userId),
        ne(ticketsTable.status, "closed"),
      ),
    )
    .limit(1);
  return ticket ?? null;
}

export async function updateTicket(channelId: string, data: Partial<Omit<Ticket, "id" | "channelId">>) {
  await db.update(ticketsTable).set(data).where(eq(ticketsTable.channelId, channelId));
}

export async function deleteTicketRecord(channelId: string) {
  await db.delete(ticketsTable).where(eq(ticketsTable.channelId, channelId));
}
