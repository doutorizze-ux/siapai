import { describe, expect, it } from "vitest";
import { PRODUCT_SETTINGS_TABLE, productSettingsSelectSql } from "./db.licenses";

describe("tabela de configurações do produto", () => {
  it("usa o identificador físico definido pelo schema SQL", () => {
    expect(PRODUCT_SETTINGS_TABLE).toBe("product_settings");
  });

  it("consulta a tabela física ao retornar o registro padrão recém-criado", () => {
    expect(productSettingsSelectSql()).toBe("SELECT * FROM product_settings LIMIT 1");
  });
});
