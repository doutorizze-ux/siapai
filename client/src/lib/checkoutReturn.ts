export const CHECKOUT_RETURN_STORAGE_KEY = "siapai.checkout.return.v1";

export type CheckoutReturnContext = {
  checkoutId: string;
  licenseId: number;
  email: string;
};

function isCheckoutReturnContext(value: unknown): value is CheckoutReturnContext {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.checkoutId === "string"
    && candidate.checkoutId.length > 0
    && typeof candidate.licenseId === "number"
    && Number.isInteger(candidate.licenseId)
    && candidate.licenseId > 0
    && typeof candidate.email === "string"
    && candidate.email.includes("@");
}

export function storeCheckoutReturn(storage: Pick<Storage, "setItem">, context: CheckoutReturnContext) {
  storage.setItem(CHECKOUT_RETURN_STORAGE_KEY, JSON.stringify(context));
}

export function readCheckoutReturn(storage: Pick<Storage, "getItem">): CheckoutReturnContext | null {
  const rawValue = storage.getItem(CHECKOUT_RETURN_STORAGE_KEY);
  if (!rawValue) return null;

  try {
    const parsed = JSON.parse(rawValue) as unknown;
    return isCheckoutReturnContext(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function clearCheckoutReturn(storage: Pick<Storage, "removeItem">) {
  storage.removeItem(CHECKOUT_RETURN_STORAGE_KEY);
}
