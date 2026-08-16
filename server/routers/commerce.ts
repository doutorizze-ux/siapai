import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { generateLessonPlans, generatePei } from "../llm";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { asaasCreateCustomer, asaasCreatePixPayment, asaasGetCustomerByEmail, asaasGetPayment, formatCentsToBRL } from "../asaas";
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

const emailSchema = z.string().email("E-mail inválido").trim().toLowerCase();

export const commerceRouter = router({
  /** Preço e configurações públicas do produto */
  productInfo: publicProcedure.query(() => getProductSettings()),

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

  /** Cria cobrança Pix no Asaas e reserva a licença */
  createCheckout: publicProcedure
    .input(
      z.object({
        email: emailSchema,
        name: z.string().min(3).max(120),
        cpfCnpj: z.string().trim().min(11).max(18).optional(),
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

      // Evitar checkout duplicado pendente
      const existing = await getLicensesByEmail(input.email);
      const pending = existing.find((r) => r.active === 0);
      if (pending && pending.paymentId) {
        try {
          const payment = await asaasGetPayment(pending.paymentId);
          if (payment.status === "PENDING" || payment.status === "RECEIVED") {
            return {
              paymentId: payment.id,
              pixQrCode: payment.pixQrCode ?? "",
              value: payment.value,
              status: payment.status,
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
        expiresAt: new Date(String(settings.expiryDate) + "T00:00:00Z"),
        paymentId: "__pending__",
      });

      try {
        let customer = await asaasGetCustomerByEmail(input.email);
        if (!customer) {
          customer = await asaasCreateCustomer(input.name, input.email, input.cpfCnpj);
        }
        const payment = await asaasCreatePixPayment({
          customer: { id: customer.id },
          value: settings.priceCents / 100,
          externalReference: `${extRef}|${license.id}`,
          description: `${settings.name} - Acesso até 31/12`,
        });
        await updateLicense(license.id, { paymentId: payment.id, customerId: customer.id });
        return {
          paymentId: payment.id,
          pixQrCode: payment.pixQrCode ?? "",
          value: payment.value,
          status: payment.status,
          alreadyExists: false,
        };
      } catch (error) {
        // Reverter licença pendente se o Asaas falhar
        await deleteLicense(license.id);
        const status = (error as { status?: number })?.status;
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

  /** Consulta o status de um pagamento no Asaas (polling manual) */
  checkPayment: publicProcedure
    .input(z.object({ paymentId: z.string().min(1) }))
    .query(async ({ input }) => {
      const payment = await asaasGetPayment(input.paymentId);
      return {
        status: payment.status,
        value: payment.value,
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
 * Webhook do Asaas: PAYMENT_RECEIVED libera a licença automaticamente.
 * Chamado por http://<host>/api/webhook/asaas (rota Express registrada em index.ts)
 */
export async function handleAsaasWebhook(body: unknown) {
  const data = body as {
    event?: string;
    payment?: { id?: string; customer?: string; externalReference?: string; status?: string };
  };
  if (data.event === "PAYMENT_RECEIVED" && data.payment?.id) {
    const extRef = data.payment.externalReference ?? "";
    const emailFromLicense = extRef.split("|")[1] ? null : null;
    // externalReference = "pp-ts|licenseId" ou direto o id da licença
    const licenseIdMatch = extRef.split("|")[1];
    if (licenseIdMatch && /^\d+$/.test(licenseIdMatch)) {
      const rows = await getAllLicenses();
      const license = rows.find((r) => String(r.id) === licenseIdMatch);
      if (license && license.active === 0) {
        await updateLicense(license.id, {
          active: 1,
          startDate: new Date(),
          paymentId: data.payment.id,
          customerId: data.payment.customer ?? license.customerId,
        });
      }
    } else {
      // fallback: localizar pelo paymentId
      await activateLicenseByPayment(
        emailFromLicense ?? "unknown",
        data.payment.id,
        data.payment.customer,
      );
    }
  }
}

export const adminRouter = router({
  listLicenses: adminProcedure.query(() => getAllLicenses()),

  createLicense: adminProcedure
    .input(
      z.object({
        email: emailSchema,
        expiresAt: z.string(),
        code: z.string().trim().min(0).max(64).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const settings = await getProductSettings();
      const license = await createLicense({
        email: input.email,
        code: input.code ?? "",
        active: 1,
        planCode: "planejapro",
        startDate: new Date(),
        expiresAt: new Date(input.expiresAt + "T00:00:00Z"),
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

  getProductSettings: adminProcedure.query(() => getProductSettings()),

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
      const settings = await getProductSettings();
      return {
        success: true,
        priceDisplay: `${settings.currency === "BRL" ? "R$" : ""} ${formatCentsToBRL(settings.priceCents)}`,
      };
    }),
});
