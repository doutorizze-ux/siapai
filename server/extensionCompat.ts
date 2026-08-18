/**
 * Compatibilidade para a extensão SiapAI (rebranded a partir de siap-facil-1.1.1).
 *
 * A extensão chama endpoints REST simples com header `X-Extension-Key`.
 * Este módulo recria o mesmo contrato do backend original (siapfacil.com.br),
 * mas apontando para as nossas licenças e a nossa geração de planos com IA.
 *
 * Contrato:
 *   POST /api/validar          { cpf }                       -> { ativo, plano, nome, data_expiracao, mensagem? }
 *   POST /api/planejamento/sugerir { cpf, componenteCurricular, composicaoEnsino, serie, numeroAula, bimestre, inventario? }
 *                                                       -> { encontrado, habilidadeCodigo, conteudoTexto, metodologia, avaliacao }
 *   POST /api/log              (telemetria; aceito e ignorado) -> { ok }
 */
import type { Router, Request, Response } from "express";
import { generateLessonPlans, type LessonPlanItem } from "./llm";
import { getLicenseByCode, getLicensesByEmail, isLicenseActive } from "./db.licenses";
import { nanoid } from "nanoid";
import { getSemesterExpiryDate } from "./licensePeriod";

export const EXTENSION_API_KEY =
  process.env.EXTENSION_API_KEY || "a8c9dfb7948947528b9ae946af499b7605c24e91595dc4c1f9608d41";

function checkKey(req: Request, res: Response): boolean {
  const key = req.header("X-Extension-Key");
  if (key !== EXTENSION_API_KEY) {
    res.status(401).json({ error: "chave_invalida" });
    return false;
  }
  return true;
}

/**
 * Identifica a licença do usuário pelo CPF enviado pela extensão.
 * A extensão original valida por CPF; mantemos esse campo, mas buscamos a
 * licença associada. Prioriza: licença cujo `email` termina com o CPF
 * (ex.: "12345678901@siapai.com.br" criado pelo checkout nosso), senão
 * o código usado é o próprio CPF, senão a última licença ativa do usuário.
 */
async function findLicenseByCpf(cpf: string) {
  if (!cpf) return null;
  const digits = cpf.replace(/\D/g, "");
  if (digits.length !== 11) return null;

  // 1. procurar por e-mail criado no formato {cpf}@dominio
  const candidates = [
    `${digits}@siapai.com.br`,
    `${digits}@planejapro.com.br`,
    `${digits.slice(0, 9)}@siapai.com.br`,
  ];
  for (const email of candidates) {
    const licenses = await getLicensesByEmail(email);
    const active = licenses.find((l) => isLicenseActive(l));
    if (active) return { license: active, email };
  }

  // 2. procurar por código = CPF
  const byCode = await getLicenseByCode(digits);
  if (byCode && isLicenseActive(byCode)) {
    return { license: byCode, email: byCode.email || null };
  }

  // 3. qualquer licença ativa com CPF no e-mail
  const licenses = await getLicensesByEmail(`${digits}@`);
  const active = licenses.find((l) => isLicenseActive(l));
  if (active) return { license: active, email: active.email || null };

  return null;
}

export function registerExtensionRoutes(expressRouter: Router): void {
  expressRouter.post("/api/validar", async (req: Request, res: Response) => {
    if (!checkKey(req, res)) return;
    try {
      const { cpf } = (req.body || {}) as { cpf?: string };
      const found = await findLicenseByCpf(String(cpf || ""));
      if (!found) {
        return res.json({
          ativo: false,
          plano: null,
          nome: null,
          mensagem: "CPF não encontrado ou sem licença ativa. Acesse o site para ativar sua licença.",
          data_expiracao: null,
        });
      }
      const { license } = found;
      return res.json({
        ativo: true,
        plano: "admin", // licenças nossas dão acesso completo
        nome: license.email?.split("@")[0] || "Usuário",
        data_expiracao: license.expiresAt ? new Date(license.expiresAt).toISOString().slice(0, 10) : getSemesterExpiryDate(),
      });
    } catch (error) {
      console.error("[Extensão] erro em /api/validar:", error);
      return res.status(503).json({ ativo: false, plano: null, nome: null, mensagem: "Servidor indisponível" });
    }
  });

  expressRouter.post("/api/planejamento/sugerir", async (req: Request, res: Response) => {
    if (!checkKey(req, res)) return;
    try {
      const body = (req.body || {}) as {
        cpf?: string;
        componenteCurricular?: string;
        composicaoEnsino?: string;
        serie?: string;
        numeroAula?: string | number;
        bimestre?: string;
        inventario?: string;
      };
      const subject = body.componenteCurricular || "";
      const grade = `${body.serie || ""} ${body.composicaoEnsino || ""}`.trim();
      const plans = await generateLessonPlans({
        skills: [],
        subject,
        grade,
        lessonCount: 1,
        customTopic: body.inventario || "",
      });
      const plan: LessonPlanItem = plans[0];
      if (!plan) {
        return res.json({ encontrado: false, erro: true, motivo: "geracao_falhou" });
      }
      return res.json({
        encontrado: true,
        habilidadeCodigo: `BNCC-${(body.numeroAula || "").toString() || nanoid(6)}`,
        conteudoTexto: plan.content || "",
        metodologia: plan.methodology || "",
        avaliacao: plan.assessment || "",
        titulo: plan.title || "",
      });
    } catch (error) {
      console.error("[Extensão] erro em /api/planejamento/sugerir:", error);
      return res.json({ encontrado: false, erro: true, motivo: "erro_servidor" });
    }
  });

  expressRouter.post("/api/log", (req: Request, res: Response) => {
    if (!checkKey(req, res)) return;
    // Telemetria aceita e descartada (sem persistência por enquanto).
    return res.json({ ok: true });
  });

  expressRouter.post("/api/tentativa-fraude", (req: Request, res: Response) => {
    if (!checkKey(req, res)) return;
    console.warn("[Extensão] tentativa-fraude reportada:", JSON.stringify(req.body || {}));
    return res.json({ ok: true });
  });
}
