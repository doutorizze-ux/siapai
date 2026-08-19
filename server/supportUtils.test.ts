import { describe, expect, it } from "vitest";
import { createSupportAccessToken, hashSupportAccessToken, isValidSupportMessage, normalizeSupportMessage, SUPPORT_MESSAGE_MAX_LENGTH } from "./supportUtils";

describe("regras de mensagem do suporte", () => {
  it("remove espaços externos e normaliza quebras de linha", () => {
    expect(normalizeSupportMessage("  Olá\r\n\r\n\r\n\r\nTudo bem?  ")).toBe("Olá\n\n\nTudo bem?");
  });

  it("rejeita mensagens vazias e maiores que o limite", () => {
    expect(isValidSupportMessage("   ")).toBe(false);
    expect(isValidSupportMessage("a".repeat(SUPPORT_MESSAGE_MAX_LENGTH + 1))).toBe(false);
    expect(isValidSupportMessage("Preciso de ajuda com a licença.")).toBe(true);
  });

  it("gera token público imprevisível e armazena apenas seu hash", () => {
    const token = createSupportAccessToken();
    expect(token).toHaveLength(43);
    expect(hashSupportAccessToken(token)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashSupportAccessToken(token)).not.toContain(token);
  });
});
