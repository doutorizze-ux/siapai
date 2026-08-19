import { useEffect, useRef, useState } from "react";
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, CheckCircle2, CreditCard, Loader2, QrCode, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { formatBrazilianMobilePhone } from "@/lib/phoneFormat";
import { buildCheckoutPayload } from "@/lib/checkoutPayload";
import { clearCheckoutReturn, readCheckoutReturn, storeCheckoutReturn, type CheckoutReturnContext } from "@/lib/checkoutReturn";

type Status = "form" | "loading";

export default function Checkout() {
  const { data: product } = trpc.commerce.productInfo.useQuery();
  const createCheckout = trpc.commerce.createCheckout.useMutation();

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [cpf, setCpf] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [address, setAddress] = useState("");
  const [addressNumber, setAddressNumber] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [province, setProvince] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"PIX" | "CREDIT_CARD">("PIX");
  const [status, setStatus] = useState<Status>("form");
  const returnSearch = new URLSearchParams(window.location.search);
  const paymentResult = returnSearch.get("payment");
  const returnToken = returnSearch.get("return");
  const [checkoutReturn, setCheckoutReturn] = useState<CheckoutReturnContext | null>(() => readCheckoutReturn(window.sessionStorage));
  const shouldCheckActivation = paymentResult === "success" && Boolean(returnToken || checkoutReturn);
  const activationStatus = trpc.commerce.checkoutActivationStatus.useQuery(
    returnToken
      ? { returnToken }
      : {
          checkoutId: checkoutReturn?.checkoutId ?? "retorno-pendente",
          licenseId: checkoutReturn?.licenseId ?? 1,
          email: checkoutReturn?.email ?? "retorno@siapai.local",
        },
    {
      enabled: shouldCheckActivation,
      refetchInterval: (query) => query.state.data?.active ? false : 3_000,
    },
  );

  useEffect(() => {
    if (paymentResult !== "cancelled" && paymentResult !== "expired") return;
    clearCheckoutReturn(window.sessionStorage);
    setCheckoutReturn(null);
  }, [paymentResult]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cpfDigits = cpf.replace(/\D/g, "");
    const phoneDigits = phoneNumber.replace(/\D/g, "");
    const postalCodeDigits = postalCode.replace(/\D/g, "");
    if (!email || !name || cpfDigits.length < 11 || phoneDigits.length !== 11 || !address.trim() || !addressNumber.trim() || postalCodeDigits.length !== 8 || !province.trim()) {
      toast.error("Informe um celular com DDD, nome, CPF e endereço completo para gerar a cobrança segura.");
      return;
    }
    setStatus("loading");
    try {
      const result = await createCheckout.mutateAsync(buildCheckoutPayload({
        email,
        name,
        cpfCnpj: cpf,
        phoneNumber,
        address,
        addressNumber,
        postalCode,
        province,
        paymentMethod,
      }));
      if (!result.checkoutUrl) throw new Error("O link de pagamento seguro não foi disponibilizado.");
      storeCheckoutReturn(window.sessionStorage, {
        checkoutId: result.checkoutId,
        licenseId: result.licenseId,
        email: email.trim().toLowerCase(),
      });
      toast.info(`Você será direcionado para o pagamento seguro via ${paymentMethod === "PIX" ? "Pix" : "cartão"}.`);
      window.location.assign(result.checkoutUrl);
    } catch (err) {
      setStatus("form");
      toast.error((err as Error).message);
    }
  };

  if (!product) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b bg-background/85 backdrop-blur">
        <div className="container flex h-14 items-center gap-3">
          <Link href="/">
            <Button variant="ghost" size="icon" className="shrink-0">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <a href="/" className="flex items-center gap-2 font-extrabold text-primary">
            <img src="https://files.manuscdn.com/user_upload_by_module/session_file/310519663876770025/prWiYtCFZbRhSEqO.webp" alt="" className="h-7 w-7 rounded-lg" />
            SiapAI
          </a>
        </div>
      </header>
      <main className="flex-1 container py-10 max-w-xl mx-auto w-full">
        {status === "form" && (
          <form onSubmit={handleSubmit} className="space-y-5 animate-in">
            <div>
              <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">Finalizar compra</h1>
              <p className="mt-2 text-muted-foreground text-sm">
                Preencha com o e-mail que você usará para acessar a extensão. A licença é liberada automaticamente
                somente após a confirmação do pagamento.
              </p>
            </div>
            {paymentResult === "success" && activationStatus.data?.active && (
              <div role="status" className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm text-foreground">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <p><strong>Pagamento confirmado e licença ativa.</strong> O acesso já está liberado para <strong>{activationStatus.data.email ?? checkoutReturn?.email}</strong>. Você pode entrar na extensão com este e-mail.</p>
                </div>
              </div>
            )}
            {paymentResult === "success" && !activationStatus.data?.active && (
              <div role="status" className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm text-foreground">
                <div className="flex items-start gap-2">
                  <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-primary" />
                  <p><strong>Pagamento concluído.</strong> Estamos confirmando a ativação da licença com o Asaas. Esta página atualiza automaticamente e mostrará o e-mail liberado assim que a confirmação chegar.</p>
                </div>
              </div>
            )}
            {paymentResult === "cancelled" && (
              <div role="status" className="rounded-xl border border-amber-500/35 bg-amber-500/10 p-4 text-sm text-foreground">
                O pagamento foi cancelado. Você pode escolher uma forma de pagamento e tentar novamente quando quiser.
              </div>
            )}
            {paymentResult === "expired" && (
              <div role="status" className="rounded-xl border border-amber-500/35 bg-amber-500/10 p-4 text-sm text-foreground">
                Este link de pagamento expirou. Preencha seus dados e gere um novo link seguro.
              </div>
            )}
            <div className="rounded-2xl border bg-card p-5 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">Nome completo</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Seu nome" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">E-mail</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="voce@exemplo.com" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cpf">CPF *</Label>
                <Input
                  id="cpf"
                  value={cpf}
                  onChange={(e) => setCpf(e.target.value)}
                  placeholder="000.000.000-00"
                  maxLength={14}
                  required
                />
                <p className="text-xs text-muted-foreground">Necessário para emitir a cobrança pelo Asaas.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">Celular com DDD *</Label>
                <Input
                  id="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel-national"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(formatBrazilianMobilePhone(e.target.value))}
                  placeholder="(62) 99534-7257"
                  maxLength={16}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="address">Rua / avenida *</Label>
                <Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Ex.: Avenida Central" maxLength={160} required />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="address-number">Número *</Label>
                  <Input id="address-number" value={addressNumber} onChange={(e) => setAddressNumber(e.target.value)} placeholder="Ex.: 123 ou s/n" maxLength={20} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="postal-code">CEP *</Label>
                  <Input id="postal-code" inputMode="numeric" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} placeholder="00000-000" maxLength={9} required />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="province">Bairro *</Label>
                <Input id="province" value={province} onChange={(e) => setProvince(e.target.value)} placeholder="Ex.: Setor Central" maxLength={120} required />
                <p className="text-xs text-muted-foreground">Esses dados são exigidos pelo Asaas para gerar a cobrança. O SiapAI não recebe dados do cartão.</p>
              </div>
            </div>
            <fieldset className="rounded-2xl border bg-card p-5 space-y-3">
              <legend className="px-1 text-sm font-semibold">Escolha a forma de pagamento</legend>
              <p className="text-xs text-muted-foreground">A opção selecionada será a única exibida no ambiente seguro do Asaas.</p>
              <RadioGroup value={paymentMethod} onValueChange={(value) => setPaymentMethod(value as "PIX" | "CREDIT_CARD")} className="grid gap-3 sm:grid-cols-2">
                <label htmlFor="payment-pix" className={`cursor-pointer rounded-xl border p-4 text-left transition-colors ${paymentMethod === "PIX" ? "border-primary bg-primary/5" : "border-border bg-background hover:border-primary/50"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <QrCode className="h-5 w-5 text-primary" />
                    <RadioGroupItem id="payment-pix" value="PIX" aria-label="Pagar por Pix" />
                  </div>
                  <span className="mt-2 block font-semibold">Pix</span>
                  <span className="mt-1 block text-xs text-muted-foreground">QR Code e código copia e cola.</span>
                </label>
                <label htmlFor="payment-card" className={`cursor-pointer rounded-xl border p-4 text-left transition-colors ${paymentMethod === "CREDIT_CARD" ? "border-primary bg-primary/5" : "border-border bg-background hover:border-primary/50"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <CreditCard className="h-5 w-5 text-primary" />
                    <RadioGroupItem id="payment-card" value="CREDIT_CARD" aria-label="Pagar por cartão de crédito" />
                  </div>
                  <span className="mt-2 block font-semibold">Cartão de crédito</span>
                  <span className="mt-1 block text-xs text-muted-foreground">Dados informados somente no Asaas.</span>
                </label>
              </RadioGroup>
            </fieldset>
            <div className="rounded-2xl border bg-card p-5 flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{product.name} · Plano semestral</p>
                <p className="text-2xl font-extrabold">
                  R$ {(product.priceCents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </p>
              </div>
              <ShieldCheck className="h-8 w-8 text-primary/60" />
            </div>
            <p className="-mt-1 text-xs text-center text-muted-foreground">A validade termina em 30/06 ou 31/12, conforme o semestre da confirmação do pagamento.</p>
            <Button type="submit" size="lg" className="w-full text-base" disabled={createCheckout.isPending}>
              {createCheckout.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {paymentMethod === "PIX" ? "Continuar com Pix" : "Continuar com cartão"}
            </Button>
            <p className="text-xs text-center text-muted-foreground">
              Você será direcionado para a página segura do Asaas. O SiapAI não recebe nem armazena dados do cartão.
            </p>
          </form>
        )}

        {status === "loading" && (
          <div className="py-24 flex flex-col items-center gap-4 animate-in">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-muted-foreground">Preparando seu pagamento seguro...</p>
          </div>
        )}

      </main>
    </div>
  );
}
