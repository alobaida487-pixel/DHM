import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

export interface TicketConfig {
  id: number;
  guildId: string;
  logChannelId: string | null;
  adminRoleIds: string[] | null;
  panelImage: string | null;
  panelDescription: string | null;
  updatedAt: Date;
}

export interface Ticket {
  id: number;
  guildId: string;
  channelId: string;
  userId: string;
  username: string;
  status: string;
  claimedBy: string | null;
  createdAt: Date;
  closedAt: Date | null;
  closeReason: string | null;
}

interface StoredConfig extends Omit<TicketConfig, "updatedAt"> {
  updatedAt: string;
}

interface StoredTicket extends Omit<Ticket, "createdAt" | "closedAt"> {
  createdAt: string;
  closedAt: string | null;
}

interface DataStore {
  configs: StoredConfig[];
  tickets: StoredTicket[];
  nextConfigId: number;
  nextTicketId: number;
}

const DATA_DIR = join(process.cwd(), "data");
const DATA_FILE = join(DATA_DIR, "tickets.json");

function ensureDir(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

function load(): DataStore {
  ensureDir();
  if (!existsSync(DATA_FILE)) {
    const initial: DataStore = { configs: [], tickets: [], nextConfigId: 1, nextTicketId: 1 };
    writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2));
    return initial;
  }
  return JSON.parse(readFileSync(DATA_FILE, "utf-8")) as DataStore;
}

function save(data: DataStore): void {
  ensureDir();
  writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function parseConfig(s: StoredConfig): TicketConfig {
  return { ...s, updatedAt: new Date(s.updatedAt) };
}

function parseTicket(s: StoredTicket): Ticket {
  return { ...s, createdAt: new Date(s.createdAt), closedAt: s.closedAt ? new Date(s.closedAt) : null };
}

export async function getConfig(guildId: string): Promise<TicketConfig | null> {
  const data = load();
  const c = data.configs.find((c) => c.guildId === guildId);
  return c ? parseConfig(c) : null;
}

export async function upsertConfig(
  guildId: string,
  update: Partial<Omit<TicketConfig, "id" | "guildId">>,
): Promise<void> {
  const data = load();
  const idx = data.configs.findIndex((c) => c.guildId === guildId);
  const now = new Date().toISOString();

  const sanitized = {
    ...update,
    updatedAt: update.updatedAt instanceof Date ? update.updatedAt.toISOString() : now,
  };

  if (idx >= 0) {
    data.configs[idx] = { ...data.configs[idx]!, ...sanitized, updatedAt: now };
  } else {
    data.configs.push({
      id: data.nextConfigId++,
      guildId,
      logChannelId: null,
      adminRoleIds: [],
      panelImage: null,
      panelDescription: null,
      ...sanitized,
      updatedAt: now,
    });
  }
  save(data);
}

export async function addAdminRole(guildId: string, roleId: string): Promise<void> {
  const config = await getConfig(guildId);
  const current = config?.adminRoleIds ?? [];
  if (!current.includes(roleId)) {
    await upsertConfig(guildId, { adminRoleIds: [...current, roleId] });
  }
}

export async function removeAdminRole(guildId: string, roleId: string): Promise<void> {
  const config = await getConfig(guildId);
  const current = config?.adminRoleIds ?? [];
  await upsertConfig(guildId, { adminRoleIds: current.filter((r) => r !== roleId) });
}

export async function createTicketRecord(input: {
  guildId: string;
  channelId: string;
  userId: string;
  username: string;
}): Promise<Ticket> {
  const data = load();
  const ticket: StoredTicket = {
    id: data.nextTicketId++,
    ...input,
    status: "open",
    claimedBy: null,
    createdAt: new Date().toISOString(),
    closedAt: null,
    closeReason: null,
  };
  data.tickets.push(ticket);
  save(data);
  return parseTicket(ticket);
}

export async function getTicketByChannelId(channelId: string): Promise<Ticket | null> {
  const data = load();
  const t = data.tickets.find((t) => t.channelId === channelId);
  return t ? parseTicket(t) : null;
}

export async function getOpenTicketByUser(guildId: string, userId: string): Promise<Ticket | null> {
  const data = load();
  const t = data.tickets.find(
    (t) => t.guildId === guildId && t.userId === userId && t.status !== "closed",
  );
  return t ? parseTicket(t) : null;
}

export async function updateTicket(
  channelId: string,
  update: Partial<Omit<Ticket, "id" | "channelId">>,
): Promise<void> {
  const data = load();
  const idx = data.tickets.findIndex((t) => t.channelId === channelId);
  if (idx >= 0) {
    const existing = data.tickets[idx]!;
    data.tickets[idx] = {
      ...existing,
      ...update,
      createdAt: existing.createdAt,
      closedAt:
        update.closedAt instanceof Date
          ? update.closedAt.toISOString()
          : update.closedAt === null
            ? null
            : existing.closedAt,
    };
    save(data);
  }
}

export async function deleteTicketRecord(channelId: string): Promise<void> {
  const data = load();
  data.tickets = data.tickets.filter((t) => t.channelId !== channelId);
  save(data);
}
