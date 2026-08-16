import { afterAll, beforeAll, describe, expect, it } from "vitest";

/* E2E completo: cria cobrança real no Asaas (como o checkout faz) e simula o
   webhook PAYMENT_RECEIVED que a produção receberia. Valida que a licença
   pendente é ativada. O pagamento real criado fica PENDING e expira sozinho;
   a ativação é simulada com o mesmo ID. */

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

describe("ciclo compra → webhook (E2E)", () => {
  it("ativa a licença pendente via handleAsaasWebhook", async () => {
    // 1. criar cobrança real como o checkout faz
    const { updateProductSettings } = await import("./db.licenses");
    await updateProductSettings({ expiryDate: new Date("2026-12-31T00:00:00Z") } as never);
    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller({ user: null as never } as never);
    const checkout = await caller.commerce.createCheckout({
      email: "e2e-webhook@siapai.com.br",
      name: "Teste E2E",
      cpfCnpj: "00076078140",
    });
    expect(checkout.paymentId).toMatch(/^pay_/);

    // 2. simular o webhook do Asaas com o paymentId real
    const { handleAsaasWebhook } = await import("./routers/commerce");
    const { getLicensesByEmail } = await import("./db.licenses");
    await handleAsaasWebhook({
      event: "PAYMENT_RECEIVED",
      payment: { id: checkout.paymentId, customer: "cus_000194198814", externalReference: "pp-test|0", status: "RECEIVED" },
    });

    const rows = await getLicensesByEmail("e2e-webhook@siapai.com.br");
    const active = rows.find((r) => r.paymentId === checkout.paymentId);
    expect(active?.active).toBe(1);
    console.log("licença ativada:", active?.code);

    // 3. idempotência: reenviar o mesmo evento não quebra nada
    await handleAsaasWebhook({
      event: "PAYMENT_RECEIVED",
      payment: { id: checkout.paymentId, customer: "cus_000194198814", externalReference: "pp-test|0", status: "RECEIVED" },
    });
    const rows2 = await getLicensesByEmail("e2e-webhook@siapai.com.br");
    expect(rows2.filter((r) => r.paymentId === checkout.paymentId && r.active === 1).length).toBe(1);
  }, 60000);
});
