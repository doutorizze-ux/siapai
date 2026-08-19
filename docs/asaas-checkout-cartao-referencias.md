# Referências de integração Asaas — Pix e cartão

Consultado em 18/08/2026 para a implementação do checkout do SiapAI.

## Decisão técnica recomendada

Utilizar o **Asaas Checkout hospedado**. Esse fluxo permite `PIX` e `CREDIT_CARD` no mesmo checkout e mantém a digitação dos dados de cartão na página do próprio Asaas, sem que o SiapAI receba ou armazene número, validade ou CVV.

Para o produto SiapAI, a cobrança é avulsa (`DETACHED`) e oferece `PIX` ou `CREDIT_CARD` no mesmo link seguro. O checkout expira em até 1.440 minutos e a liberação da licença continua ocorrendo exclusivamente pelo webhook de confirmação financeira, nunca pelo redirecionamento de sucesso.

## Fontes oficiais

1. [Asaas Checkout](https://docs.asaas.com/docs/checkout-asaas)
   - Aceita `billingTypes` com `PIX` e `CREDIT_CARD` no mesmo checkout.
   - Para venda avulsa, usa `chargeTypes: ["DETACHED"]`; para parcelamento, usa `INSTALLMENT` e `installment.maxInstallmentCount`.
   - `minutesToExpire` deve estar entre 10 e 1.440 minutos; o SiapAI utiliza a validade máxima de 24 horas.
   - `customerData` pode preencher nome, CPF/CNPJ e e-mail, reduzindo a digitação do comprador no checkout hospedado.
   - O link do checkout é retornado pela API e o pagador deve ser redirecionado para ele.
   - A confirmação de pagamento deve ser feita por webhook; callback não substitui webhook.

2. [Cobranças via cartão de crédito](https://docs.asaas.com/docs/cobrancas-via-cartao-de-credito)
   - A Fatura/checkout hospedado do Asaas permite que o pagador informe o cartão diretamente no Asaas.
   - O produto não deve ser liberado apenas na criação da cobrança; é necessário observar o status e os eventos de webhook.
   - Eventos relevantes incluem `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`, `PAYMENT_CREDIT_CARD_CAPTURE_REFUSED`, `PAYMENT_AWAITING_RISK_ANALYSIS` e `PAYMENT_REPROVED_BY_RISK_ANALYSIS`.

3. [Checkout para cartão de crédito](https://docs.asaas.com/docs/checkout-para-cart%C3%A3o-de-cr%C3%A9dito)
   - Para cartão parcelado, configurar `billingTypes: ["CREDIT_CARD"]`, `chargeTypes: ["INSTALLMENT"]` e `installment.maxInstallmentCount`.

## Correção identificada em 18/08/2026

- A referência oficial de criação exige que o checkout avulso enviado a `POST /v3/checkouts` inclua `callback.successUrl`, `callback.cancelUrl` e `callback.expiredUrl`, além de `billingTypes`, `chargeTypes`, `minutesToExpire` e `items`.
- O exemplo oficial confirma `billingTypes: ["PIX", "CREDIT_CARD"]` com `chargeTypes: ["DETACHED"]` para uma venda avulsa.
- O retorno usa o `link` hospedado pelo Asaas. A confirmação da licença permanece dependente do webhook, e não das URLs de retorno.
- Fonte: https://docs.asaas.com/docs/checkout-asaas

## Validação em produção — cadastro do pagador

Em 19/08/2026, a API de produção respondeu `400` ao criar o checkout enquanto o
`customerData` continha apenas nome, CPF e e-mail. A mensagem retornada pelo Asaas
exigiu explicitamente `phoneNumber`, `address`, `addressNumber`, `postalCode` e
`province`. O checkout do SiapAI passou a coletar esses dados cadastrais antes de
criar o link hospedado e a enviá-los dentro de `customerData`.

Os campos são utilizados somente para a criação da cobrança pelo Asaas. Dados de
cartão, como número, validade e CVV, continuam fora do SiapAI e são coletados na
página hospedada do Asaas.
