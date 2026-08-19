import { createHash, randomBytes } from "node:crypto";

export const SUPPORT_MESSAGE_MAX_LENGTH = 2_000;

export function normalizeSupportMessage(value: string): string {
  return value.replace(/\r\n/g, "\n").trim().replace(/\n{4,}/g, "\n\n\n");
}

export function createSupportAccessToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSupportAccessToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function isValidSupportMessage(value: string): boolean {
  const text = normalizeSupportMessage(value);
  return text.length > 0 && text.length <= SUPPORT_MESSAGE_MAX_LENGTH;
}
