import { afterAll, beforeAll, describe, expect, it } from "vitest";

/* Teste de ponta a ponta do fluxo de checkout: carrega ASAAS_API_KEY de
   /opt/.manus/webdev.env (o vitest roda fora do dev server), injeta no
   process.env e chama commerce.createCheckout real. Valida que a cobrança
   Pix é criada no Asaas. */

let savedKey: string | undefined;
let savedUrl: string | undefined;

beforeAll(() => {
  try {
    const fs = require("fs") as typeof import("fs");
    const content = fs.readFileSync("/opt/.manus/webdev.env", "utf8");
    const key = content.match(/^ASAAS_API_KEY="?([^"\n]+)"?/m)?.[1];
    const url = content.match(/^ASAAS_API_URL="?([^"\n]+)"?/m)?.[1];
    savedKey = process.env.ASAAS_API_KEY;
    savedUrl = process.env.ASAAS_API_URL;
    if (key) process.env.ASAAS_API_KEY = key;
    if (url) process.env.ASAAS_API_URL = url;
  } catch {
    // segue com o env do processo
  }
});

afterAll(() => {
  if (savedKey !== undefined) process.env.ASAAS_API_KEY = savedKey;
  if (savedUrl !== undefined) process.env.ASAAS_API_URL = savedUrl;
});

describe("checkout Asaas real", () => {
  it("cria cobrança Pix válida no Asaas", async () => {
    // Garante settings válidos no banco (o banco de dev pode não ter expiryDate)
    const { productSettings } = await import("../drizzle/schema");
    const { eq } = await import("drizzle-orm");
    const { drizzle } = await import("drizzle-orm/mysql2");
    const mysql = await import("mysql2/promise");
    const pool = mysql.createPool(process.env.DATABASE_URL as string);
    const db = drizzle(pool);
    const [current] = await db.select().from(productSettings).limit(1);
    if (!current) {
      await db.insert(productSettings).values({
        expiryDate: new Date("2026-12-31T00:00:00Z"),
        asaasMode: "production",
      } as never);
    } else {
      await db.update(productSettings).set({ expiryDate: new Date("2026-12-31T00:00:00Z") } as never).where(eq(productSettings.id, current.id));
    }
    const [after] = await db.select().from(productSettings).limit(1);
    console.log("settings pós-update:", JSON.stringify({ id: after?.id, expiryDate: after?.expiryDate, name: after?.name }));
    await pool.end();
    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller({ user: null as never } as never);
    const result = await caller.commerce.createCheckout({
      email: "testes-asaas@siapai.com.br",
      name: "Teste SiapAI",
      cpfCnpj: "00076078140",
    });
    expect(result.paymentId).toMatch(/^pay_/);
    expect(result.value).toBeGreaterThan(0);
    expect(["PENDING", "RECEIVED", "CANCELLED"]).toContain(result.status);
    console.log("paymentId:", result.paymentId, "status:", result.status);
  }, 45000);
});
