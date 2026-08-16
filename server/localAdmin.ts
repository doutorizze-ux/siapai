// Login local do administrador — usado em deploys externos (ex.: Coolify)
// onde o OAuth Manus não está configurado. Quando ADMIN_EMAIL e
// ADMIN_PASSWORD (hash bcrypt) estão definidos, o admin faz login com
// e-mail + senha em /admin e recebe o mesmo cookie de sessão do template,
// então todo o fluxo (adminProcedure, ctx.user, role) continua igual.
import { SignJWT } from "jose";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { ENV } from "./env";

const ADMIN_OPEN_ID_PREFIX = "local_admin_";

function getLocalAdminConfig(): { email: string; password: string } | null {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD?.trim();
  if (!email || !password) return null;
  return { email, password };
}

export function isLocalAdminEnabled(): boolean {
  return getLocalAdminConfig() !== null;
}

export function getLocalAdminOpenId(email: string): string {
  return `${ADMIN_OPEN_ID_PREFIX}${email}`;
}

// Verifica a senha do admin (ADMIN_PASSWORD pode ser bcrypt ou texto plano
// no primeiro login — o hash resultante fica no ADMIN_PASSWORD_HASH env).
export async function verifyLocalAdminPassword(
  email: string,
  password: string
): Promise<boolean> {
  const config = getLocalAdminConfig();
  if (!config) return false;
  if (config.email !== email.toLowerCase()) return false;
  const stored = config.password;
  if (stored.startsWith("$2")) {
    try {
      const bcrypt = await import("bcryptjs");
      return await bcrypt.compare(password, stored);
    } catch {
      return false;
    }
  }
  return stored === password;
}

export async function createLocalAdminSessionToken(
  email: string,
  name: string
): Promise<string> {
  const secretKey = new TextEncoder().encode(ENV.cookieSecret);
  return new SignJWT({
    openId: getLocalAdminOpenId(email),
    appId: ENV.appId || "local",
    name,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime(Math.floor((Date.now() + ONE_YEAR_MS) / 1000))
    .sign(secretKey);
}

export function getLocalAdminCookieName(): string {
  return COOKIE_NAME;
}
