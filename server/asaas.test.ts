import { afterEach, describe, expect, it, vi } from "vitest";
import { asaasGetPixQrCode } from "./asaas";

const originalFetch = global.fetch;
const originalToken = process.env.ASAAS_API_KEY;

afterEach(() => {
  global.fetch = originalFetch;
  process.env.ASAAS_API_KEY = originalToken;
});

describe("asaasGetPixQrCode", () => {
  it("obtém o payload copia-e-cola e a imagem PNG no endpoint próprio do Pix", async () => {
    process.env.ASAAS_API_KEY = "token-de-teste";
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ payload: "000201010212BR.GOV.BCB.PIX", encodedImage: "aW1hZ2Vt" }), { status: 200 }),
    );

    await expect(asaasGetPixQrCode("pay_123")).resolves.toEqual({
      payload: "000201010212BR.GOV.BCB.PIX",
      encodedImage: "aW1hZ2Vt",
      expirationDate: undefined,
    });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/payments/pay_123/pixQrCode"),
      expect.objectContaining({
        headers: expect.objectContaining({ access_token: "token-de-teste" }),
      }),
    );
  });

  it("rejeita a resposta que não contém o payload Pix", async () => {
    process.env.ASAAS_API_KEY = "token-de-teste";
    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ encodedImage: "aW1hZ2Vt" }), { status: 200 }));

    await expect(asaasGetPixQrCode("pay_123")).rejects.toThrow("não retornou o código Pix");
  });
});
