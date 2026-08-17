import type { ProductSettings } from "../drizzle/schema";

const DEFAULT_PRODUCTION_URL = "https://api.asaas.com/v3";
const DEFAULT_SANDBOX_URL = "https://api-sandbox.asaas.com/v3";

function getBaseUrl(mode: ProductSettings["asaasMode"]): string {
  const envUrl = process.env.ASAAS_API_URL?.trim();
  if (envUrl) return envUrl.replace(/\/+$/, "");
  return mode === "production" ? DEFAULT_PRODUCTION_URL : DEFAULT_SANDBOX_URL;
}

function getToken(): string {
  // Remove espaços, BOM e newlines que o Coolify pode injetar no valor
  const token = (process.env.ASAAS_API_KEY ?? "").replace(/[\s\uFEFF]+/g, "");
  if (!token) throw new Error("ASAAS_API_KEY não configurada");
  return token;
}

export interface AsaasCustomer {
  id: string;
  name: string;
  email?: string;
  cpfCnpj?: string;
}

export interface AsaasPayment {
  id: string;
  status: string;
  value: number;
  pixQrCode?: string;
  pixExpirationDate?: string;
  customer?: string;
  billingType?: string;
  invoiceUrl?: string;
  externalReference?: string;
}

export interface AsaasPixQrCode {
  /** Código Pix no formato copia-e-cola (EMV). */
  payload: string;
  /** Imagem PNG do QR Code em Base64, entregue pelo próprio Asaas. */
  encodedImage?: string;
  expirationDate?: string;
}

async function asaasRequest(path: string, options: RequestInit = {}): Promise<unknown> {
  // Se ASAAS_API_URL for configurada (ex: api.asaas.com), usar essa URL diretamente.
  // Caso contrário, fallback para sandbox.
  const envUrl = getBaseUrl("sandbox");
  const useProdUrl = envUrl !== DEFAULT_SANDBOX_URL;
  const baseUrl = useProdUrl ? envUrl : DEFAULT_SANDBOX_URL;
  const res = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      access_token: getToken(),
      ...Object.fromEntries(
        Object.entries(options.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
      ),
    },
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  if (!res.ok) {
    const errors = (body as { errors?: { description?: string }[] })?.errors;
    const message = errors?.map((e) => e.description).filter(Boolean).join("; ") || text.slice(0, 200);
    const err = new Error(`Asaas API error (${res.status}): ${message}`) as Error & { status: number; body: unknown };
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

export async function asaasGetCustomerByEmail(email: string): Promise<AsaasCustomer | null> {
  try {
    const body = (await asaasRequest(`/customers?email=${encodeURIComponent(email)}`)) as {
      data?: AsaasCustomer[];
    };
    return body?.data?.[0] ?? null;
  } catch {
    return null;
  }
}

export async function asaasCreateCustomer(name: string, email: string, cpfCnpj?: string): Promise<AsaasCustomer> {
  const body = await asaasRequest("/customers", {
    method: "POST",
    body: JSON.stringify({ name, email, ...(cpfCnpj ? { cpfCnpj } : {}) }),
  });
  return body as AsaasCustomer;
}

export interface CreatePixPaymentInput {
  customer: { id?: string; name?: string; email?: string; cpfCnpj?: string };
  value: number;
  externalReference: string;
  description?: string;
  dueDate?: string; // YYYY-MM-DD
}

export async function asaasCreatePixPayment(input: CreatePixPaymentInput): Promise<AsaasPayment> {
  const body = await asaasRequest("/payments", {
    method: "POST",
    body: JSON.stringify({
      customer: input.customer,
      billingType: "PIX",
      value: input.value,
      dueDate: input.dueDate ?? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      externalReference: input.externalReference,
      description: input.description ?? "PlanejaPro SIAP - Acesso anual",
    }),
  });
  return body as AsaasPayment;
}

export async function asaasGetPayment(paymentId: string): Promise<AsaasPayment> {
  const body = await asaasRequest(`/payments/${paymentId}`);
  return body as AsaasPayment;
}

/**
 * O endpoint de criação da cobrança não entrega o payload Pix. Ele precisa ser
 * buscado separadamente no endpoint oficial /payments/{id}/pixQrCode.
 */
export async function asaasGetPixQrCode(paymentId: string): Promise<AsaasPixQrCode> {
  const body = (await asaasRequest(`/payments/${paymentId}/pixQrCode`)) as Partial<AsaasPixQrCode>;
  if (!body.payload || typeof body.payload !== "string") {
    throw new Error("O Asaas não retornou o código Pix da cobrança.");
  }
  return {
    payload: body.payload,
    encodedImage: body.encodedImage,
    expirationDate: body.expirationDate,
  };
}

export function formatCentsToBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
