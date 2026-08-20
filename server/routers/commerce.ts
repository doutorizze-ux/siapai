import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { generateLessonPlans, generatePei } from "../llm";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { asaasCreateHostedCheckout, asaasGetHostedCheckout, asaasGetPayment, formatCentsToBRL, getConfiguredAsaasMode } from "../asaas";
import {
  activateLicenseByPayment,
  createLicense,
  deleteLicense,
  getAllLicenses,
  getLicensesByEmail,
  getProductSettings,
  getLicenseByCode,
  isLicenseActive,
  updateLicense,
  updateProductSettings,
} from "../db.licenses";
import { createTutorial, deleteTutorial, getAllTutorials, getNextTutorialOrder, getPublishedTutorials, updateTutorial } from "../db.tutorials";
import { getSemesterExpiryDate, getSemesterExpiryLabel, SEMESTER_PLAN_DESCRIPTION } from "../licensePeriod";
import { normalizeSiapPaymentMethod, shouldActivateLicenseForPaymentEvent, shouldDeactivateLicenseForPaymentEvent } from "../paymentLifecycle";
import { matchesCheckoutActivationContext } from "../checkoutActivation";
import { findPendingLicenseForAsaasPayment } from "../asaasWebhookPaymentMatch";
import { createCheckoutReturnToken, verifyCheckoutReturnToken } from "../checkoutReturnToken";

const emailSchema = z.string().email("E-mail inválido").trim().toLowerCase();

export function getYouTubeVideoId(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl.trim());
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    let videoId = "";
    if (host === "youtu.be") videoId = url.pathname.split("/").filter(Boolean)[0] ?? "";
    if (host === "youtube.com" || host === "m.youtube.com") {
      if (url.pathname === "/watch") videoId = url.searchParams.get("v") ?? "";
      if (url.pathname.startsWith("/embed/") || url.pathname.startsWith("/shorts/") || url.pathname.startsWith("/live/")) videoId = url.pathname.split("/").filter(Boolean)[1] ?? "";
    }
    return /^[A-Za-z0-9_-]{6,32}$/.test(videoId) ? videoId : null;
  } catch {
    return null;
  }
}

const tutorialInputSchema = z.object({
  title: z.string().trim().min(3, "Informe um título com pelo menos 3 caracteres.").max(180),
  description: z.string().trim().max(1200).optional(),
  youtubeUrl: z.string().trim().url("Informe um link válido do YouTube.").max(512).refine((value) => !!getYouTubeVideoId(value), "Use um link de vídeo válido do YouTube."),
  displayOrder: z.number().int().min(0).max(9999).optional(),
  isPublished: z.number().int().min(0).max(1).optional(),
});
const phoneNumberSchema = z.string().trim()
  .refine((value) => {
    const digits = value.replace(/\D/g, "");
    return digits.length >= 10 && digits.length <= 11;
  }, "Informe um telefone válido com DDD.")
  .transform((value) => value.replace(/\D/g, ""));
const postalCodeSchema = z.string().trim()
  .refine((value) => value.replace(/\D/g, "").length === 8, "Informe um CEP válido.")
  .transform((value) => value.replace(/\D/g, ""));

type CheckoutPaymentMethod = "PIX" | "CREDIT_CARD";

/**
 * O Coolify atua como proxy reverso. Prioriza uma origem configurada e, na
 * ausência dela, recompõe a origem pública pelos cabeçalhos encaminhados.
 */
function getPublicSiteUrl(req: { headers: Record<string, string | string[] | undefined> }): string {
  const configuredUrl = process.env.PUBLIC_APP_URL?.trim();
  if (configuredUrl) return configuredUrl.replace(/\/+$/, "");

  const forwardedHost = req.headers["x-forwarded-host"];
  const forwardedProto = req.headers["x-forwarded-proto"];
  const host = (Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost)
    ?? (Array.isArray(req.headers.host) ? req.headers.host[0] : req.headers.host);
  const protocol = (Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto) ?? "https";

  return host ? `${protocol.split(",")[0]}://${host.split(",")[0]}` : "https://siapai.online";
}

function getCheckoutCallbacks(
  req: { headers: Record<string, string | string[] | undefined> },
  returnToken: string,
) {
  const siteUrl = getPublicSiteUrl(req);
  const token = encodeURIComponent(returnToken);
  return {
    successUrl: `${siteUrl}/checkout?payment=success&return=${token}`,
    cancelUrl: `${siteUrl}/checkout?payment=cancelled&return=${token}`,
    expiredUrl: `${siteUrl}/checkout?payment=expired&return=${token}`,
  };
}

async function getEffectiveProductSettings() {
  const settings = await getProductSettings();
  return {
    ...settings,
    description: SEMESTER_PLAN_DESCRIPTION,
    asaasMode: getConfiguredAsaasMode(),
  };
}

