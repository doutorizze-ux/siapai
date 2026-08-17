import { getDb } from "./db";
import { type InsertLicense, type License, type ProductSettings } from "../drizzle/schema";
import { nanoid } from "nanoid";

export async function createLicense(input: InsertLicense): Promise<License> {
  const pool = getDbOrThrow();
  const code = input.code && input.code.trim().length > 0 ? input.code : `PP-${nanoid(12).toUpperCase()}`;
  await pool.query(
    `INSERT INTO licenses (code, email, active, planCode, customerId, paymentId, startDate, expiresAt, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [code, input.email, input.active ?? 0, input.planCode, input.customerId ?? null, input.paymentId ?? null, input.startDate, input.expiresAt]
  );
  const [rows] = await pool.query(
    `SELECT * FROM licenses WHERE code = ? LIMIT 1`,
    [code]
  );
  const arr = rows as unknown[];
  if (arr.length === 0) throw new Error("Falha ao criar licença");
  return arr[0] as License;
}

export async function getLicenseByCode(code: string) {
  const pool = getDbOrThrow();
  const [rows] = await pool.query(
    `SELECT * FROM licenses WHERE code = ? LIMIT 1`,
    [code.trim().toUpperCase()]
  );
  const arr = rows as unknown[];
  return arr.length > 0 ? arr[0] as License : undefined;
}

export async function getLicensesByEmail(email: string) {
  const pool = getDbOrThrow();
  const normalized = email.trim().toLowerCase();
  const [rows] = await pool.query(
    `SELECT * FROM licenses WHERE LOWER(email) = ? ORDER BY createdAt DESC`,
    [normalized]
  );
  return rows as unknown[] as License[];
}

export async function getAllLicenses() {
  const pool = getDbOrThrow();
  const [rows] = await pool.query(
    `SELECT * FROM licenses ORDER BY createdAt DESC`
  );
  return rows as unknown[] as License[];
}

export async function updateLicense(id: number, patch: { active?: number; email?: string; expiresAt?: Date | string; customerId?: string | null; paymentId?: string | null; startDate?: Date | string | null }) {
  const pool = getDbOrThrow();
  const parts: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) {
      parts.push(`${key} = ?`);
      values.push(value);
    }
  }
  if (parts.length === 0) return;
  parts.push(`updatedAt = NOW()`);
  values.push(id);
  await pool.query(
    `UPDATE licenses SET ${parts.join(", ")} WHERE id = ?`,
    values
  );
}

export async function deleteLicense(id: number) {
  const pool = getDbOrThrow();
  await pool.query(`DELETE FROM licenses WHERE id = ?`, [id]);
}

export async function getProductSettings(): Promise<ProductSettings> {
  const pool = getDbOrThrow();
  const [rows] = await pool.query(
    `SELECT * FROM productSettings LIMIT 1`
  );
  const arr = rows as unknown[];
  if (arr.length === 0) {
    return await createDefaultSettings();
  }
  return arr[0] as ProductSettings;
}

export async function updateProductSettings(patch: Partial<ProductSettings>) {
  const pool = getDbOrThrow();
  const [rows] = await pool.query(
    `SELECT * FROM productSettings LIMIT 1`
  );
  const arr = rows as unknown[];
  const current = arr.length > 0 ? arr[0] as ProductSettings : undefined;
  if (!current) {
    await createDefaultSettings();
    return;
  }
  const parts: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) {
      parts.push(`${key} = ?`);
      values.push(value);
    }
  }
  if (parts.length === 0) return;
  values.push(current.id);
  await pool.query(
    `UPDATE productSettings SET ${parts.join(", ")} WHERE id = ?`,
    values
  );
}

async function createDefaultSettings(): Promise<ProductSettings> {
  const pool = getDbOrThrow();
  await pool.query(
    `INSERT INTO productSettings (name, priceCents, installmentCount, currency, description, expiryDate, asaasMode)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ["PlanejaPro SIAP", 5990, 6, "BRL", "Acesso ao PlanejaPro até 31/12 do ano. Pagamento único, sem mensalidade.", new Date("2026-12-31T00:00:00Z"), "sandbox"]
  );
  const [rows] = await pool.query(
    `SELECT * FROM productSettings LIMIT 1`
  );
  const arr = rows as unknown[];
  return arr[0] as ProductSettings;
}

export function isLicenseActive(l: Pick<License, "active" | "expiresAt">): boolean {
  if (l.active !== 1) return false;
  const expiry = new Date(l.expiresAt);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return expiry >= today;
}

export async function activateLicenseByPayment(email: string, paymentId: string, customerId?: string) {
  const rows = await getLicensesByEmail(email);
  const pending = rows.find((r) => r.paymentId === paymentId && r.active === 0);
  const settings = await getProductSettings();
  if (pending) {
    await updateLicense(pending.id, { active: 1, startDate: new Date().toISOString().slice(0, 10) });
    return { activated: true, licenseId: pending.id };
  }
  if (customerId) {
    const anyActive = rows.find((r) => r.customerId === customerId && isLicenseActive(r));
    if (anyActive) return { activated: false, alreadyActive: true };
  }
  const code = `PP-${nanoid(12).toUpperCase()}`;
  await dbInsertLicense({
    email: email.trim().toLowerCase(),
    code,
    active: 1,
    planCode: "planejapro",
    startDate: new Date(),
    expiresAt: new Date(String(settings.expiryDate) + "T00:00:00Z"),
    customerId: customerId ?? null,
    paymentId,
  } as never);
  return { activated: true, licenseId: null };
}

async function dbInsertLicense(input: InsertLicense) {
  const pool = getDbOrThrow();
  await pool.query(
    `INSERT INTO licenses (code, email, active, planCode, customerId, paymentId, startDate, expiresAt, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [input.code, input.email, input.active, input.planCode, input.customerId, input.paymentId, input.startDate, input.expiresAt]
  );
}

function getDbOrThrow() {
  return getDb();
}
