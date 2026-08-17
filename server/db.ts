import { InsertUser, User } from "../drizzle/schema";

// Conexão MySQL direta via mysql2 (pool com retry)
// O Drizzle falhava em conectar no Coolify; mysql2 direto funciona (mesmo driver do dbInit).
import mysql from "mysql2/promise";

let _pool: mysql.Pool | null = null;

function parseDbUrl(url: string): mysql.ConnectionOptions {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: parseInt(u.port || "3306", 10),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ""),
    multipleStatements: false,
    ssl: { rejectUnauthorized: false },
    connectTimeout: 10000,
  };
}

export function getDb(): mysql.Pool {
  if (!_pool) {
    _pool = mysql.createPool(parseDbUrl(process.env.DATABASE_URL!));
  }
  return _pool;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const pool = getDb();
  try {
    const now = new Date();
    const name = user.name ?? null;
    const email = user.email ?? null;
    const loginMethod = user.loginMethod ?? null;
    const lastSignedIn = user.lastSignedIn ?? now;
    const role = user.role ?? "user";

    await pool.query(
      `INSERT INTO users (openId, name, email, loginMethod, role, lastSignedIn, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
       ON DUPLICATE KEY UPDATE
         name = VALUES(name),
         email = VALUES(email),
         loginMethod = VALUES(loginMethod),
         role = VALUES(role),
         lastSignedIn = VALUES(lastSignedIn),
         updatedAt = NOW()`,
      [user.openId, name, email, loginMethod, role, lastSignedIn]
    );
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string): Promise<User | undefined> {
  const pool = getDb();
  try {
    const [rows] = await pool.query(
      `SELECT id, openId, name, email, loginMethod, role, createdAt, updatedAt, lastSignedIn
       FROM users WHERE openId = ? LIMIT 1`,
      [openId]
    );
    const arr = rows as unknown[];
    if (arr.length === 0) return undefined;
    const row = arr[0] as Record<string, unknown>;
    // Cast para o tipo User do schema
    return {
      id: row.id as number,
      openId: row.openId as string,
      name: (row.name as string) ?? null,
      email: (row.email as string) ?? null,
      loginMethod: (row.loginMethod as string) ?? null,
      role: (row.role as "admin" | "user") ?? "user",
      createdAt: row.createdAt as Date,
      updatedAt: row.updatedAt as Date,
      lastSignedIn: row.lastSignedIn as Date,
    } as User;
  } catch (error) {
    console.error("[Database] Failed to get user:", error);
    return undefined;
  }
}

// TODO: add feature queries here as your schema grows.
