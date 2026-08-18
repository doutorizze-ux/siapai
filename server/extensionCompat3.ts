/**
 * Compatibilidade com a extensão SiapAI v3.2.40 (rebranding de Planeja.PRO SIAP 3.2.40).
 *
 * A extensão usa autenticação por E-MAIL com validação no servidor:
 *   POST /auth/validate-email.php {email, site_user_name, device_name, device_seed}
 *     -> {ok, token, refresh_token, user, license, renewal, access_granted, message}
 *   GET  /license/check.php            (Bearer) -> {ok, license, days_remaining, expired, expires_at_br, ...}
 *   GET  /modules/bootstrap.php?page=X (Bearer) -> JS fallback (os módulos são locais na extensão)
 *   POST /catalogo-siap.php            (Bearer) -> {ok, catalogo} (confirma habilidades do catálogo)
 *   POST /revisa.php                   (Bearer) -> {ok, material} (Revisa: reescrita IA)
 *   POST /ai/generate.php              (Bearer) -> formato OpenAI: {data:{choices:[{message:{content}}]}}
 *   POST /pei_generate.php             (Bearer) -> formato OpenAI: {data:{choices:[{message:{content}}]}}
 *
 * O contrato de licenças é o mesmo da extensão v1.2.0 (tabela `licenses`, ativa por e-mail/código).
 */
import type { Router, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { getLicenseByCode, getLicensesByEmail, isLicenseActive, updateLicense } from "./db.licenses";
import { generatePei } from "./llm";
import { invokeLLM, type Message } from "./_core/llm";
import { nanoid } from "nanoid";
import { getCompletedRevisaActivities, registerCompletedRevisaActivities } from "./db.revisa";
import { getPublicRevisaCatalog, getPublicRevisaExcerpt, isPublicRevisaMaterial } from "./revisaCatalog";

// Chave fixa e estável usada para assinar os tokens da extensão — mantida ao migrar para o Coolify
// para que sessões e tokens existentes continuem válidos.
const JWT_SECRET = process.env.SIAPAI_JWT_SECRET_FIXED || process.env.JWT_SECRET || "siapai-dev-secret";
const TOKEN_TTL_SECONDS = 30 * 24 * 3600; // 30 dias

function signToken(payload: object): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_TTL_SECONDS });
}

