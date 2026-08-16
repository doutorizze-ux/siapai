import { describe, expect, it } from "vitest";
import {
  createLocalAdminSessionToken,
  getLocalAdminOpenId,
  isLocalAdminEnabled,
  verifyLocalAdminPassword,
} from "./_core/localAdmin";
import { jwtVerify } from "jose";
import { COOKIE_NAME } from "@shared/const";

const ENV_EMAIL = "admin@siapai.online";
const ENV_PASS = "SiapAIAdmin2026!";

describe("localAdmin", () => {
  it("habilita o login local apenas com envs configuradas", () => {
    // No sandbox sem envs, fica desabilitado; o comportamento chave é que
    // com envs setadas (produção no Coolify) ele retorna true.
    const enabled = isLocalAdminEnabled();
    if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
      expect(enabled).toBe(true);
    } else {
      expect(enabled).toBe(false);
    }
  });

  it("gera openId local com prefixo determinístico", () => {
    expect(getLocalAdminOpenId(ENV_EMAIL)).toBe(`local_admin_${ENV_EMAIL}`);
  });

  it("emite JWT de sessão compatível com o cookie do template", async () => {
    const token = await createLocalAdminSessionToken(ENV_EMAIL, "Administrador");
    const secretKey = new TextEncoder().encode(process.env.JWT_SECRET || "");
    const { payload } = await jwtVerify(token, secretKey, { algorithms: ["HS256"] });
    expect(payload.openId).toBe(`local_admin_${ENV_EMAIL}`);
    expect(payload.name).toBe("Administrador");
    expect((payload as Record<string, unknown>).exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it("verifica senha em texto plano quando ADMIN_PASSWORD não é bcrypt", async () => {
    const origEmail = process.env.ADMIN_EMAIL;
    const origPass = process.env.ADMIN_PASSWORD;
    process.env.ADMIN_EMAIL = ENV_EMAIL;
    process.env.ADMIN_PASSWORD = ENV_PASS;
    try {
      expect(await verifyLocalAdminPassword(ENV_EMAIL, ENV_PASS)).toBe(true);
      expect(await verifyLocalAdminPassword("outro@email.com", ENV_PASS)).toBe(false);
      expect(await verifyLocalAdminPassword(ENV_EMAIL, "senha-errada")).toBe(false);
    } finally {
      if (origEmail === undefined) delete process.env.ADMIN_EMAIL;
      else process.env.ADMIN_EMAIL = origEmail;
      if (origPass === undefined) delete process.env.ADMIN_PASSWORD;
      else process.env.ADMIN_PASSWORD = origPass;
    }
  });

  it("verifica senha bcrypt (ADMIN_PASSWORD_HASH em produção)", async () => {
    const bcrypt = await import("bcryptjs");
    const hash = await bcrypt.hash(ENV_PASS, 10);
    const origEmail = process.env.ADMIN_EMAIL;
    const origPass = process.env.ADMIN_PASSWORD;
    process.env.ADMIN_EMAIL = ENV_EMAIL;
    process.env.ADMIN_PASSWORD = hash;
    try {
      expect(await verifyLocalAdminPassword(ENV_EMAIL, ENV_PASS)).toBe(true);
      expect(await verifyLocalAdminPassword(ENV_EMAIL, "senha-errada")).toBe(false);
    } finally {
      if (origEmail === undefined) delete process.env.ADMIN_EMAIL;
      else process.env.ADMIN_EMAIL = origEmail;
      if (origPass === undefined) delete process.env.ADMIN_PASSWORD;
      else process.env.ADMIN_PASSWORD = origPass;
    }
  });

  it("cookie de sessão usa o nome padrão do template", () => {
    // O token local é gravado no mesmo cookie do OAuth — o adminProcedure
    // e o useAuth do frontend continuam funcionando sem mudanças.
    expect(COOKIE_NAME).toBe("app_session_id");
  });
});
