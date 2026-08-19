import { z } from "zod";
import { adminProcedure, publicProcedure, router } from "../_core/trpc";
import {
  addAdminSupportMessage,
  addCustomerSupportMessage,
  createSupportConversation,
  getAdminSupportConversation,
  getPublicSupportConversation,
  listAdminSupportConversations,
  markSupportConversationRead,
  upsertPushSubscription,
} from "../db.support";
import { getPublicPushKey, hashPushEndpoint, notifyNewSupportMessage } from "../supportPush";
import { isValidSupportMessage, normalizeSupportMessage, SUPPORT_MESSAGE_MAX_LENGTH } from "../supportUtils";

const messageSchema = z
  .string()
  .max(SUPPORT_MESSAGE_MAX_LENGTH, "A mensagem pode ter no máximo 2.000 caracteres.")
  .refine(isValidSupportMessage, "Escreva uma mensagem antes de enviar.");

const publicAccessSchema = z.object({
  conversationId: z.number().int().positive(),
  clientToken: z.string().min(32).max(200),
});

type RateWindow = { startedAt: number; count: number };
const publicMessageRate = new Map<string, RateWindow>();

function assertPublicRateLimit(ip: string) {
  const now = Date.now();
  const current = publicMessageRate.get(ip);
  if (!current || now - current.startedAt > 10 * 60 * 1000) {
    publicMessageRate.set(ip, { startedAt: now, count: 1 });
    return;
  }
  if (current.count >= 8) {
    throw new Error("Aguarde alguns minutos antes de enviar outra mensagem.");
  }
  current.count += 1;
}

export const supportRouter = router({
  publicPushKey: publicProcedure.query(() => ({ publicKey: getPublicPushKey() })),

  createConversation: publicProcedure
    .input(
      z.object({
        clientName: z.string().trim().min(2, "Informe seu nome.").max(120),
        clientEmail: z.string().email("Informe um e-mail válido.").max(320).optional().or(z.literal("")),
        body: messageSchema,
      }),
    )
    .mutation(async ({ input, ctx }) => {
      assertPublicRateLimit(ctx.req.ip || "unknown");
      const body = normalizeSupportMessage(input.body);
      const created = await createSupportConversation({ clientName: input.clientName, clientEmail: input.clientEmail || null, body });
      void notifyNewSupportMessage({ conversationId: created.conversationId, clientName: input.clientName.trim(), body });
      return created;
    }),

  getPublicConversation: publicProcedure.input(publicAccessSchema).query(async ({ input }) => {
    const conversation = await getPublicSupportConversation(input.conversationId, input.clientToken);
    if (!conversation) throw new Error("Conversa não encontrada.");
    return conversation;
  }),

  sendPublicMessage: publicProcedure
    .input(publicAccessSchema.extend({ body: messageSchema }))
    .mutation(async ({ input, ctx }) => {
      assertPublicRateLimit(ctx.req.ip || "unknown");
      const body = normalizeSupportMessage(input.body);
      const conversation = await addCustomerSupportMessage(input.conversationId, input.clientToken, body);
      if (!conversation) throw new Error("Conversa não encontrada.");
      void notifyNewSupportMessage({ conversationId: input.conversationId, clientName: conversation.clientName, body });
      return { ok: true };
    }),

  adminList: adminProcedure.query(() => listAdminSupportConversations()),

  adminGet: adminProcedure.input(z.object({ conversationId: z.number().int().positive() })).query(async ({ input }) => {
    const conversation = await getAdminSupportConversation(input.conversationId);
    if (!conversation) throw new Error("Conversa não encontrada.");
    return conversation;
  }),

  adminMarkRead: adminProcedure.input(z.object({ conversationId: z.number().int().positive() })).mutation(({ input }) => markSupportConversationRead(input.conversationId)),

  adminReply: adminProcedure
    .input(z.object({ conversationId: z.number().int().positive(), body: messageSchema }))
    .mutation(async ({ input }) => {
      await addAdminSupportMessage(input.conversationId, normalizeSupportMessage(input.body));
      return { ok: true };
    }),

  subscribePush: adminProcedure
    .input(
      z.object({
        endpoint: z.string().url().max(2_000),
        p256dh: z.string().min(20).max(1_000),
        auth: z.string().min(8).max(1_000),
        userAgent: z.string().max(1_000).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      await upsertPushSubscription({ ...input, endpointHash: hashPushEndpoint(input.endpoint) });
      return { ok: true };
    }),
});
