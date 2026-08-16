import { describe, expect, it } from "vitest";

/* Valida que a ASAAS_API_KEY configurada é aceita pela API do Asaas.
   Lê a chave de /opt/.manus/webdev.env quando não disponível no processo. */
async function getKey(): Promise<string | undefined> {
  if (process.env.ASAAS_API_KEY) return process.env.ASAAS_API_KEY;
  try {
    const fs = await import("fs");
    const content = fs.readFileSync("/opt/.manus/webdev.env", "utf8");
    const m = content.match(/^ASAAS_API_KEY="?([^"\n]+)"?/m);
    return m?.[1];
  } catch {
    return undefined;
  }
}

async function getUrl(): Promise<string> {
  if (process.env.ASAAS_API_URL) return process.env.ASAAS_API_URL;
  try {
    const fs = await import("fs");
    const content = fs.readFileSync("/opt/.manus/webdev.env", "utf8");
    const m = content.match(/^ASAAS_API_URL="?([^"\n]+)"?/m);
    return m?.[1] ?? "https://api-sandbox.asaas.com/v3";
  } catch {
    return "https://api-sandbox.asaas.com/v3";
  }
}

describe("ASAAS_API_KEY", () => {
  it("é válida: a API do Asaas aceita autenticação (200 ou 4xx de dado, nunca 401)", async () => {
    const key = await getKey();
    const baseUrl = await getUrl();
    expect(key, "ASAAS_API_KEY deve estar configurada").toBeTruthy();

    const res = await fetch(`${baseUrl}/customers?email=validacao-siapai%40siapai.com.br`, {
      headers: { access_token: key!, "Content-Type": "application/json" },
    });
    expect(res.status, "Não deve retornar 401 (chave inválida)").not.toBe(401);
    console.log(`Asaas API status: ${res.status} (baseUrl: ${baseUrl})`);
  }, 20000);
});
