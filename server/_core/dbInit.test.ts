import { describe, expect, it } from "vitest";
import { TABLES_SQL } from "./dbInit";

describe("schema inicial do SiapAI", () => {
  it("cria a tabela users necessária para o login administrativo local", () => {
    expect(TABLES_SQL).toMatch(/CREATE TABLE IF NOT EXISTS users/i);
    expect(TABLES_SQL).toMatch(/openId VARCHAR\(64\) NOT NULL UNIQUE/i);
    expect(TABLES_SQL).toMatch(/role ENUM\('user', 'admin'\) NOT NULL DEFAULT 'user'/i);
  });

  it("preserva as tabelas de licenças e configurações do produto", () => {
    expect(TABLES_SQL).toMatch(/CREATE TABLE IF NOT EXISTS licenses/i);
    expect(TABLES_SQL).toMatch(/CREATE TABLE IF NOT EXISTS product_settings/i);
  });

  it("inclui conversas, mensagens e inscrições privadas de suporte", () => {
    expect(TABLES_SQL).toMatch(/CREATE TABLE IF NOT EXISTS support_conversations/i);
    expect(TABLES_SQL).toMatch(/CREATE TABLE IF NOT EXISTS support_messages/i);
    expect(TABLES_SQL).toMatch(/CREATE TABLE IF NOT EXISTS support_push_subscriptions/i);
    expect(TABLES_SQL).toMatch(/accessTokenHash CHAR\(64\) NOT NULL UNIQUE/i);
  });
});
