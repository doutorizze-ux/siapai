/**
 * Seleção centralizada do modelo administrado pelo SiapAI.
 *
 * O valor vem exclusivamente do ambiente do servidor. A extensão nunca
 * recebe a chave nem escolhe o provedor; assim, uma migração de Gemini para
 * OpenAI não exige novo pacote da Chrome Web Store.
 */
export function getManagedLlmModel(fallback: string): string {
  const configured = String(process.env.LLM_MODEL || "").trim();
  if (!configured) return fallback;

  // Evita valores de ambiente acidentalmente malformados chegarem ao provedor.
  return /^[A-Za-z0-9._:/-]{1,128}$/.test(configured) ? configured : fallback;
}