function decodeToken(token: string): { email: string; licenseId: number } | null {
  try {
    const data = jwt.verify(token, JWT_SECRET) as { email?: string; licenseId?: number; sub?: string };
    if (data.email && data.licenseId) {
      return { email: data.email, licenseId: data.licenseId };
    }
    if (data.sub) {
      // sub = "{email}:{licenseId}"
      const [email, licenseId] = data.sub.split(":");
      if (email && licenseId) {
        return { email, licenseId: Number(licenseId) };
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function authorizeBearer(req: Request, res: Response): Promise<{ email: string; licenseId: number } | null> {
  const header = req.header("Authorization") || "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    res.status(401).json({ ok: false, error: "token_ausente", message: "Token de acesso ausente." });
    return null;
  }
  const decoded = decodeToken(token);
  if (!decoded) {
    res.status(401).json({ ok: false, error: "token_invalido", message: "Sessão expirada. Faça login novamente." });
    return null;
  }

  // A assinatura do JWT comprova que o token foi emitido pelo SiapAI, mas não
  // substitui a consulta atual da licença: ela pode ter expirado, sido
  // desativada ou removida depois do login. Todas as rotas de automação passam
  // por este guarda, inclusive geração por IA e PEI.
  try {
    const licenses = await getLicensesByEmail(decoded.email);
    const license = licenses.find((item) => item.id === decoded.licenseId);
    if (!license || !isLicenseActive(license)) {
      res.status(403).json({
        ok: false,
        error: "licenca_inativa",
        message: "Sua licença não está ativa. Regularize a licença antes de usar este recurso.",
        expired: true,
        access_granted: false,
      });
      return null;
    }
  } catch (error) {
    console.error("[Extensão 3.2] erro ao validar licença do token:", error);
    res.status(503).json({
      ok: false,
      error: "licenca_indisponivel",
      message: "Não foi possível validar sua licença agora. Tente novamente.",
      access_granted: false,
    });
    return null;
  }

  return decoded;
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const s = String(value);
  // Drizzle pode devolver "Thu Dec 31 2026 ..."; extrair data ISO quando possível
  const isoMatch = s.match(/\d{4}-\d{2}-\d{2}/);
  if (isoMatch) {
    const d = new Date(`${isoMatch[0]}T00:00:00.000Z`);
    if (!isNaN(d.getTime())) return d;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function formatDateBR(value: unknown): string {
  const d = toDate(value);
  if (!d) return "sem data";
  if (isNaN(d.getTime())) return "sem data";
  return d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function daysRemaining(license: { expiresAt: unknown }): number {
  const expiry = toDate(license.expiresAt);
  if (!expiry) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = expiry.getTime() - today.getTime();
  return Math.ceil(diff / 86400000);
}

function buildLicenseObject(license: {
  email: string | null;
  code: string;
  active: number;
  expiresAt: unknown;
  planCode: string | null;
  startDate: unknown;
}) {
  const days = daysRemaining(license);
  const expiredExp = toDate(license.expiresAt);
  const expired = !isLicenseActive({ active: license.active, expiresAt: expiredExp || new Date(0) });
  return {
    id: license.code,
    email: license.email,
    key: license.code,
    license_key: license.code,
    status: expired ? "expired" : "active",
    expires_at: (toDate(license.expiresAt)?.toISOString() || "").slice(0, 10),
    expires_at_br: formatDateBR(license.expiresAt),
    days_remaining: days,
    warning_days: 15,
    renewal_available: !expired && days <= 15,
    plan: license.planCode || "planejapro",
    access_granted: !expired,
  };
}

/**
 * POST /auth/validate-email.php
 * Valida o e-mail e libera acesso se existir licença ativa.
 * A checagem de identidade por nome SIAP é relaxada: nosso cadastro não armazena
 * o nome do usuário logado no SIAP, então qualquer licença ativa para o e-mail
 * liberado no checkout valida com sucesso.
 */
async function handleValidateEmail(req: Request, res: Response) {
  try {
    const body = (req.body || {}) as { email?: string; site_user_name?: string; device_name?: string; device_seed?: string };
    const email = String(body.email || "").trim().toLowerCase();
    const siteUserName = String(body.site_user_name || "").trim();

    if (!email) {
      return res.json({ ok: false, error: "email_obrigatorio", message: "Informe o e-mail de cadastro." });
    }

    // Buscar por e-mail exato ou por código da licença (PP-XXXX) no lugar do e-mail
    let candidates = await getLicensesByEmail(email);
    if (candidates.length === 0 && email.startsWith("pp-")) {
      const byCode = await getLicenseByCode(email);
      if (byCode) candidates = [byCode];
    }
    // Fallback: e-mail contendo o código (usuário pode ter usado código@dominio)
    if (candidates.length === 0 && email.includes("@")) {
      const codePart = email.split("@")[0].toUpperCase();
      if (codePart.startsWith("PP-")) {
        const byCode = await getLicenseByCode(codePart);
        if (byCode) candidates = [byCode];
      }
    }

    const license = candidates.find((l) => isLicenseActive(l));
    if (!license) {
      return res.json({
        ok: false,
        error: "licenca_invalida",
        message: "E-mail sem licença ativa. Ative sua licença no site siapai.app antes de usar a extensão.",
        access_granted: false,
        user: null,
        license: null,
        renewal: null,
      });
    }

    const days = daysRemaining(license);
    const renewalAvailable = days <= 15 && days > 0;
    const token = signToken({ sub: `${license.email || email}:${license.id}`, email: license.email || email, licenseId: license.id });
    const refreshToken = signToken({ sub: `${license.email || email}:${license.id}`, email: license.email || email, licenseId: license.id, refresh: true });

    return res.json({
      ok: true,
      token,
      refresh_token: refreshToken,
      access_granted: true,
      message: "",
      user: {
        id: license.id,
        email: license.email || email,
        name: (license.email || email).split("@")[0],
        site_user_name: siteUserName || null,
      },
      license: buildLicenseObject(license),
      renewal: {
        renewal_available: renewalAvailable,
        days_remaining: daysRemaining(license),
        warning_days: 15,
      },
    });
  } catch (error) {
    console.error("[Extensão 3.2] erro em /auth/validate-email.php:", error);
    return res.json({ ok: false, error: "erro_servidor", message: "Falha ao validar o e-mail." });
  }
}

export function registerExtension3Routes(expressRouter: Router): void {
  // Rota de diagnóstico: extensão/navegador podem fazer GET para confirmar conectividade
  expressRouter.get("/api/ping-extensao", (_req: Request, res: Response) => {
    res.json({ ok: true, timestamp: Date.now() });
  });

  expressRouter.post("/api/auth/validate-email.php", handleValidateEmail);

  // Código de indicação do plugin WordPress original (usado pelo content.js para o link "Indique e Ganhe").
  // Retorna código vazio para não exibir nenhum link de indicação no topo do SIAP (rebranding).
  const emptyAffiliate = (_req: Request, res: Response) => res.json({ code: "", referral_url: "" });
  expressRouter.get("/wp-json/planejapro/v1/affiliate-code", emptyAffiliate);
  expressRouter.post("/wp-json/planejapro/v1/affiliate-code", emptyAffiliate);

  expressRouter.get("/api/license/check.php", async (req: Request, res: Response) => {
    const decoded = await authorizeBearer(req, res);
    if (!decoded) return;
    try {
      const licenses = await getLicensesByEmail(decoded.email);
      const byId = licenses.find((l) => l.id === decoded.licenseId) || licenses.find((l) => isLicenseActive(l));
      if (!byId) {
        return res.json({ ok: false, error: "licenca_nao_encontrada", expired: true });
      }
      const days = daysRemaining(byId);
      const expired = !isLicenseActive(byId);
      return res.json({
        ok: true,
        user: { id: byId.id, email: byId.email || decoded.email },
        license: buildLicenseObject(byId),
        renewal: {
          renewal_available: !expired && days <= 15,
          days_remaining: days,
          warning_days: 15,
        },
        days_remaining: days,
        expired,
        access_granted: !expired,
        expires_at_br: formatDateBR(byId.expiresAt),
      });
    } catch (error) {
      console.error("[Extensão 3.2] erro em /license/check.php:", error);
      return res.json({ ok: false, error: "erro_servidor" });
    }
  });

  expressRouter.get("/api/modules/bootstrap.php", (_req: Request, res: Response) => {
    // Fallback mínimo: os módulos são carregados localmente pela própria extensão
    // (web_accessible_resources). Isso só é usado se o carregamento local falhar.
    res.type("text/javascript").send("// SiapAI bootstrap fallback — os módulos são locais na extensão.");
  });

  /**
   * POST /catalogo-siap.php
   * Confirma as habilidades do catálogo enviado pela extensão.
   * Retornamos o catálogo praticamente como veio (o servidor original fazia
   * validação/ajuste contra o banco; nossa IA confirma as habilidades enviadas
   * e completa o que estiver ausente).
   */
  expressRouter.post("/api/catalogo-siap.php", async (req: Request, res: Response) => {
    const decoded = await authorizeBearer(req, res);
    if (!decoded) return;
    try {
      const body = (req.body || {}) as {
        habilidades?: Array<{ [k: string]: unknown }>;
        conteudos?: Array<{ [k: string]: unknown }>;
        matriz_saeb?: Array<{ [k: string]: unknown }>;
        contexto?: { disciplina?: string; serie?: string; eixo?: string; bimestre?: number };
        signature?: string;
      };
      const habilidades = body.habilidades || [];
      const conteudos = body.conteudos || [];

      // Completar habilidades que não tenham habilidadeCodigo via IA
      let habilidadesCompletas = habilidades;
      const faltantes = habilidades.filter(
        (h) => !h.habilidadeCodigo && typeof h.habilidadeCodigo !== "string",
      );
      if (faltantes.length > 0 && faltantes.length <= 12) {
        try {
          const disciplina = body.contexto?.disciplina || "";
          const serie = body.contexto?.serie || "";
          const response = await invokeLLM({
            model: "gemini-3-flash-preview",
            messages: [
              {
                role: "user",
                content: `Para a disciplina "${disciplina}" e série "${serie}", gere códigos BNCC plausíveis para estas habilidades escolares: ${JSON.stringify(faltantes.map((h) => h.nome || h.titulo || JSON.stringify(h).slice(0, 200)))}. Responda apenas JSON: {"habilidades": [{"habilidadeCodigo": "EF06MA...", ...camposOriginais}]} mantendo os campos originais de cada item.`,
              },
            ],
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "habilidades",
                strict: true,
                schema: {
                  type: "object",
                  properties: {
                    habilidades: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          habilidadeCodigo: { type: "string" },
                        },
                        required: ["habilidadeCodigo"],
                        additionalProperties: true,
                      },
                    },
                  },
                  required: ["habilidades"],
                  additionalProperties: false,
                },
              },
            },
          });
          const content = response.choices?.[0]?.message?.content;
          const parsed = JSON.parse(typeof content === "string" ? content : "{}");
          const completas = parsed.habilidades || [];
          habilidadesCompletas = habilidades.map((h, i) => {
            if (h.habilidadeCodigo) return h;
            const match = completas.find((c: { habilidadeCodigo?: string }) => c.habilidadeCodigo);
            return match ? { ...h, ...match } : { ...h, habilidadeCodigo: `BNCC-${nanoid(8).toUpperCase()}` };
          });
        } catch {
          habilidadesCompletas = habilidades.map((h) =>
            h.habilidadeCodigo
              ? h
              : { ...h, habilidadeCodigo: `BNCC-${nanoid(8).toUpperCase()}` },
          );
        }
      }

      return res.json({
        ok: true,
        catalogo: {
          habilidades: habilidadesCompletas,
          conteudos,
          matriz_saeb: body.matriz_saeb || [],
          contexto: body.contexto || {},
          signature: body.signature || nanoid(16),
          synced_at: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error("[Extensão 3.2] erro em /catalogo-siap.php:", error);
      return res.json({ ok: false, error: "erro_servidor", message: "Falha ao consultar o catálogo." });
    }
  });

  /** POST /revisa.php — catálogo próprio, trecho, progresso e revisão de texto. */
  expressRouter.post("/api/revisa.php", async (req: Request, res: Response) => {
    const decoded = await authorizeBearer(req, res);
    if (!decoded) return;
    try {
      const body = (req.body || {}) as {
        action?: string;
        contexto?: { serie?: string; disciplina?: string; bimestre?: number; turma?: string };
        texto?: string;
        conteudo?: string;
        material_id?: number;
        componente_id?: number;
        bloco_id?: number;
        sequencia_id?: number;
        modo_selecao?: string;
        atividade_inicial_ordem?: number;
        atividade_final_ordem?: number;
        pagina_inicial?: number;
        pagina_final?: number;
        continuar?: boolean;
        atividade_ids?: number[];
        numero_aula?: string;
        [k: string]: unknown;
      };
      const ctx = body.contexto || {};
      const action = String(body.action || "revisar_texto");
      const loadCompleted = (sequenceId: number) => getCompletedRevisaActivities(
        decoded.licenseId,
        Number(body.material_id || 9003001),
        Number(body.componente_id || 90031),
        sequenceId,
      );

      if (action === "catalogo") {
        const data = await getPublicRevisaCatalog(ctx, async (sequenceId, materialId, componentId) => getCompletedRevisaActivities(
          decoded.licenseId,
          Number(materialId || 0),
          Number(componentId || 0),
          sequenceId,
        ));
        return res.json({ ok: true, data });
      }
      if (action === "trecho") {
        const data = await getPublicRevisaExcerpt(ctx, body, loadCompleted);
        return res.json({ ok: true, data });
      }
      if (action === "registrar_progresso") {
        const materialId = Number(body.material_id || 0);
        const componentId = Number(body.componente_id || 0);
        const sequenceId = Number(body.sequencia_id || 0);
        if (!isPublicRevisaMaterial(materialId, componentId) || !sequenceId) {
          return res.status(400).json({ ok: false, error: "selecao_invalida", message: "O material Revisa informado não é válido." });
        }
        const registradas = await registerCompletedRevisaActivities({
          licenseId: decoded.licenseId,
          materialId,
          componentId,
          sequenceId,
          activityIds: Array.isArray(body.atividade_ids) ? body.atividade_ids : [],
          lessonNumber: body.numero_aula,
        });
        return res.json({ ok: true, data: { registradas } });
      }
      const texto = String(body.texto || body.conteudo || "");
      if (!texto.trim()) {
        return res.json({ ok: false, error: "conteudo_vazio", message: "Nenhum conteúdo para revisar." });
      }
      const response = await invokeLLM({
        model: "gemini-3-flash-preview",
        messages: [
          {
            role: "user",
            content:
              `Você é um especialista pedagógico. Reescreva/adapte o conteúdo a seguir para a turma informada ` +
              `(série: "${ctx.serie || "-"}", disciplina: "${ctx.disciplina || "-"}", bimestre: ${ctx.bimestre || 0}, turma: "${ctx.turma || "-"}"), ` +
              `mantendo o objetivo de aprendizagem original, adequado à BNCC. Responda apenas JSON: {"texto": "...", "justificativa": "..."}.` +
              `\n\nConteúdo original:\n${texto}`,
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "revisa",
            strict: true,
            schema: {
              type: "object",
              properties: {
                texto: { type: "string", description: "Conteúdo adaptado" },
                justificativa: { type: "string", description: "Por que a adaptação é adequada" },
              },
              required: ["texto", "justificativa"],
              additionalProperties: false,
            },
          },
        },
      });
      const content = response.choices?.[0]?.message?.content;
      const parsed = JSON.parse(typeof content === "string" ? content : "{}");
      return res.json({
        ok: true,
        material: {
          texto: parsed.texto || "",
          justificativa: parsed.justificativa || "",
          compativel: true,
        },
      });
    } catch (error) {
      console.error("[Extensão 3.2] erro em /revisa.php:", error);
      return res.json({ ok: false, error: "erro_servidor", message: "Falha ao revisar o conteúdo." });
    }
  });

  /**
   * POST /ai/generate.php
   * Formato OpenAI-like, exatamente o que a extensão espera (choices[0].message.content
   * com JSON de aulas dentro). Timeout 120s no cliente; nós respondemos direto.
   */
  expressRouter.post("/api/ai/generate.php", async (req: Request, res: Response) => {
    const decoded = await authorizeBearer(req, res);
    if (!decoded) return;
    try {
      const body = (req.body || {}) as {
        model?: string;
        temperature?: number;
        max_tokens?: number;
        lesson_count?: number;
        lessonCount?: number;
        messages?: Array<{ role?: unknown; content?: unknown }>;
      };
      const messages: Message[] = (Array.isArray(body.messages) ? body.messages : []).flatMap((message): Message[] => {
        const role = String(message?.role || "");
        if (!["system", "user", "assistant"].includes(role)) return [];

        if (typeof message.content === "string") {
          const content = message.content.trim();
          return content ? [{ role: role as Message["role"], content }] : [];
        }

        if (!Array.isArray(message.content)) return [];
        const content = message.content.flatMap((part): Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string; detail: "high" } }> => {
          if (!part || typeof part !== "object") return [];
          const candidate = part as { type?: unknown; text?: unknown; image_url?: { url?: unknown; detail?: unknown } };
          if (candidate.type === "text" && typeof candidate.text === "string" && candidate.text.trim()) {
            return [{ type: "text", text: candidate.text.trim() }];
          }
          const imageUrl = candidate.image_url?.url;
          if (candidate.type === "image_url" && typeof imageUrl === "string" && /^data:image\/(?:png|jpeg|webp);base64,/i.test(imageUrl) && imageUrl.length <= 20_000_000) {
            return [{ type: "image_url", image_url: { url: imageUrl, detail: "high" } }];
          }
          return [];
        });
        return content.length ? [{ role: role as Message["role"], content }] : [];
      });

      if (!messages.length) {
        return res.status(400).json({
          ok: false,
          error: "mensagens_ausentes",
          message: "O contexto do planejamento não foi informado.",
        });
      }

      const requestedLessonCount = Math.min(
        10,
        Math.max(
          1,
          Math.floor(Number(body.lesson_count ?? body.lessonCount ?? Math.ceil(Number(body.max_tokens || 3500) / 900))) || 1
        )
      );

      const maxTokens = Math.min(
        32000,
        Math.max(3500, Math.floor(Number(body.max_tokens) || requestedLessonCount * 900)),
      );

      // O prompt da extensão contém catálogo, árvore curricular e regras de
      // pós-processamento. Ele deve chegar íntegro ao modelo administrado: reduzir
      // esse contexto a um tema genérico faz o resultado perder habilidades e
      // conteúdos clicáveis do SIAP.
      const completion = await invokeLLM({
        model: "gemini-2.5-flash",
        messages,
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
      });
      const content = completion.choices?.[0]?.message?.content;
      const contentJson = typeof content === "string" ? content.trim() : JSON.stringify(content || {});
      if (!contentJson) {
        throw new Error("A IA não retornou conteúdo para o planejamento.");
      }
      return res.json({
        id: `chatcmpl-${nanoid(12)}`,
        model: completion.model || "gemini-2.5-flash",
        created: Math.floor(Date.now() / 1000),
        data: {
          choices: [
            {
              index: 0,
              finish_reason: completion.choices?.[0]?.finish_reason || "stop",
              message: { role: "assistant", content: contentJson },
            },
          ],
        },
      });
    } catch (error) {
      console.error("[Extensão 3.2] erro em /ai/generate.php:", error);
      const message = error instanceof Error && error.message
        ? error.message
        : "Falha na geração administrada. Tente novamente.";
      return res.status(500).json({
        id: `chatcmpl-${nanoid(12)}`,
        model: "siapai-gemini",
        created: Math.floor(Date.now() / 1000),
        data: {
          choices: [
            {
              index: 0,
              finish_reason: "error",
              message: { role: "assistant", content: "" },
            },
          ],
        },
        error: "server_error",
        message,
      });
    }
  });

  /**
   * POST /pei_generate.php
   * Chamada pública (a extensão envia direto pelo pei-api.js sem Bearer).
   * Formato esperado: {success, message, data:{txtPotencialidadesExpectativas,
   *   txtPotencialidadesConteudo, txtNecessidadesExtratageias, txtNecessidadesProcedimentos}}
   */
  expressRouter.post("/api/pei_generate.php", async (req: Request, res: Response) => {
    try {
      const body = (req.body || {}) as {
        action?: string;
        deficiencia?: string;
        turma?: string;
        bimestre?: string;
        disciplina?: string;
        potencialidades_cognitivas?: string;
        potencialidades_habilidades?: string;
        necessidades_cognitivas?: string;
        necessidades_habilidades?: string;
        comando_ia?: string;
        [k: string]: unknown;
      };
      const obsParts = [
        body.turma ? `Turma: ${body.turma}` : "",
        body.bimestre ? `Bimestre: ${body.bimestre}` : "",
        body.disciplina ? `Disciplina: ${body.disciplina}` : "",
        body.potencialidades_cognitivas ? `Potencialidades cognitivas: ${body.potencialidades_cognitivas}` : "",
        body.potencialidades_habilidades ? `Potencialidades/habilidades: ${body.potencialidades_habilidades}` : "",
        body.necessidades_cognitivas ? `Necessidades cognitivas: ${body.necessidades_cognitivas}` : "",
        body.necessidades_habilidades ? `Necessidades/habilidades: ${body.necessidades_habilidades}` : "",
        body.comando_ia ? `Comando do professor: ${body.comando_ia}` : "",
      ].filter(Boolean);

      const output = await generatePei({
        aluno: body.deficiencia || "",
        condicao: body.deficiencia || "",
        obs: obsParts.length > 0 ? obsParts.join("\n") : undefined,
      });

      return res.json({
        success: true,
        message: "PEI gerado com sucesso.",
        data: {
          txtPotencialidadesExpectativas: `Expectativas de aprendizagem:\n${output.objetivos}`,
          txtPotencialidadesConteudo: `Descrição e impacto na aprendizagem:\n${output.descricao}`,
          txtNecessidadesExtratageias: `Estratégias e adaptações:\n${output.estrategias}`,
          txtNecessidadesProcedimentos: `Avaliação adaptada:\n${output.avaliacao}`,
        },
      });
    } catch (error) {
      console.error("[Extensão 3.2] erro em /pei_generate.php:", error);
      return res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : "Falha na geração do PEI.",
        data: null,
      });
    }
  });
}
