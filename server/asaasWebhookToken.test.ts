import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { handleAsaasWebhook } from "./routers/commerce";

// Simula a rota POST /api/webhook/asaas com a mesma lógica de index.ts
function createApp() {
  const app = express();
  app.use(express.json());
  app.post("/api/webhook/asaas", (req, res) => {
    const expectedToken = process.env.ASAAS_WEBHOOK_TOKEN?.trim();
    if (expectedToken) {
      const received = req.headers["x-asaas-token"];
      const tokenValue = Array.isArray(received) ? received[0] : received;
      if (!tokenValue || tokenValue !== expectedToken) {
        res.status(401).json({ error: "webhook token invalid" });
        return;
      }
    }
    handleAsaasWebhook(req.body).then(() => {
      res.status(200).json({ received: true });
    }).catch((err) => {
      console.error("[Asaas webhook] erro:", err);
      res.status(500).json({ error: "webhook processing failed" });
    });
  });
  return app;
}

const TOKEN = "whsec_56oTFnXDhEXJPeqDg1UuwhKBR6lU4snCI2N0EIAR_m8";
const payload = {
  event: "PAYMENT_RECEIVED",
  payment: { id: "pay_teste_123", customer: "cus_teste" },
};

describe("webhook Asaas com token", () => {
  const origToken = process.env.ASAAS_WEBHOOK_TOKEN;

  beforeAll(() => {
    process.env.ASAAS_WEBHOOK_TOKEN = TOKEN;
  });

  afterAll(() => {
    if (origToken === undefined) delete process.env.ASAAS_WEBHOOK_TOKEN;
    else process.env.ASAAS_WEBHOOK_TOKEN = origToken;
  });

  it("rejeita webhook sem token (401)", async () => {
    const res = await request(createApp())
      .post("/api/webhook/asaas")
      .send(payload);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("webhook token invalid");
  });

  it("rejeita webhook com token errado (401)", async () => {
    const res = await request(createApp())
      .post("/api/webhook/asaas")
      .set("X-ASAAS-TOKEN", "token-errado")
      .send(payload);
    expect(res.status).toBe(401);
  });

  it("aceita webhook com o token correto (200)", async () => {
    const res = await request(createApp())
      .post("/api/webhook/asaas")
      .set("X-ASAAS-TOKEN", TOKEN)
      .send(payload);
    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);
  });
});
