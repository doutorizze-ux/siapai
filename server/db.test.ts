import { describe, expect, it } from "vitest";
import { getUserUpsertRoleStrategy } from "./db";

describe("preservação de papel no upsert de usuário", () => {
  it("mantém o papel já gravado quando a atualização de sessão não informa role", () => {
    expect(getUserUpsertRoleStrategy(undefined)).toEqual({
      insertRole: "user",
      shouldReplaceExistingRole: 0,
    });
  });

  it("aplica um papel explicitamente informado no login administrativo", () => {
    expect(getUserUpsertRoleStrategy("admin")).toEqual({
      insertRole: "admin",
      shouldReplaceExistingRole: 1,
    });
  });
});
