import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "./db";
import { licenses, productSettings, type InsertLicense, type License, type ProductSettings } from "../drizzle/schema";
import { nanoid } from "nanoid";

export async function createLicense(input: InsertLicense): Promise<License> {
  const db = await getDbOrThrow();
  const code = input.code && input.code.trim().length > 0 ? input.code : `PP-${nanoid(12).toUpperCase()}`;
  await db.insert(licenses).values({ ...input, code } as InsertLicense);
  const [row] = await db.select().from(licenses).where(eq(licenses.code, code)).limit(1);
  if (!row) throw new Error("Falha ao criar licença");
  return row;
}

export async function getLicenseByCode(code: string) {
  const db = await getDbOrThrow();
  const [row] = await db.select().from(licenses).where(eq(licenses.code, code.trim().toUpperCase())).limit(1);
  return row;
}

export async function getLicensesByEmail(email: string) {
  const db = await getDbOrThrow();
  const normalized = email.trim().toLowerCase();
  return db.select().from(licenses).where(eq(sql`LOWER(${licenses.email})`, normalized)).orderBy(desc(licenses.createdAt));
}

export async function getAllLicenses() {
  const db = await getDbOrThrow();
  return db.select().from(licenses).orderBy(desc(licenses.createdAt));
}

export async function updateLicense(id: number, patch: { active?: number; email?: string; expiresAt?: Date | string; customerId?: string | null; paymentId?: string | null; startDate?: Date | string | null }) {
  const db = await getDbOrThrow();
  await db.update(licenses).set(patch as never).where(eq(licenses.id, id));
}

export async function deleteLicense(id: number) {
  const db = await getDbOrThrow();
  await db.delete(licenses).where(eq(licenses.id, id));
}

export async function getProductSettings(): Promise<ProductSettings> {
  const db = await getDbOrThrow();
  const [row] = await db.select().from(productSettings).limit(1);
  if (!row) {
    const result = await createDefaultSettings();
    return result;
  }
  return row;
}

export async function updateProductSettings(patch: Partial<ProductSettings>) {
  const db = await getDbOrThrow();
  const [current] = await db.select().from(productSettings).limit(1);
  if (!current) {
    await db.insert(productSettings).values(patch as never);
  } else {
    await db.update(productSettings).set(patch as never).where(eq(productSettings.id, current.id));
  }
}

async function createDefaultSettings(): Promise<ProductSettings> {
  const db = await getDbOrThrow();
  await db.insert(productSettings).values({
    name: "PlanejaPro SIAP",
    priceCents: 5990,
    installmentCount: 6,
    currency: "BRL",
    description: "Acesso ao PlanejaPro até 31/12 do ano. Pagamento único, sem mensalidade.",
    expiryDate: new Date("2026-12-31T00:00:00Z"),
    asaasMode: "sandbox",
  });
  const [row] = await db.select().from(productSettings).limit(1);
  return row!;
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
  const db = await getDbOrThrow();
  await db.insert(licenses).values(input as never);
}

async function getDbOrThrow() {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  return db;
}
