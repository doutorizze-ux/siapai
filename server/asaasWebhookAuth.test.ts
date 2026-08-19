import { describe, expect, it } from "vitest";
import { isAuthorizedAsaasWebhook } from "./asaasWebhookAuth";

describe("isAuthorizedAsaasWebhook", () => {
  const token = "token-seguro-de-webhook-asaas-com-mais-de-32-caracteres";

  it("aceita o cabeçalho oficial asaas-access-token", () => {
    expect(isAuthorizedAsaasWebhook({ "asaas-access-token": token }, token)).toBe(true);
  });

  it("mantém compatibilidade com o cabeçalho legado x-asaas-token", () => {
    expect(isAuthorizedAsaasWebhook({ "x-asaas-token": token }, token)).toBe(true);
  });

  it("rejeita token ausente ou divergente quando a proteção está configurada", () => {
    expect(isAuthorizedAsaasWebhook({}, token)).toBe(false);
    expect(isAuthorizedAsaasWebhook({ "asaas-access-token": "divergente" }, token)).toBe(false);
  });

  it("permite a chamada quando nenhuma variável de token foi configurada", () => {
    expect(isAuthorizedAsaasWebhook({}, undefined)).toBe(true);
  });
});
