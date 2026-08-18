export type SiapPaymentMethod = "PIX" | "CREDIT_CARD";

const ACTIVATION_EVENTS = new Set(["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED"]);
const REVOCATION_EVENTS = new Set(["PAYMENT_REPROVED_BY_RISK_ANALYSIS", "PAYMENT_REFUNDED"]);

/** Eventos que representam um pagamento aprovado pelo Asaas. */
export function shouldActivateLicenseForPaymentEvent(event?: string): boolean {
  return typeof event === "string" && ACTIVATION_EVENTS.has(event);
}

/** Eventos posteriores que anulam uma cobrança já aprovada. */
export function shouldDeactivateLicenseForPaymentEvent(event?: string): boolean {
  return typeof event === "string" && REVOCATION_EVENTS.has(event);
}

export function normalizeSiapPaymentMethod(billingType?: string): SiapPaymentMethod {
  return billingType === "CREDIT_CARD" ? "CREDIT_CARD" : "PIX";
}

