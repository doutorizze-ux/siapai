import { describe, expect, it } from "vitest";
import {
  normalizeSiapPaymentMethod,
  shouldActivateLicenseForPaymentEvent,
  shouldDeactivateLicenseForPaymentEvent,
} from "./paymentLifecycle";

describe("ciclo de pagamento do SiapAI", () => {
  it("ativa somente pagamentos Pix ou cartão confirmados pelo Asaas", () => {
    expect(shouldActivateLicenseForPaymentEvent("PAYMENT_RECEIVED")).toBe(true);
    expect(shouldActivateLicenseForPaymentEvent("PAYMENT_CONFIRMED")).toBe(true);
    expect(shouldActivateLicenseForPaymentEvent("PAYMENT_CREATED")).toBe(false);
    expect(shouldActivateLicenseForPaymentEvent("PAYMENT_AWAITING_RISK_ANALYSIS")).toBe(false);
  });

  it("desativa uma licença quando o Asaas reprova o risco ou estorna o pagamento", () => {
    expect(shouldDeactivateLicenseForPaymentEvent("PAYMENT_REPROVED_BY_RISK_ANALYSIS")).toBe(true);
    expect(shouldDeactivateLicenseForPaymentEvent("PAYMENT_REFUNDED")).toBe(true);
    expect(shouldDeactivateLicenseForPaymentEvent("PAYMENT_CONFIRMED")).toBe(false);
  });

  it("normaliza o método retornado pelo Asaas", () => {
    expect(normalizeSiapPaymentMethod("CREDIT_CARD")).toBe("CREDIT_CARD");
    expect(normalizeSiapPaymentMethod("PIX")).toBe("PIX");
  });
});

