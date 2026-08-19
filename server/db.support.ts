import type { RowDataPacket } from "mysql2";
import { getDb } from "./db";
import { createSupportAccessToken, hashSupportAccessToken, normalizeSupportMessage } from "./supportUtils";

export type SupportSender = "customer" | "admin";
export type SupportStatus = "open" | "answered" | "closed";

export type SupportMessage = {
  id: number;
  sender: SupportSender;
  body: string;
  createdAt: Date;
};

export type SupportConversationSummary = {
  id: number;
  clientName: string;
  clientEmail: string | null;
  status: SupportStatus;
  adminReadAt: Date | null;
  lastMessageAt: Date;
  createdAt: Date;
  lastMessage: string | null;
  lastSender: SupportSender | null;
  unread: boolean;
};

export type SupportConversationDetail = SupportConversationSummary & {
  messages: SupportMessage[];
};

type ConversationRow = RowDataPacket & {
  id: number;
  clientName: string;
  clientEmail: string | null;
  status: SupportStatus;
  adminReadAt: Date | null;
  lastMessageAt: Date;
  createdAt: Date;
  lastMessage: string | null;
  lastSender: SupportSender | null;
};

type MessageRow = RowDataPacket & {
  id: number;
  sender: SupportSender;
  body: string;
  createdAt: Date;
};

function mapSummary(row: ConversationRow): SupportConversationSummary {
  return {
    id: Number(row.id),
    clientName: row.clientName,
    clientEmail: row.clientEmail,
    status: row.status,
    adminReadAt: row.adminReadAt,
    lastMessageAt: new Date(row.lastMessageAt),
    createdAt: new Date(row.createdAt),
    lastMessage: row.lastMessage,
    lastSender: row.lastSender,
    unread: !row.adminReadAt && row.lastSender === "customer",
  };
}

function mapMessage(row: MessageRow): SupportMessage {
  return { id: Number(row.id), sender: row.sender, body: row.body, createdAt: new Date(row.createdAt) };
}

const conversationColumns = `
  c.id, c.clientName, c.clientEmail, c.status, c.adminReadAt, c.lastMessageAt, c.createdAt,
  latest.body AS lastMessage, latest.sender AS lastSender
`;

const latestMessageJoin = `
  LEFT JOIN support_messages latest ON latest.id = (
    SELECT sm.id FROM support_messages sm
    WHERE sm.conversationId = c.id
    ORDER BY sm.createdAt DESC, sm.id DESC
    LIMIT 1
  )
`;

