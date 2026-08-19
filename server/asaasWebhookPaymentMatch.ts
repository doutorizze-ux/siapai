export type PendingLicensePaymentReference = {
  active: number | boolean;
  paymentId?: string | null;
};

/**
 * O Checkout do Asaas pode entregar `payment.checkoutSession` sem propagar
 * `externalReference` para o pagamento final. A licença pendente guarda o ID
 * dessa sessão antes do pagamento e precisa ser localizada por ele.
 */
export function findPendingLicenseForAsaasPayment<T extends PendingLicensePaymentReference>(
  licenses: T[],
  paymentId: string,
  checkoutSession?: string,
): T | undefined {
  return licenses.find((license) => {
    if (license.active === 1 || license.active === true) return false;
    return license.paymentId === paymentId
      || Boolean(checkoutSession) && license.paymentId === checkoutSession;
  });
}
