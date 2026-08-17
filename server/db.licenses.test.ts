import { describe, expect, it } from "vitest";
import { PRODUCT_SETTINGS_TABLE } from "./db.licenses";

describe("tabela de configurações do produto", () => {
  it("usa o identificador físico definido pelo schema SQL", () => {
    expect(PRODUCT_SETTINGS_TABLE).toBe("product_settings");
  });
});