export async function createSupportConversation(input: { clientName: string; clientEmail?: string | null; body: string }) {
  const token = createSupportAccessToken();
  const tokenHash = hashSupportAccessToken(token);
  const pool = getDb();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [result] = await connection.execute(
      `INSERT INTO support_conversations (accessTokenHash, clientName, clientEmail, status, adminReadAt, lastMessageAt)
       VALUES (?, ?, ?, 'open', NULL, NOW())`,
      [tokenHash, input.clientName.trim(), input.clientEmail?.trim().toLowerCase() || null],
    );
    const conversationId = Number((result as { insertId: number }).insertId);
    await connection.execute(
      "INSERT INTO support_messages (conversationId, sender, body) VALUES (?, 'customer', ?)",
      [conversationId, normalizeSupportMessage(input.body)],
    );
    await connection.commit();
    return { conversationId, clientToken: token };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function findConversationByPublicAccess(conversationId: number, clientToken: string): Promise<ConversationRow | null> {
  const [rows] = await getDb().execute<ConversationRow[]>(
    `SELECT ${conversationColumns}
     FROM support_conversations c
     ${latestMessageJoin}
     WHERE c.id = ? AND c.accessTokenHash = ? LIMIT 1`,
    [conversationId, hashSupportAccessToken(clientToken)],
  );
  return rows[0] ?? null;
}

export async function getPublicSupportConversation(conversationId: number, clientToken: string): Promise<SupportConversationDetail | null> {
  const row = await findConversationByPublicAccess(conversationId, clientToken);
  if (!row) return null;
  const [messages] = await getDb().execute<MessageRow[]>(
    "SELECT id, sender, body, createdAt FROM support_messages WHERE conversationId = ? ORDER BY createdAt ASC, id ASC",
    [conversationId],
  );
  return { ...mapSummary(row), messages: messages.map(mapMessage) };
}

export async function addCustomerSupportMessage(conversationId: number, clientToken: string, body: string): Promise<{ clientName: string } | null> {
  const conversation = await findConversationByPublicAccess(conversationId, clientToken);
  if (!conversation) return null;
  const pool = getDb();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute(
      "INSERT INTO support_messages (conversationId, sender, body) VALUES (?, 'customer', ?)",
      [conversationId, normalizeSupportMessage(body)],
    );
    await connection.execute(
      "UPDATE support_conversations SET status = 'open', adminReadAt = NULL, lastMessageAt = NOW(), updatedAt = NOW() WHERE id = ?",
      [conversationId],
    );
    await connection.commit();
    return { clientName: conversation.clientName };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function listAdminSupportConversations(): Promise<SupportConversationSummary[]> {
  const [rows] = await getDb().query<ConversationRow[]>(
    `SELECT ${conversationColumns}
     FROM support_conversations c
     ${latestMessageJoin}
     ORDER BY (c.adminReadAt IS NULL AND latest.sender = 'customer') DESC, c.lastMessageAt DESC
     LIMIT 200`,
  );
  return rows.map(mapSummary);
}

export async function getAdminSupportConversation(conversationId: number): Promise<SupportConversationDetail | null> {
  const [rows] = await getDb().execute<ConversationRow[]>(
    `SELECT ${conversationColumns}
     FROM support_conversations c
     ${latestMessageJoin}
     WHERE c.id = ? LIMIT 1`,
    [conversationId],
  );
  const row = rows[0];
  if (!row) return null;
  const [messages] = await getDb().execute<MessageRow[]>(
    "SELECT id, sender, body, createdAt FROM support_messages WHERE conversationId = ? ORDER BY createdAt ASC, id ASC",
    [conversationId],
  );
  return { ...mapSummary(row), messages: messages.map(mapMessage) };
}

export async function markSupportConversationRead(conversationId: number): Promise<void> {
  await getDb().execute("UPDATE support_conversations SET adminReadAt = NOW(), updatedAt = NOW() WHERE id = ?", [conversationId]);
}

export async function addAdminSupportMessage(conversationId: number, body: string): Promise<void> {
  const pool = getDb();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute(
      "INSERT INTO support_messages (conversationId, sender, body) VALUES (?, 'admin', ?)",
      [conversationId, normalizeSupportMessage(body)],
    );
    await connection.execute(
      "UPDATE support_conversations SET status = 'answered', adminReadAt = NOW(), lastMessageAt = NOW(), updatedAt = NOW() WHERE id = ?",
      [conversationId],
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function upsertPushSubscription(input: { endpoint: string; endpointHash: string; p256dh: string; auth: string; userAgent?: string | null }): Promise<void> {
  await getDb().execute(
    `INSERT INTO support_push_subscriptions (endpointHash, endpoint, p256dh, auth, userAgent, lastSeenAt)
     VALUES (?, ?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE endpoint = VALUES(endpoint), p256dh = VALUES(p256dh), auth = VALUES(auth), userAgent = VALUES(userAgent), lastSeenAt = NOW()`,
    [input.endpointHash, input.endpoint, input.p256dh, input.auth, input.userAgent ?? null],
  );
}

export async function listPushSubscriptions() {
  const [rows] = await getDb().query<RowDataPacket[]>(
    "SELECT endpointHash, endpoint, p256dh, auth FROM support_push_subscriptions ORDER BY lastSeenAt DESC",
  );
  return rows.map((row) => ({ endpointHash: String(row.endpointHash), endpoint: String(row.endpoint), p256dh: String(row.p256dh), auth: String(row.auth) }));
}

export async function removePushSubscription(endpointHash: string): Promise<void> {
  await getDb().execute("DELETE FROM support_push_subscriptions WHERE endpointHash = ?", [endpointHash]);
}
