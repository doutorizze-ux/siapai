import { describe, expect, it } from "vitest";
import { formatBrazilianMobilePhone } from "./phoneFormat";

describe("formatBrazilianMobilePhone", () => {
  it("insere parênteses, espaço e hífen enquanto o celular é digitado", () => {
    expect(formatBrazilianMobilePhone("6")).toBe("(6");
    expect(formatBrazilianMobilePhone("62")).toBe("(62");
    expect(formatBrazilianMobilePhone("62995")).toBe("(62) 995");
    expect(formatBrazilianMobilePhone("62995347257")).toBe("(62) 99534-7257");
  });

  it("normaliza colagem com pontuação e limita o valor a onze dígitos", () => {
    expect(formatBrazilianMobilePhone("(62) 99534-7257")).toBe("(62) 99534-7257");
    expect(formatBrazilianMobilePhone("62995347257999")).toBe("(62) 99534-7257");
  });
});
