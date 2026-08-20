import { useState } from "react";
import { Link } from "wouter";
import { ArrowDown, ArrowUp, Copy, Edit2, Eye, EyeOff, Loader2, Plus, RefreshCw, ShieldCheck, Trash2, ToggleLeft, ToggleRight, Video } from "lucide-react";
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
import { SupportInbox } from "@/components/SupportInbox";

function useAdminAccess() {
  const { user, loading, isAuthenticated } = useAuth();
  const ready = isAuthenticated && !loading && user?.role === "admin";
  return { ready, user, loading, isAuthenticated };
}

function LocalAdminForm({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const login = trpc.auth.localLogin.useMutation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (login.isPending) return;
    try {
      await login.mutateAsync({ email, password });
      onLoggedIn();
    } catch (err) {
      login.reset();
      setError((err as Error).message || "Não foi possível entrar.");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-3 text-left">
      <div className="space-y-1.5">
        <Label htmlFor="admin-email">E-mail do administrador</Label>
        <Input id="admin-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@siapai.online" required autoComplete="username" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="admin-password">Senha</Label>
        <Input id="admin-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full" disabled={login.isPending}>
        {login.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
        Entrar
      </Button>
    </form>
  );
}

export default function Admin() {
  const { ready, user, loading, isAuthenticated } = useAdminAccess();
  const utils = trpc.useUtils();

  const handleLocalLoggedIn = () => {
    utils.auth.me.invalidate();
  };

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
        <LocalAdminForm onLoggedIn={handleLocalLoggedIn} />
        <div className="flex items-center gap-3 text-xs text-muted-foreground w-full max-w-sm">
          <span className="flex-1 h-px bg-border" />
          ou
          <span className="flex-1 h-px bg-border" />
        </div>
        <Button variant="outline" onClick={() => startLogin()}>Fazer login com conta Manus</Button>
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
            <img src="https://files.manuscdn.com/user_upload_by_module/session_file/310519663876770025/prWiYtCFZbRhSEqO.webp" alt="" className="h-7 w-7 rounded-lg" />
            SiapAI · Admin
          </Link>
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
            Ver site
          </Link>
        </div>
      </header>
      <main className="container py-8 space-y-8 max-w-5xl mx-auto">
        <SupportInbox />
        <PriceManager />
        <TutorialManager />
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

  const openEdit = () => {
    if (settings) {
      setName(settings.name);
      setPrice(String(settings.priceCents / 100));
      setOpen(true);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cents = Math.round(parseFloat(price.replace(",", ".")) * 100);
    if (!name || isNaN(cents) || cents <= 0) return;
    try {
      await update.mutateAsync({ name, priceCents: cents });
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await create.mutateAsync({ email });
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
              <p className="rounded-lg bg-secondary p-3 text-sm text-muted-foreground">A licença seguirá a validade do semestre-calendário atual: até 30/06 ou 31/12.</p>
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

function TutorialManager() {
  const { data: tutorials, refetch } = trpc.admin.listTutorials.useQuery();
  const create = trpc.admin.createTutorial.useMutation();
  const update = trpc.admin.updateTutorial.useMutation();
  const remove = trpc.admin.deleteTutorial.useMutation();
  const utils = trpc.useUtils();

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [displayOrder, setDisplayOrder] = useState("0");
  const [isPublished, setIsPublished] = useState(true);

  const invalidate = async () => {
    await utils.admin.listTutorials.invalidate();
    await utils.commerce.tutorials.invalidate();
    await refetch();
  };

  const resetForm = () => {
    setEditingId(null);
    setTitle("");
    setDescription("");
    setYoutubeUrl("");
    setDisplayOrder(String(tutorials?.length ?? 0));
    setIsPublished(true);
  };

  const openCreate = () => {
    resetForm();
    setOpen(true);
  };

  const openEdit = (tutorial: NonNullable<typeof tutorials>[number]) => {
    setEditingId(tutorial.id);
    setTitle(tutorial.title);
    setDescription(tutorial.description ?? "");
    setYoutubeUrl(tutorial.youtubeUrl);
    setDisplayOrder(String(tutorial.displayOrder));
    setIsPublished(tutorial.isPublished === 1);
    setOpen(true);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const payload = { title, description: description || undefined, youtubeUrl, displayOrder: Math.max(0, parseInt(displayOrder, 10) || 0), isPublished: isPublished ? 1 : 0 } as const;
    try {
      if (editingId) {
        await update.mutateAsync({ id: editingId, ...payload });
        toast.success("Tutorial atualizado.");
      } else {
        await create.mutateAsync(payload);
        toast.success("Tutorial adicionado ao painel.");
      }
      await invalidate();
      setOpen(false);
      resetForm();
    } catch (error) {
      toast.error((error as Error).message || "Não foi possível salvar o tutorial.");
    }
  };

  const togglePublication = async (tutorial: NonNullable<typeof tutorials>[number]) => {
    try {
      await update.mutateAsync({ id: tutorial.id, isPublished: tutorial.isPublished ? 0 : 1 });
      await invalidate();
      toast.success(tutorial.isPublished ? "Tutorial ocultado do site." : "Tutorial publicado no site.");
    } catch (error) {
      toast.error((error as Error).message || "Não foi possível alterar a publicação.");
    }
  };

  const moveTutorial = async (tutorial: NonNullable<typeof tutorials>[number], direction: -1 | 1) => {
    const position = tutorials?.findIndex((item) => item.id === tutorial.id) ?? -1;
    const other = tutorials?.[position + direction];
    if (!other) return;
    try {
      await update.mutateAsync({ id: tutorial.id, displayOrder: other.displayOrder });
      await update.mutateAsync({ id: other.id, displayOrder: tutorial.displayOrder });
      await invalidate();
    } catch (error) {
      toast.error((error as Error).message || "Não foi possível alterar a ordem.");
    }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2"><Video className="h-5 w-5 text-primary" /> Tutoriais em vídeo</CardTitle>
          <CardDescription>Cadastre links do YouTube para exibi-los automaticamente na página pública do SiapAI.</CardDescription>
        </div>
        <Dialog open={open} onOpenChange={(nextOpen) => { setOpen(nextOpen); if (!nextOpen) resetForm(); }}>
          <Button size="sm" className="gap-1.5 shrink-0" onClick={openCreate}>
            <Plus className="h-3.5 w-3.5" /> Novo vídeo
          </Button>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader><DialogTitle>{editingId ? "Editar tutorial" : "Adicionar tutorial"}</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5"><Label htmlFor="tutorial-title">Título</Label><Input id="tutorial-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ex.: Como instalar a extensão" required maxLength={180} /></div>
              <div className="space-y-1.5"><Label htmlFor="tutorial-url">Link do vídeo no YouTube</Label><Input id="tutorial-url" type="url" value={youtubeUrl} onChange={(event) => setYoutubeUrl(event.target.value)} placeholder="https://www.youtube.com/watch?v=..." required /><p className="text-xs text-muted-foreground">Aceita links padrão, curtos (youtu.be), Shorts e embeds do YouTube.</p></div>
              <div className="space-y-1.5"><Label htmlFor="tutorial-description">Descrição curta</Label><Textarea id="tutorial-description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Explique o que o professor aprenderá neste vídeo." rows={3} maxLength={1200} /></div>
              <div className="grid grid-cols-2 gap-4"><div className="space-y-1.5"><Label htmlFor="tutorial-order">Ordem</Label><Input id="tutorial-order" type="number" min="0" value={displayOrder} onChange={(event) => setDisplayOrder(event.target.value)} required /></div><label className="flex cursor-pointer items-center gap-2 pt-6 text-sm font-medium"><input type="checkbox" checked={isPublished} onChange={(event) => setIsPublished(event.target.checked)} className="h-4 w-4 accent-primary" />Publicar agora</label></div>
              <Button type="submit" className="w-full" disabled={create.isPending || update.isPending}>{(create.isPending || update.isPending) && <Loader2 className="h-4 w-4 animate-spin" />}{editingId ? "Salvar alterações" : "Adicionar vídeo"}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {!tutorials ? <p className="py-6 text-center text-sm text-muted-foreground">Carregando tutoriais...</p> : tutorials.length === 0 ? <div className="rounded-2xl border border-dashed p-7 text-center"><Video className="mx-auto h-7 w-7 text-primary/70" /><p className="mt-3 font-semibold">Nenhum tutorial cadastrado ainda.</p><p className="mt-1 text-sm text-muted-foreground">Adicione os vídeos já publicados no YouTube. Você poderá editar, ocultar ou reorganizar quando quiser.</p></div> : <div className="space-y-3">{tutorials.map((tutorial, index) => <article key={tutorial.id} className="flex flex-col gap-4 rounded-2xl border p-4 sm:flex-row sm:items-center"><img src={`https://i.ytimg.com/vi/${tutorial.youtubeVideoId}/hqdefault.jpg`} alt="" className="aspect-video w-full rounded-xl bg-secondary object-cover sm:w-40" /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold">{tutorial.title}</h3><Badge variant={tutorial.isPublished ? "default" : "secondary"}>{tutorial.isPublished ? "Publicado" : "Oculto"}</Badge></div>{tutorial.description && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{tutorial.description}</p>}<p className="mt-2 truncate text-xs text-muted-foreground">Ordem {tutorial.displayOrder} · {tutorial.youtubeUrl}</p></div><div className="flex flex-wrap items-center gap-1 sm:justify-end"><Button variant="ghost" size="icon" title="Mover para cima" aria-label="Mover para cima" onClick={() => moveTutorial(tutorial, -1)} disabled={index === 0 || update.isPending}><ArrowUp className="h-4 w-4" /></Button><Button variant="ghost" size="icon" title="Mover para baixo" aria-label="Mover para baixo" onClick={() => moveTutorial(tutorial, 1)} disabled={index === tutorials.length - 1 || update.isPending}><ArrowDown className="h-4 w-4" /></Button><Button variant="ghost" size="icon" title={tutorial.isPublished ? "Ocultar" : "Publicar"} aria-label={tutorial.isPublished ? "Ocultar" : "Publicar"} onClick={() => togglePublication(tutorial)} disabled={update.isPending}>{tutorial.isPublished ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</Button><Button variant="ghost" size="icon" title="Editar" aria-label="Editar" onClick={() => openEdit(tutorial)}><Edit2 className="h-4 w-4" /></Button><Button variant="ghost" size="icon" title="Excluir" aria-label="Excluir" onClick={async () => { if (!confirm(`Excluir o tutorial “${tutorial.title}”?`)) return; try { await remove.mutateAsync({ id: tutorial.id }); await invalidate(); toast.success("Tutorial excluído."); } catch (error) { toast.error((error as Error).message || "Não foi possível excluir o tutorial."); } }} disabled={remove.isPending}><Trash2 className="h-4 w-4 text-destructive" /></Button></div></article>)}</div>}
      </CardContent>
    </Card>
  );
}
