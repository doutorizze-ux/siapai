import { useEffect, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, BadgeCheck, CheckCircle2, Loader2, ShieldAlert, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

export default function Validate() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [result, setResult] = useState<{ valid: boolean; reason?: string } | null>(null);
  const [queryKey, setQueryKey] = useState<readonly [string, string] | null>(null);
  const validateQuery = trpc.commerce.validateLicense.useQuery(
    queryKey ? { email: queryKey[0], code: queryKey[1] } : null as never,
    { enabled: false, retry: false },
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setResult(null);
    setQueryKey([email, code]);
  };

  useEffect(() => {
    if (!validateQuery.isLoading && validateQuery.data) {
      const res = validateQuery.data;
      setResult(res);
      if (res.valid) {
        toast.success("Licença ativa! Sua chave funciona corretamente.");
      } else {
        toast.error(res.reason || "Licença inválida ou expirada.");
      }
    }
  }, [validateQuery.data, validateQuery.isLoading]);

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
            <img src="/manus-storage/siapai-logo-transparent_04b775c0.png" alt="" className="h-7 w-7 rounded-lg" />
            SiapAI
          </a>
        </div>
      </header>
      <main className="flex-1 container py-12 max-w-md mx-auto w-full">
        <div className="animate-in">
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">Validar licença</h1>
          <p className="mt-2 text-muted-foreground text-sm">
            Confira se seu código de acesso está ativo. Use o mesmo e-mail e código que você recebeu na compra.
          </p>
        </div>
        <Card className="mt-6 animate-in [animation-delay:80ms]">
          <CardHeader>
            <CardTitle>Verificar código</CardTitle>
            <CardDescription>
              Seu código tem o formato PP-XXXXXXXXXXXX e foi enviado para o e-mail cadastrado na compra.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">E-mail</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="voce@exemplo.com" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="code">Código de acesso</Label>
                <Input id="code" value={code} onChange={(e) => setCode(e.target.value)} required placeholder="PP-XXXXXXXXXXXX" />
              </div>
              <Button type="submit" className="w-full" disabled={validateQuery.isLoading}>
                {validateQuery.isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                Validar
              </Button>
              {result && (
                <div
                  className={`rounded-xl border p-4 flex items-start gap-3 text-sm ${
                    result.valid ? "bg-accent/50" : "bg-destructive/10"
                  }`}>
                  {result.valid ? (
                    <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                  )}
                  <div>
                    <p className="font-semibold">{result.valid ? "Licença ativa" : "Licença inválida"}</p>
                    {result.valid ? (
                      <p className="text-muted-foreground mt-1">
                        <BadgeCheck className="h-3.5 w-3.5 inline mr-1" />
                        Seu código está funcionando. Use-o na extensão para liberar o painel no SIAP.
                      </p>
                    ) : (
                      <p className="text-muted-foreground mt-1">
                        <ShieldAlert className="h-3.5 w-3.5 inline mr-1" />
                        {result.reason || "Verifique o e-mail e o código digitados."}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </form>
          </CardContent>
        </Card>
        <p className="mt-6 text-xs text-center text-muted-foreground">
          Precisa de ajuda? Entre em contato pelo e-mail de suporte recebido na compra.
        </p>
      </main>
    </div>
  );
}