export const commerceRouter = router({
  /** Preço e configurações públicas do produto */
  productInfo: publicProcedure.query(() => getEffectiveProductSettings()),

  /** Tutoriais publicados na página inicial. */
  tutorials: publicProcedure.query(() => getPublishedTutorials()),

  /** Valida licença por e-mail + código (usado no site e pela extensão) */
  validateLicense: publicProcedure
    .input(z.object({ email: emailSchema, code: z.string().min(3) }))
    .query(async ({ input }) => {
      const rows = await getLicensesByEmail(input.email);
      const match = rows.find((r) => r.code.toUpperCase() === input.code.trim().toUpperCase());
      if (!match) {
        return { valid: false, reason: "Licença não encontrada. Verifique o e-mail e o código." };
      }
      const active = isLicenseActive(match);
      return {
        valid: active,
        license: {
          code: match.code,
          email: match.email,
          active: match.active === 1,
          startDate: match.startDate,
          expiresAt: match.expiresAt,
          planCode: match.planCode,
        },
        reason: active ? "Licença ativa" : "Licença expirada ou desativada",
      };
    }),

  /** Gera planos de aula com IA a partir das habilidades do SIAP ou tema/roteiro */
  generatePlans: protectedProcedure
    .input(
      z.object({
        skills: z.array(z.string()).max(100),
        subject: z.string().min(1).max(120),
        grade: z.string().min(1).max(120),
        lessonCount: z.number().int().min(1).max(30),
        customTopic: z.string().max(2000).optional(),
        customScript: z.string().max(10000).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        const lessons = await generateLessonPlans(input);
        return { lessons };
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: (error as Error).message || "Erro ao gerar os planos com IA.",
        });
      }
    }),

  /** Gera proposta de PEI com IA */
  generatePei: protectedProcedure
    .input(
      z.object({
        aluno: z.string().min(2).max(200),
        condicao: z.string().min(2).max(500),
        obs: z.string().max(2000).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        const pei = await generatePei(input);
        return { pei };
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: (error as Error).message || "Erro ao gerar o PEI.",
        });
      }
    }),

  /** Cria o checkout hospedado do Asaas com Pix e cartão e reserva a licença. */
  createCheckout: publicProcedure
    .input(
      z.object({
        email: emailSchema,
        name: z.string().min(3).max(120),
        cpfCnpj: z
          .string()
          .trim()
          .min(11, "CPF ou CNPJ é obrigatório para gerar a cobrança segura (o Asaas exige o documento)")
          .max(18),
        phoneNumber: phoneNumberSchema,
        address: z.string().trim().min(3, "Informe a rua ou avenida.").max(160),
        addressNumber: z.string().trim().min(1, "Informe o número do endereço.").max(20),
        postalCode: postalCodeSchema,
        province: z.string().trim().min(2, "Informe o bairro.").max(120),
        paymentMethod: z.enum(["PIX", "CREDIT_CARD"]),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const settings = await getProductSettings();
      if (!process.env.ASAAS_API_KEY) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Pagamento indisponível no momento (chave da API não configurada).",
        });
      }

      // Evitar checkout hospedado duplicado pendente para o mesmo e-mail.
      const existing = await getLicensesByEmail(input.email);
      const pendingLicenses = existing.filter((r) => r.active === 0 && r.paymentId && r.paymentId !== "__pending__");
      for (const pending of pendingLicenses) {
        try {
          const checkout = await asaasGetHostedCheckout(pending.paymentId!);
          const usesChosenMethod = checkout.billingTypes?.length === 1 && checkout.billingTypes[0] === input.paymentMethod;
          if (checkout.status === "ACTIVE" && checkout.link && usesChosenMethod) {
            return {
              checkoutId: checkout.id,
              checkoutUrl: checkout.link,
              licenseId: pending.id,
              alreadyExists: true,
            };
          }
        } catch {
          // continua criando novo
        }
      }

      // Criar licença pendente (não ativa até confirmação do webhook)
      const extRef = `pp-${Date.now()}`;
      const license = await createLicense({
        email: input.email,
        code: "",
        active: 0,
        planCode: "planejapro",
        expiresAt: getSemesterExpiryDate(),
        paymentId: "__pending__",
      });
      const returnToken = createCheckoutReturnToken(license.id);

      try {
        const checkout = await asaasCreateHostedCheckout({
          name: input.name,
          email: input.email,
          cpfCnpj: input.cpfCnpj,
          phoneNumber: input.phoneNumber,
          address: input.address,
          addressNumber: input.addressNumber,
          postalCode: input.postalCode,
          province: input.province,
          value: settings.priceCents / 100,
          externalReference: `${extRef}|${license.id}`,
          description: `${settings.name} - Plano semestral até ${getSemesterExpiryLabel()}`,
          paymentMethod: input.paymentMethod as CheckoutPaymentMethod,
          callback: getCheckoutCallbacks(ctx.req, returnToken),
        });
        await updateLicense(license.id, { paymentId: checkout.id });
        return {
          checkoutId: checkout.id,
          checkoutUrl: checkout.link,
          licenseId: license.id,
          alreadyExists: false,
        };
      } catch (error) {
        // Reverter licença pendente se o Asaas falhar
        await deleteLicense(license.id);
        const status = (error as { status?: number })?.status;
        const details = (error as Error)?.message ?? "Erro desconhecido";
        console.error(`[Asaas checkout] Falha ao criar checkout: status=${status ?? "indefinido"}; detalhe=${details}`);
        if (status === 401) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "A chave da API do Asaas é inválida. Peça ao administrador para configurar um token válido.",
          });
        }
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Não foi possível criar a cobrança. Tente novamente em instantes.",
        });
      }
    }),

  /** Consulta somente o estado da licença recém-criada para a tela de retorno do Asaas. */
  checkoutActivationStatus: publicProcedure
    .input(z.union([
      z.object({ returnToken: z.string().min(20) }),
      z.object({ checkoutId: z.string().min(1), licenseId: z.number().int().positive(), email: emailSchema }),
    ]))
    .query(async ({ input }) => {
      if ("returnToken" in input) {
        const claims = verifyCheckoutReturnToken(input.returnToken);
        if (!claims) return { found: false, active: false, expiresAt: null, email: null };
        const license = (await getAllLicenses()).find((item) => item.id === claims.licenseId);
        if (!license) return { found: false, active: false, expiresAt: null, email: null };
        return {
          found: true,
          active: isLicenseActive(license),
          expiresAt: license.expiresAt,
          email: license.email,
        };
      }

      const licenses = await getLicensesByEmail(input.email);
      const license = licenses.find((item) => matchesCheckoutActivationContext(item, input));
      if (!license) return { found: false, active: false, expiresAt: null, email: null };

      return {
        found: true,
        active: isLicenseActive(license),
        expiresAt: license.expiresAt,
        email: license.email,
      };
    }),

  /** Consulta o status de um pagamento no Asaas (polling manual) */
  checkPayment: publicProcedure
    .input(z.object({ paymentId: z.string().min(1) }))
    .query(async ({ input }) => {
      const payment = await asaasGetPayment(input.paymentId);
      return {
        status: payment.status,
        value: payment.value,
        paymentMethod: normalizeSiapPaymentMethod(payment.billingType),
        pixQrCode: payment.pixQrCode ?? "",
      };
    }),

  /** Área do usuário logado: licenças dele */
  myLicenses: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.user.email) return { licenses: [], email: null };
    const licenses = await getLicensesByEmail(ctx.user.email);
    return { licenses, email: ctx.user.email };
  }),
});

