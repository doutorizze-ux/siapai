import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import { Server } from "http";
import { registerExtensionRoutes, EXTENSION_API_KEY } from "./extensionCompat";

vi.mock("./db.licenses", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./db.licenses")>();
  const fakeLicense = {
    id: 1,
    email: "12345678901@siapai.com.br",
    code: "TESTE-123",
    active: 1,
    expiresAt: new Date("2026-12-31T23:59:59Z"),
    createdAt: new Date(),
    updatedAt: new Date(),
    customerId: null,
    paymentId: null,
    startDate: new Date(),
  };
  return {
    ...mod,
    getLicenseByCode: vi.fn(async (code: string) => (code === "TESTE-123" ? fakeLicense : null)),
    getLicensesByEmail: vi.fn(async (email: string) =>
      email.startsWith("12345678901@") ? [fakeLicense] : [],
    ),
    isLicenseActive: vi.fn(() => true),
  };
});

vi.mock("./llm", () => ({
  generateLessonPlans: vi.fn(async () => [
    {
      title: "Aula 1",
      skills: "",
      objectives: "Objetivo",
      content: "Conteúdo gerado pela IA",
      methodology: "Metodologia gerada",
      assessment: "Avaliação gerada",
    },
  ]),
}));

let server: Server;
let baseUrl: string;

beforeEach(async () => {
  const app = express();
  app.use(express.json());
  registerExtensionRoutes(app);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const addr = server.address();
      baseUrl = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
      resolve();
    });
  });
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function post(path: string, body: unknown, key: string = EXTENSION_API_KEY) {
  const r = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Extension-Key": key },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json() };
}

describe("rotas de compatibilidade da extensão SiapAI", () => {
  it("rejeita requests sem a chave correta", async () => {
    const r = await post("/api/validar", { cpf: "12345678901" }, "chave-errada");
    expect(r.status).toBe(401);
  });

  it("/api/validar: CPF com licença ativa retorna plano admin", async () => {
    const r = await post("/api/validar", { cpf: "123.456.789-01" });
    expect(r.status).toBe(200);
    expect(r.body.ativo).toBe(true);
    expect(r.body.plano).toBe("admin");
    expect(r.body.data_expiracao).toBe("2026-12-31");
  });

  it("/api/validar: CPF sem licença retorna ativo=false", async () => {
    const r = await post("/api/validar", { cpf: "99999999999" });
    expect(r.status).toBe(200);
    expect(r.body.ativo).toBe(false);
  });

  it("/api/planejamento/sugerir: gera conteúdo com IA", async () => {
    const r = await post("/api/planejamento/sugerir", {
      cpf: "12345678901",
      componenteCurricular: "ARTE",
      serie: "7º Ano",
      numeroAula: "1",
      bimestre: "1",
    });
    expect(r.status).toBe(200);
    expect(r.body.encontrado).toBe(true);
    expect(r.body.conteudoTexto).toBe("Conteúdo gerado pela IA");
  });

  it("/api/log e /api/tentativa-fraude: aceitos e descartados", async () => {
    const r1 = await post("/api/log", { evento: "extensao_aberta" });
    expect(r1.body).toEqual({ ok: true });
    const r2 = await post("/api/tentativa-fraude", { cpf: "x" });
    expect(r2.body).toEqual({ ok: true });
  });
});
