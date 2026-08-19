import { createHmac, timingSafeEqual } from "node:crypto";

const RETURN_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

type TokenOptions = {
  secret?: string;
  now?: number;
};

type CheckoutReturnClaims = {
  licenseId: number;
  expiresAt: number;
};

function getSecret(secret?: string) {
  const value = secret ?? process.env.SIAPAI_JWT_SECRET_FIXED ?? process.env.JWT_SECRET;
  if (!value) throw new Error("Segredo de retorno do checkout não configurado.");
  return value;
}

function sign(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createCheckoutReturnToken(licenseId: number, options: TokenOptions = {}) {
  const now = options.now ?? Date.now();
  const claims: CheckoutReturnClaims = {
    licenseId,
    expiresAt: now + RETURN_TOKEN_TTL_MS,
  };
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${payload}.${sign(payload, getSecret(options.secret))}`;
}

export function verifyCheckoutReturnToken(token: string, options: TokenOptions = {}): CheckoutReturnClaims | null {
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return null;

  const expected = sign(payload, getSecret(options.secret));
  const providedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length || !timingSafeEqual(providedBuffer, expectedBuffer)) return null;

  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as CheckoutReturnClaims;
    const now = options.now ?? Date.now();
    if (!Number.isInteger(claims.licenseId) || claims.licenseId <= 0 || !Number.isFinite(claims.expiresAt) || claims.expiresAt < now) {
      return null;
    }
    return claims;
  } catch {
    return null;
  }
}
