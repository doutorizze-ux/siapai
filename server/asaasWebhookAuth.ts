type HeaderValue = string | string[] | undefined;

function getFirstHeaderValue(value: HeaderValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * O Asaas envia o token do webhook em `asaas-access-token`. O suporte ao
 * cabeçalho histórico `x-asaas-token` permanece somente como compatibilidade
 * para eventos que possam ter sido configurados em versões anteriores.
 */
export function isAuthorizedAsaasWebhook(
  headers: Record<string, HeaderValue>,
  expectedToken: string | undefined,
): boolean {
  const expected = expectedToken?.trim();
  if (!expected) return true;

  const received = getFirstHeaderValue(headers["asaas-access-token"])
    ?? getFirstHeaderValue(headers["x-asaas-token"]);

  return received === expected;
}
