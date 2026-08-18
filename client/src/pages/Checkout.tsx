import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, CheckCircle2, Copy, Loader2, QrCode, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

/* Polling manual do status do pagamento (a cada 8s) */
async function pollPaymentStatus(paymentId: string, onStatus: (s: string) => void, signal: AbortSignal) {
  while (!signal.aborted) {
    await new Promise((r) => setTimeout(r, 8000));
    try {
      const res = await fetch(`/api/trpc/commerce.checkPayment?input=${encodeURIComponent(JSON.stringify({ json: { paymentId } }))}`);
      const json = await res.json();
      const status = json.result?.data?.json?.status;
      if (status) onStatus(status);
      if (status === "RECEIVED" || status === "OVERDUE" || status === "CANCELLED") return;
    } catch {
      /* ignora falhas de rede pontuais */
    }
  }
}

type Status = "form" | "loading" | "waiting" | "done" | "error";

export default function Checkout() {
  const { data: product } = trpc.commerce.productInfo.useQuery();
  const createCheckout = trpc.commerce.createCheckout.useMutation();

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [cpf, setCpf] = useState("");
  const [status, setStatus] = useState<Status>("form");
  const [paymentId, setPaymentId] = useState("");
  const [pixCode, setPixCode] = useState("");
  const [pixImage, setPixImage] = useState("");
  const [value, setValue] = useState(0);
  const [payStatus, setPayStatus] = useState("");
  const pollRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => pollRef.current?.abort();
  }, []);

  useEffect(() => {
    if (payStatus === "RECEIVED" && status === "waiting") {
      setStatus("done");
      toast.success("Pagamento confirmado! Sua licença foi liberada.");
    }
    if (payStatus === "OVERDUE" && status === "waiting") {
      toast.error("O Pix expirou. Gere uma nova cobrança.");
      setStatus("form");
    }
  }, [payStatus, status]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !name || !cpf || cpf.replace(/\D/g, "").length < 11) return;
    setStatus("loading");
    try {
      const result = await createCheckout.mutateAsync({ email, name, cpfCnpj: cpf });
      setPaymentId(result.paymentId);
      setPixCode(result.pixQrCode ?? "");
      setPixImage(result.pixQrImage ?? "");
      setValue(result.value);
      setStatus("waiting");
      toast.info("Pix gerado! Pague pelo app do seu banco.");
      pollRef.current?.abort();
      const ctrl = new AbortController();
      pollRef.current = ctrl;
      pollPaymentStatus(result.paymentId, setPayStatus, ctrl.signal);
    } catch (err) {
      setStatus("form");
      toast.error((err as Error).message);
    }
  };

  const verifyNow = async () => {
    try {
      const res = await fetch(`/api/trpc/commerce.checkPayment?input=${encodeURIComponent(JSON.stringify({ json: { paymentId } }))}`);
      const json = await res.json();
      const s = json.result?.data?.json?.status;
      if (s) setPayStatus(s);
    } catch {
      toast.error("Não foi possível verificar. Tente novamente.");
    }
  };

  const copyPix = async () => {
    if (!pixCode) {
      toast.error("O código Pix ainda não foi disponibilizado. Gere uma nova cobrança.");
      return;
    }
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(pixCode);
      } else {
        const input = document.createElement("textarea");
        input.value = pixCode;
        input.setAttribute("readonly", "");
        input.style.position = "fixed";
        input.style.opacity = "0";
        document.body.appendChild(input);
        input.select();
        const copied = document.execCommand("copy");
        document.body.removeChild(input);
        if (!copied) throw new Error("Falha ao copiar");
      }
      toast.success("Código Pix copiado!");
    } catch {
      toast.error("Não foi possível copiar automaticamente. Tente novamente.");
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
                Preencha com o e-mail que você usará para acessar a extensão. O código de licença será liberado
                automaticamente após a confirmação do Pix.
              </p>
            </div>
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
                <p className="text-xs text-muted-foreground">Necessário para emitir o Pix (exigência do Asaas).</p>
              </div>
            </div>
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
              Gerar Pix QR Code
            </Button>
            <p className="text-xs text-center text-muted-foreground">
              Pagamento único processado com segurança pelo Asaas. Após confirmar, basta esperar: a licença é liberada sozinha.
            </p>
          </form>
        )}

        {status === "loading" && (
          <div className="py-24 flex flex-col items-center gap-4 animate-in">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-muted-foreground">Gerando seu Pix...</p>
          </div>
        )}

        {(status === "waiting" || status === "done") && (
          <div className="space-y-5 animate-in">
            <div>
              <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
                {status === "done" ? "Pagamento confirmado!" : "Pague o Pix para liberar"}
              </h1>
              <p className="mt-2 text-muted-foreground text-sm">
                {status === "done"
                  ? "Sua licença já está ativa. Use o e-mail e o código enviado na instalação da extensão."
                  : "Abra o app do seu banco e escaneie o QR Code ou cole o código Pix abaixo. A licença é liberada automaticamente após a confirmação."}
              </p>
            </div>
            <div className="rounded-2xl border bg-card p-6 flex flex-col items-center gap-4 text-center">
              {pixCode ? (
                <img
                  src={pixImage ? `data:image/png;base64,${pixImage}` : `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(pixCode)}`}
                  alt="QR Code Pix"
                  className="h-60 w-60 rounded-xl border bg-white p-2"
                />
              ) : (
                <QrCode className="h-24 w-24 text-muted-foreground" />
              )}
              <p className="text-sm text-muted-foreground">Valor: <strong className="text-foreground">R$ {value.toFixed(2).replace(".", ",")}</strong></p>
              <Button variant="outline" onClick={copyPix} disabled={!pixCode} className="w-full gap-2">
                <Copy className="h-4 w-4" /> Copiar código Pix
              </Button>
            </div>
            {status === "done" && (
              <div className="rounded-2xl border bg-accent/50 p-5 flex items-start gap-3">
                <CheckCircle2 className="h-6 w-6 text-primary shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-semibold">Tudo certo!</p>
                  <p className="text-muted-foreground mt-1">
                    Seu código de acesso (formato PP-XXXXXXXXXXXX) foi enviado para <strong>{email}</strong> e também pode
                    ser consultado na área <Link href="/validar" className="underline">Validar licença</Link>.
                  </p>
                </div>
              </div>
            )}
            {status === "waiting" && (
              <p className="text-xs text-center text-muted-foreground">
                Aguardando confirmação... esta página atualiza automaticamente. Não feche até confirmar o pagamento.
              </p>
            )}
            {status === "waiting" && (
              <Button variant="ghost" className="w-full" onClick={verifyNow}>
                Já paguei — verificar agora
              </Button>
            )}
            {status === "waiting" && (
              <Link href="/" className="block text-center text-sm text-muted-foreground hover:text-foreground">
                Voltar ao início
              </Link>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
