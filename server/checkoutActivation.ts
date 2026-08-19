export type CheckoutActivationContext = {
  checkoutId: string;
  licenseId: number;
  email: string;
};

export type CheckoutActivationLicense = {
  id: number;
  email: string;
  paymentId: string | null;
  active: boolean | number;
};

/**
 * A tela de retorno só pode consultar a licença que foi criada para o
 * checkout armazenado antes do redirecionamento ao Asaas.
 */
export function matchesCheckoutActivationContext(
  license: CheckoutActivationLicense,
  context: CheckoutActivationContext,
): boolean {
  const isSameLicense = license.id === context.licenseId
    && license.email === context.email;

  if (!isSameLicense) {
    return false;
  }

  // Antes do pagamento, paymentId contém o identificador temporário do checkout.
  // Após o webhook confirmar o pagamento, esse campo passa a guardar o ID do pagamento
  // do Asaas. Nesse segundo estado, a licença só é aceita se já estiver ativa.
  return license.paymentId === context.checkoutId
    || license.active === true
    || license.active === 1;
}
