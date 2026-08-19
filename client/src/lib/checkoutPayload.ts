export type CheckoutPaymentMethod = "PIX" | "CREDIT_CARD";

export interface CheckoutFormValues {
  email: string;
  name: string;
  cpfCnpj: string;
  phoneNumber: string;
  address: string;
  addressNumber: string;
  postalCode: string;
  province: string;
  paymentMethod: CheckoutPaymentMethod;
}

/** Preserva a máscara na interface e envia somente os dígitos ao servidor. */
export function buildCheckoutPayload(values: CheckoutFormValues): CheckoutFormValues {
  return {
    ...values,
    cpfCnpj: values.cpfCnpj.replace(/\D/g, ""),
    phoneNumber: values.phoneNumber.replace(/\D/g, ""),
    postalCode: values.postalCode.replace(/\D/g, ""),
  };
}
