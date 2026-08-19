import { describe, expect, it } from "vitest";
import { buildCheckoutPayload } from "./checkoutPayload";

describe("buildCheckoutPayload", () => {
  it("envia celular, CPF e CEP apenas com dígitos", () => {
    const payload = buildCheckoutPayload({
      email: "professor@exemplo.com",
      name: "Professor Exemplo",
      cpfCnpj: "000.760.781-40",
      phoneNumber: "(62) 99534-7257",
      address: "Rua M 15",
      addressNumber: "s/n",
      postalCode: "75389-425",
      province: "Residencial Monte Cristo",
      paymentMethod: "PIX",
    });

    expect(payload.phoneNumber).toBe("62995347257");
    expect(payload.cpfCnpj).toBe("00076078140");
    expect(payload.postalCode).toBe("75389425");
  });
});
