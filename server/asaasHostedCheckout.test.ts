import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { asaasCreateHostedCheckout } from "./asaas";

const originalFetch = global.fetch;
const originalKey = process.env.ASAAS_API_KEY;
const originalUrl = process.env.ASAAS_API_URL;

describe("asaasCreateHostedCheckout", () => {
  beforeEach(() => {
    process.env.ASAAS_API_KEY = "teste_asaas_checkout";
    delete process.env.ASAAS_API_URL;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.ASAAS_API_KEY;
    else process.env.ASAAS_API_KEY = originalKey;
    if (originalUrl === undefined) delete process.env.ASAAS_API_URL;
    else process.env.ASAAS_API_URL = originalUrl;
  });

  it("cria checkout hospedado para o método escolhido, com callbacks e sem dados de cartão", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "checkout_123",
          link: "https://sandbox.asaas.com/checkoutSession/show/checkout_123",
          status: "ACTIVE",
          billingTypes: ["PIX", "CREDIT_CARD"],
          chargeTypes: ["DETACHED"],
          externalReference: "pp-1|77",
        }),
        { status: 200 },
      ),
    );
    global.fetch = fetchMock as typeof fetch;

    const checkout = await asaasCreateHostedCheckout({
      name: "Professora SiapAI",
      email: "professora@escola.com",
      cpfCnpj: "12345678901",
      value: 97,
      externalReference: "pp-1|77",
      description: "Plano semestral até 31/12/2026",
      paymentMethod: "CREDIT_CARD",
      callback: {
        successUrl: "https://siapai.online/checkout?payment=success",
        cancelUrl: "https://siapai.online/checkout?payment=cancelled",
        expiredUrl: "https://siapai.online/checkout?payment=expired",
      },
    });

    expect(checkout).toMatchObject({ id: "checkout_123", status: "ACTIVE" });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api-sandbox.asaas.com/v3/checkouts");
    const payload = JSON.parse(String(options.body));
    expect(payload).toMatchObject({
      billingTypes: ["CREDIT_CARD"],
      chargeTypes: ["DETACHED"],
      minutesToExpire: 1440,
      externalReference: "pp-1|77",
      callback: {
        successUrl: "https://siapai.online/checkout?payment=success",
        cancelUrl: "https://siapai.online/checkout?payment=cancelled",
        expiredUrl: "https://siapai.online/checkout?payment=expired",
      },
      customerData: {
        name: "Professora SiapAI",
        email: "professora@escola.com",
        cpfCnpj: "12345678901",
      },
    });
    expect(JSON.stringify(payload)).not.toMatch(/cvv|cardNumber|creditCardNumber|expiryMonth/i);
  });
});