/**
 * Webhook do Asaas: Pix recebido ou cartão confirmado liberam a licença automaticamente.
 * Chamado por http://<host>/api/webhook/asaas (rota Express registrada em index.ts)
 */
export async function handleAsaasWebhook(body: unknown) {
  const data = body as {
    event?: string;
    payment?: { id?: string; customer?: string; externalReference?: string; checkoutSession?: string; status?: string };
  };
  const log = (msg: string) => console.log(`[Asaas webhook] ${msg}`);
  log(`evento=${data?.event} paymentId=${data?.payment?.id}`);

  // Asaas pode enviar o evento várias vezes (retry) — idempotente: só ativa se ainda pendente.
  if (shouldActivateLicenseForPaymentEvent(data.event) && data.payment?.id) {
    const paymentId = data.payment.id;
    const customerId = data.payment.customer;

    // 1. Tentativa principal: externalReference = "pp-ts|<licenseId>"
    const licenseIdMatch = (data.payment.externalReference ?? "").split("|")[1];
    if (licenseIdMatch && /^\d+$/.test(licenseIdMatch)) {
      const rows = await getAllLicenses();
      const license = rows.find((r) => String(r.id) === licenseIdMatch);
      if (license) {
        if (license.active === 1) {
          log(`licença ${licenseIdMatch} já ativa, ignorando (idempotente)`);
          return;
        }
        await updateLicense(license.id, {
          active: 1,
          startDate: new Date(),
          expiresAt: getSemesterExpiryDate(),
          paymentId,
          customerId: customerId ?? license.customerId,
        });
        log(`licença ${licenseIdMatch} (${license.email}) ativada por externalReference`);
        return;
      }
    }

    // 2. Fallback: localizar a licença pendente pelo paymentId ou checkoutSession.
    // O Checkout hospedado pode não propagar externalReference ao pagamento final.
    const all = await getAllLicenses();
    const pending = findPendingLicenseForAsaasPayment(all, paymentId, data.payment.checkoutSession);
    if (pending) {
      await updateLicense(pending.id, {
        active: 1,
        startDate: new Date(),
        expiresAt: getSemesterExpiryDate(),
        paymentId,
        customerId: customerId ?? pending.customerId,
      });
      log(`licença ${pending.id} (${pending.email}) ativada por ${pending.paymentId === paymentId ? "paymentId" : "checkoutSession"}`);
      return;
    }

    // 3. Último recurso: criar a licença (cobre licenças deletadas ou sem registro pendente)
    if (customerId) {
      const email = all.find((r) => r.customerId === customerId)?.email;
      if (email) {
        await activateLicenseByPayment(email, paymentId, customerId);
        log(`licença criada/ativada para ${email} via customerId fallback`);
        return;
      }
    }
    log(`nenhuma licença localizada para paymentId=${paymentId}`);
  }

  // Se o Asaas reprovar a análise de risco ou estornar a cobrança depois da
  // confirmação, revogar a licença vinculada ao pagamento para evitar acesso indevido.
  if (shouldDeactivateLicenseForPaymentEvent(data.event) && data.payment?.id) {
    const paymentId = data.payment.id;
    const licenseIdMatch = (data.payment.externalReference ?? "").split("|")[1];
    const all = await getAllLicenses();
    const license = licenseIdMatch && /^\d+$/.test(licenseIdMatch)
      ? all.find((row) => String(row.id) === licenseIdMatch)
      : all.find((row) => row.paymentId === paymentId);
    if (license?.active === 1) {
      await updateLicense(license.id, { active: 0, paymentId });
      log(`licença ${license.id} revogada por evento ${data.event}`);
    }
  }
}

