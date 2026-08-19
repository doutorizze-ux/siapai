import { describe, expect, it } from "vitest";
import { createCheckoutReturnToken, verifyCheckoutReturnToken } from "./checkoutReturnToken";

describe("token assinado de retorno do checkout", () => {
  const secret = "segredo-de-teste";
  const now = 1_700_000_000_000;

  it("aceita o token íntegro dentro do prazo", () => {
    const token = createCheckoutReturnToken(42, { secret, now });
    expect(verifyCheckoutReturnToken(token, { secret, now: now + 1_000 })).toEqual({
      licenseId: 42,
      expiresAt: now + 86_400_000,
    });
  });

  it("rejeita token adulterado ou vencido", () => {
    const token = createCheckoutReturnToken(42, { secret, now });
    expect(verifyCheckoutReturnToken(`${token}x`, { secret, now })).toBeNull();
    expect(verifyCheckoutReturnToken(token, { secret, now: now + 86_400_001 })).toBeNull();
  });
});
