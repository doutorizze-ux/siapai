export type CheckoutActivationContext = {
  checkoutId: string;
  licenseId: number;
  email: string;
};

export type CheckoutActivationLicense = {
  id: number;
  email: string;
  paymentId: string | null;
};

/**
 * A tela de retorno só pode consultar a licença que foi criada para o
 * checkout armazenado antes do redirecionamento ao Asaas.
 */
export function matchesCheckoutActivationContext(
  license: CheckoutActivationLicense,
  context: CheckoutActivationContext,
): boolean {
  return license.id === context.licenseId
    && license.email === context.email
    && license.paymentId === context.checkoutId;
}
