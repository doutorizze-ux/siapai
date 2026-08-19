import { describe, expect, it } from "vitest";
import { findPendingLicenseForAsaasPayment } from "./asaasWebhookPaymentMatch";

describe("findPendingLicenseForAsaasPayment", () => {
  const licenses = [
    { id: 1, active: 0, paymentId: "checkout_pendente" },
    { id: 2, active: 1, paymentId: "checkout_ja_ativa" },
  ];

  it("localiza a licença pendente pelo ID de pagamento direto", () => {
    expect(findPendingLicenseForAsaasPayment(licenses, "checkout_pendente")).toMatchObject({ id: 1 });
  });

  it("localiza a licença pendente pelo checkoutSession do pagamento confirmado", () => {
    expect(findPendingLicenseForAsaasPayment(licenses, "pay_confirmado", "checkout_pendente")).toMatchObject({ id: 1 });
  });

  it("não reativa uma licença já ativa nem aceita sessão divergente", () => {
    expect(findPendingLicenseForAsaasPayment(licenses, "pay_confirmado", "checkout_ja_ativa")).toBeUndefined();
    expect(findPendingLicenseForAsaasPayment(licenses, "pay_confirmado", "checkout_desconhecido")).toBeUndefined();
  });
});
