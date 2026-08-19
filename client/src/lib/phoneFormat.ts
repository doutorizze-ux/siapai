/**
 * Formata um telefone celular brasileiro durante a digitação.
 * O retorno é exclusivamente visual; o servidor normaliza os dígitos antes
 * de encaminhá-los ao Checkout hospedado pelo Asaas.
 */
export function formatBrazilianMobilePhone(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);

  if (!digits) return "";
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;

  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}
