import { useState } from "react";
import { Link } from "wouter";
import { Copy, Edit2, Loader2, Plus, RefreshCw, ShieldCheck, Trash2, ToggleLeft, ToggleRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";

function useAdminAccess() {
  const { user, loading, isAuthenticated } = useAuth();
  const ready = isAuthenticated && !loading && user?.role === "admin";
  return { ready, user, loading, isAuthenticated };
}

export default function Admin() {
  const { ready, user, loading, isAuthenticated } = useAdminAccess();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!isAuthenticated || !ready) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-center px-4">
        <ShieldCheck className="h-10 w-10 text-primary" />
        <h1 className="text-xl font-bold">Acesso restrito</h1>
        <p className="text-sm text-muted-foreground max-w-sm">
          Esta área é exclusiva do administrador. Faça login com a conta de admin para gerenciar licenças e o preço do plano.
        </p>
        <Button onClick={() => startLogin()}>Fazer login</Button>
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
          Voltar ao início
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="border-b bg-background/85 backdrop-blur sticky top-0 z-40">
        <div className="container flex h-14 items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-extrabold text-primary">
            <img src="/manus-storage/siapai-logo-transparent_04b775c0.png" alt="" className="h-7 w-7 rounded-lg" />
            SiapAI · Admin
          </Link>
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
            Ver site
          </Link>
        </div>
      </header>
      <main className="container py-8 space-y-8 max-w-5xl mx-auto">
        <PriceManager />
        <LicenseManager />
      </main>
    </div>
  );
}

function PriceManager() {
  const { data: settings, refetch } = trpc.admin.getProductSettings.useQuery();
  const update = trpc.admin.updateProductSettings.useMutation();
  const utils = trpc.useUtils();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");

  const openEdit = () => {
    if (settings) {
      setName(settings.name);
      setPrice(String(settings.priceCents / 100));
      setDescription(settings.description ?? "");
      setOpen(true);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cents = Math.round(parseFloat(price.replace(",", ".")) * 100);
    if (!name || isNaN(cents) || cents <= 0) return;
    try {
      await update.mutateAsync({ name, priceCents: cents, description });
      utils.admin.getProductSettings.invalidate();
      refetch();
      setOpen(false);
      toast.success("Preço do plano atualizado.");
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Preço do plano</CardTitle>
          <CardDescription>Alteração refletida automaticamente na landing page e no checkout.</CardDescription>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={openEdit}>
              <Edit2 className="h-3.5 w-3.5" /> Editar
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar plano</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="pname">Nome do plano</Label>
                <Input id="pname" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pprice">Preço (R$)</Label>
                <Input id="pprice" type="number" step="0.01" min="0.01" value={price} onChange={(e) => setPrice(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pdesc">Descrição (exibe no checkout)</Label>
                <Textarea id="pdesc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
              </div>
              <Button type="submit" className="w-full" disabled={update.isPending}>
                {update.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Salvar
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {settings ? (
          <div className="grid sm:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Plano</p>
              <p className="font-semibold">{settings.name}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Preço</p>
              <p className="font-semibold text-xl">
                R$ {(settings.priceCents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Modo de pagamento</p>
              <p className="font-semibold">{settings.asaasMode === "sandbox" ? "Sandbox (teste)" : "Produção"}</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        )}
      </CardContent>
    </Card>
  );
}

function LicenseManager() {
  const { data: licenses, refetch } = trpc.admin.listLicenses.useQuery();
  const create = trpc.admin.createLicense.useMutation();
  const toggle = trpc.admin.toggleLicense.useMutation();
  const remove = trpc.admin.deleteLicense.useMutation();
  const invalidate = async () => {
    await trpc.useUtils().admin.listLicenses.invalidate();
    refetch();
  };

  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [days, setDays] = useState("365");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const expires = new Date();
      expires.setDate(expires.getDate() + (parseInt(days) || 365));
      const res = await create.mutateAsync({ email, expiresAt: expires.toISOString().slice(0, 10) });
      if (res.code) {
        await navigator.clipboard.writeText(res.code);
        toast.success(`Licença criada! Código ${res.code} copiado.`);
      } else {
        toast.success("Licença criada.");
      }
      await invalidate();
      setOpen(false);
      setEmail("");
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const copyCode = async (code: string) => {
    await navigator.clipboard.writeText(code);
    toast.success("Código copiado!");
  };

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Licenças</CardTitle>
          <CardDescription>Gerencie as licenças de acesso dos clientes.</CardDescription>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Criar licença
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Criar licença</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="lemail">E-mail do cliente</Label>
                <Input id="lemail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="cliente@exemplo.com" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ldays">Validade (dias)</Label>
                <Input id="ldays" type="number" min="1" value={days} onChange={(e) => setDays(e.target.value)} required />
              </div>
              <Button type="submit" className="w-full" disabled={create.isPending}>
                {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Gerar licença
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {!licenses || licenses.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Nenhuma licença criada ainda.</p>
        ) : (
          <div className="overflow-x-auto -mx-5 px-5">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Código</TableHead>
                  <TableHead>Expira em</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {licenses.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-medium">{l.email}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5 text-xs">
                        {l.code}
                        <button onClick={() => copyCode(l.code)} className="text-muted-foreground hover:text-foreground" aria-label="Copiar código">
                          <Copy className="h-3 w-3" />
                        </button>
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {l.expiresAt ? new Date(l.expiresAt).toLocaleDateString("pt-BR") : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={l.active ? "default" : "secondary"}>
                        {l.active ? "Ativa" : "Inativa"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          title={l.active ? "Desativar" : "Ativar"}
                          onClick={async () => {
                            await toggle.mutateAsync({ id: l.id, active: l.active ? 0 : 1 });
                            await invalidate();
                          }}
                          disabled={toggle.isPending}>
                          {l.active ? <ToggleRight className="h-5 w-5 text-primary" /> : <ToggleLeft className="h-5 w-5 text-muted-foreground" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Excluir"
                          onClick={async () => {
                            if (confirm(`Excluir a licença de ${l.email}?`)) {
                              await remove.mutateAsync({ id: l.id });
                              await invalidate();
                            }
                          }}
                          disabled={remove.isPending}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                        <Button variant="ghost" size="icon" title="Atualizar" onClick={() => refetch()}>
                          <RefreshCw className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
