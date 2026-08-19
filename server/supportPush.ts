import { createHash } from "node:crypto";
import webpush from "web-push";
import { listPushSubscriptions, removePushSubscription } from "./db.support";

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY?.trim();
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY?.trim();
const VAPID_SUBJECT = process.env.VAPID_SUBJECT?.trim() || "mailto:suporte@siapai.online";

export function getPublicPushKey(): string | null {
  return VAPID_PUBLIC_KEY || null;
}

function canSendPush(): boolean {
  return Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
}

export function hashPushEndpoint(endpoint: string): string {
  return createHash("sha256").update(endpoint).digest("hex");
}

export async function notifyNewSupportMessage(input: { conversationId: number; clientName: string; body: string }) {
  if (!canSendPush()) {
    console.info("[support] notificação web não configurada; mensagem disponível na caixa de entrada.");
    return;
  }

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY!, VAPID_PRIVATE_KEY!);
  const preview = input.body.replace(/\s+/g, " ").trim().slice(0, 110);
  const payload = JSON.stringify({
    title: `Suporte · ${input.clientName}`,
    body: preview,
    url: "/admin#suporte",
    tag: `support-${input.conversationId}`,
  });
  const subscriptions = await listPushSubscriptions();
  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
          payload,
          { TTL: 60 * 60 },
        );
      } catch (error) {
        const statusCode = (error as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await removePushSubscription(subscription.endpointHash);
          return;
        }
        console.error("[support] falha ao enviar notificação web:", error);
      }
    }),
  );
}
