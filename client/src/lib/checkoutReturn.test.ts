import { describe, expect, it } from "vitest";
import {
  CHECKOUT_RETURN_STORAGE_KEY,
  clearCheckoutReturn,
  readCheckoutReturn,
  storeCheckoutReturn,
} from "./checkoutReturn";

describe("checkout return context", () => {
  it("persists the exact pending license and e-mail before leaving for Asaas", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    };

    storeCheckoutReturn(storage, {
      checkoutId: "checkout_123",
      licenseId: 41,
      email: "professora@exemplo.com",
    });

    expect(readCheckoutReturn(storage)).toEqual({
      checkoutId: "checkout_123",
      licenseId: 41,
      email: "professora@exemplo.com",
    });

    clearCheckoutReturn(storage);
    expect(storage.getItem(CHECKOUT_RETURN_STORAGE_KEY)).toBeNull();
  });

  it("ignores corrupt or incomplete browser storage", () => {
    expect(readCheckoutReturn({ getItem: () => "not-json" })).toBeNull();
    expect(readCheckoutReturn({ getItem: () => JSON.stringify({ checkoutId: "x" }) })).toBeNull();
  });
});
