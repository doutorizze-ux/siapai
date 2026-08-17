import express from "express";
import { Server } from "http";
import jwt from "jsonwebtoken";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerExtension3Routes } from "./extensionCompat3";
import { generateLessonPlans } from "./llm";

vi.mock("./llm", () => ({
  generateLessonPlans: vi.fn(async () => [
    {
      title: "Arte urbana e espaço público",
      skills: "Analisar produções artísticas contemporâneas",
      objectives: "Reconhecer manifestações de arte urbana.",
      content: "Grafite, muralismo e intervenções urbanas.",
      methodology: "Roda de conversa e criação de esboço coletivo.",
      assessment: "Participação e justificativa das escolhas visuais.",
    },
  ]),
  generatePei: vi.fn(),
}));

vi.mock("./db.licenses", () => ({
  getLicenseByCode: vi.fn(),
  getLicensesByEmail: vi.fn(async (email: string) => [{
    id: 1,
    email,
    active: 1,
    expiresAt: new Date("2099-12-31T00:00:00Z"),
  }]),
  isLicenseActive: vi.fn(() => true),
  updateLicense: vi.fn(),
}));

vi.mock("./db.revisa", () => ({
  getCompletedRevisaActivities: vi.fn(async () => []),
  registerCompletedRevisaActivities: vi.fn(async () => 1),
}));

let server: Server;
let baseUrl: string;

beforeEach(async () => {
  vi.mocked(generateLessonPlans).mockClear();
  const app = express();
  app.use(express.json());
  registerExtension3Routes(app);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const address = server.address();
      baseUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
      resolve();
    });
  });
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("compatibilidade da geração da extensão SiapAI", () => {
  it("retorna aulas no contrato consumido pela extensão e respeita a quantidade solicitada", async () => {
    const token = jwt.sign({ email: "professora@siapai.com.br", licenseId: 1 }, process.env.SIAPAI_JWT_SECRET_FIXED || process.env.JWT_SECRET || "siapai-dev-secret");
    const response = await fetch(`${baseUrl}/api/ai/generate.php`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        lesson_count: 2,
        messages: [{ role: "user", content: "Planeje duas aulas de Arte para o 7º ano." }],
      }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    const content = body.data.choices[0].message.content;
    expect(JSON.parse(content)).toEqual({
      aulas: [
        {
          titulo: "Arte urbana e espaço público",
          habilidades: ["Analisar produções artísticas contemporâneas"],
          conteudos: [],
          conteudoPersonalizado: "Grafite, muralismo e intervenções urbanas.",
          metodologia: "Roda de conversa e criação de esboço coletivo.",
          avaliacao: "Participação e justificativa das escolhas visuais.",
        },
      ],
    });
    expect(generateLessonPlans).toHaveBeenCalledWith(expect.objectContaining({ lessonCount: 2 }));
  });

  it("entrega o catálogo público Revisa no contrato consumido pelo painel", async () => {
    const token = jwt.sign({ email: "professora@siapai.com.br", licenseId: 1 }, process.env.SIAPAI_JWT_SECRET_FIXED || process.env.JWT_SECRET || "siapai-dev-secret");
    const response = await fetch(`${baseUrl}/api/revisa.php`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        action: "catalogo",
        contexto: { serie: "9º Ano", disciplina: "LÍNGUA PORTUGUESA", bimestre: 3 },
      }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.data.disponivel).toBe(true);
    expect(body.data.materiais[0].blocos[0].titulo).toBe("Narrativa de Enigma");
  });
});
