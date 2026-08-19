import { describe, expect, it } from "vitest";
import { matchesCheckoutActivationContext } from "./checkoutActivation";

const context = {
  checkoutId: "checkout_123",
  licenseId: 42,
  email: "professora@exemplo.com",
};

describe("matchesCheckoutActivationContext", () => {
  it("aceita somente a licença criada para o checkout e e-mail retornados", () => {
    expect(matchesCheckoutActivationContext({
      id: 42,
      email: "professora@exemplo.com",
      paymentId: "checkout_123",
    }, context)).toBe(true);
  });

  it.each([
    [{ id: 43, email: "professora@exemplo.com", paymentId: "checkout_123" }],
    [{ id: 42, email: "outra@exemplo.com", paymentId: "checkout_123" }],
    [{ id: 42, email: "professora@exemplo.com", paymentId: "checkout_outra" }],
    [{ id: 42, email: "professora@exemplo.com", paymentId: null }],
  ])("rejeita contexto divergente: %o", (license) => {
    expect(matchesCheckoutActivationContext(license, context)).toBe(false);
  });
});