export const adminRouter = router({
  listLicenses: adminProcedure.query(() => getAllLicenses()),

  createLicense: adminProcedure
    .input(
      z.object({
        email: emailSchema,
        code: z.string().trim().min(0).max(64).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const license = await createLicense({
        email: input.email,
        code: input.code ?? "",
        active: 1,
        planCode: "planejapro",
        startDate: new Date(),
        expiresAt: getSemesterExpiryDate(),
      });
      return { code: license.code };
    }),

  toggleLicense: adminProcedure
    .input(z.object({ id: z.number(), active: z.number() }))
    .mutation(async ({ input }) => {
      await updateLicense(input.id, { active: input.active });
      return { success: true };
    }),

  deleteLicense: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    await deleteLicense(input.id);
    return { success: true };
  }),

  getProductSettings: adminProcedure.query(() => getEffectiveProductSettings()),

  updateProductSettings: adminProcedure
    .input(
      z.object({
        name: z.string().min(1).max(255).optional(),
        priceCents: z.number().int().min(100).max(99999999).optional(),
        installmentCount: z.number().int().min(1).max(12).optional(),
        description: z.string().max(2000).optional(),
        expiryDate: z.string().optional(),
        asaasMode: z.enum(["sandbox", "production"]).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const { expiryDate, ...rest } = input;
      await updateProductSettings({
        ...rest,
        ...(expiryDate ? { expiryDate: new Date(expiryDate + "T00:00:00Z") } : {}),
      } as never);
      const settings = await getEffectiveProductSettings();
      return {
        success: true,
        priceDisplay: `${settings.currency === "BRL" ? "R$" : ""} ${formatCentsToBRL(settings.priceCents)}`,
      };
    }),

  listTutorials: adminProcedure.query(() => getAllTutorials()),

  createTutorial: adminProcedure.input(tutorialInputSchema).mutation(async ({ input }) => {
    const displayOrder = input.displayOrder ?? await getNextTutorialOrder();
    return createTutorial({
      ...input,
      description: input.description || null,
      youtubeVideoId: getYouTubeVideoId(input.youtubeUrl)!,
      displayOrder,
      isPublished: input.isPublished ?? 1,
    });
  }),

  updateTutorial: adminProcedure.input(tutorialInputSchema.partial().extend({ id: z.number().int().positive() })).mutation(async ({ input }) => {
    const { id, youtubeUrl, description, ...rest } = input;
    if (youtubeUrl && !getYouTubeVideoId(youtubeUrl)) throw new TRPCError({ code: "BAD_REQUEST", message: "Use um link de vídeo válido do YouTube." });
    await updateTutorial(id, {
      ...rest,
      ...(description !== undefined ? { description: description || null } : {}),
      ...(youtubeUrl ? { youtubeUrl, youtubeVideoId: getYouTubeVideoId(youtubeUrl)! } : {}),
    });
    return { success: true };
  }),

  deleteTutorial: adminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input }) => {
    await deleteTutorial(input.id);
    return { success: true };
  }),
});
