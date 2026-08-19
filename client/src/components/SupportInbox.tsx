import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Bell, CheckCheck, ChevronRight, LifeBuoy, Loader2, MessageCircle, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

function publicKeyToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from(rawData, (char) => char.charCodeAt(0));
}

function formatRelativeTime(value: Date | string) {
  const date = new Date(value);
  return date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function SupportInbox() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [reply, setReply] = useState("");
  const [isMobileDetail, setIsMobileDetail] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const utils = trpc.useUtils();
  const list = trpc.support.adminList.useQuery(undefined, { refetchInterval: 15_000, refetchOnWindowFocus: true });
  const selectedConversation = trpc.support.adminGet.useQuery({ conversationId: selectedId ?? 0 }, { enabled: Boolean(selectedId), refetchInterval: 7_000 });
  const markRead = trpc.support.adminMarkRead.useMutation();
  const sendReply = trpc.support.adminReply.useMutation();
  const pushKey = trpc.support.publicPushKey.useQuery();
  const subscribePush = trpc.support.subscribePush.useMutation();

  useEffect(() => {
    if (!selectedId && list.data?.length) setSelectedId(list.data[0].id);
  }, [list.data, selectedId]);

  useEffect(() => {
    if (selectedId && selectedConversation.data?.unread) {
      markRead.mutate({ conversationId: selectedId }, { onSuccess: () => utils.support.adminList.invalidate() });
    }
  }, [selectedId, selectedConversation.data?.unread]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [selectedConversation.data?.messages.length]);

  const unreadCount = useMemo(() => list.data?.filter((conversation) => conversation.unread).length ?? 0, [list.data]);

  const selectConversation = (conversationId: number) => {
    setSelectedId(conversationId);
    setIsMobileDetail(true);
  };

  const activateNotifications = async () => {
    const publicKey = pushKey.data?.publicKey;
    if (!publicKey) {
      toast.error("As notificações ainda não foram configuradas no servidor.");
      return;
    }
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      toast.error("Este navegador não oferece notificações web.");
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        toast.error("Permita as notificações para receber mensagens no celular.");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: publicKeyToUint8Array(publicKey) });
      const data = subscription.toJSON();
      if (!data.endpoint || !data.keys?.p256dh || !data.keys.auth) throw new Error("Assinatura de notificação incompleta.");
      await subscribePush.mutateAsync({ endpoint: data.endpoint, p256dh: data.keys.p256dh, auth: data.keys.auth, userAgent: navigator.userAgent });
      toast.success("Alertas ativados neste celular.");
    } catch (error) {
      toast.error((error as Error).message || "Não foi possível ativar os alertas.");
    }
  };

  const submitReply = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedId || !reply.trim()) return;
    try {
      await sendReply.mutateAsync({ conversationId: selectedId, body: reply });
      setReply("");
      await Promise.all([utils.support.adminGet.invalidate({ conversationId: selectedId }), utils.support.adminList.invalidate()]);
    } catch (error) {
      toast.error((error as Error).message || "Não foi possível enviar a resposta.");
    }
  };

  const detail = selectedConversation.data;

  return (
    <section id="suporte" className="scroll-mt-20">
      <Card className="overflow-hidden border-primary/20 shadow-sm">
        <CardHeader className="gap-3 border-b bg-primary/[0.03] sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2"><LifeBuoy className="h-5 w-5 text-primary" />Caixa de suporte</CardTitle>
            <CardDescription>Responda professores diretamente do celular, sem expor seu telefone.</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && <Badge variant="destructive">{unreadCount} nova{unreadCount > 1 ? "s" : ""}</Badge>}
            <Button type="button" variant="outline" size="sm" onClick={activateNotifications} disabled={subscribePush.isPending}>
              {subscribePush.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
              Alertas no celular
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="grid min-h-[530px] md:grid-cols-[minmax(250px,0.8fr)_minmax(0,1.5fr)]">
            <aside className={`${isMobileDetail ? "hidden md:block" : "block"} min-h-0 border-r bg-muted/20`} aria-label="Lista de conversas">
              {list.isLoading ? (
                <div className="flex items-center justify-center py-16 text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Carregando conversas…</div>
              ) : !list.data?.length ? (
                <div className="px-5 py-14 text-center text-sm text-muted-foreground"><MessageCircle className="mx-auto mb-3 h-7 w-7 opacity-50" />Nenhuma dúvida chegou por aqui ainda.</div>
              ) : (
                <div className="max-h-[530px] overflow-y-auto p-2">
                  {list.data.map((conversation) => (
                    <button key={conversation.id} type="button" onClick={() => selectConversation(conversation.id)} className={`mb-1 w-full rounded-xl p-3 text-left transition-colors ${conversation.id === selectedId ? "bg-primary text-primary-foreground" : "hover:bg-background"}`}>
                      <div className="flex items-start justify-between gap-2">
                        <span className="min-w-0 truncate font-semibold">{conversation.clientName}</span>
                        {conversation.unread ? <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${conversation.id === selectedId ? "bg-primary-foreground" : "bg-destructive"}`} aria-label="Nova mensagem" /> : <ChevronRight className="h-4 w-4 shrink-0 opacity-50" />}
                      </div>
                      <p className={`mt-1 line-clamp-2 text-xs ${conversation.id === selectedId ? "text-primary-foreground/75" : "text-muted-foreground"}`}>{conversation.lastMessage || "Sem mensagem"}</p>
                      <p className={`mt-2 text-[11px] ${conversation.id === selectedId ? "text-primary-foreground/65" : "text-muted-foreground"}`}>{formatRelativeTime(conversation.lastMessageAt)}</p>
                    </button>
                  ))}
                </div>
              )}
            </aside>

            <div className={`${isMobileDetail ? "flex" : "hidden md:flex"} min-h-0 flex-col bg-background`}>
              {!selectedId || selectedConversation.isLoading ? (
                <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-muted-foreground">
                  {selectedConversation.isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Abrindo conversa…</> : "Selecione uma conversa para responder."}
                </div>
              ) : detail ? (
                <>
                  <header className="flex items-center gap-3 border-b px-3 py-3 sm:px-4">
                    <Button type="button" variant="ghost" size="icon" className="md:hidden" onClick={() => setIsMobileDetail(false)} aria-label="Voltar para conversas"><ArrowLeft className="h-5 w-5" /></Button>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{detail.clientName}</p>
                      <p className="truncate text-xs text-muted-foreground">{detail.clientEmail || "E-mail não informado"}</p>
                    </div>
                    <Badge variant={detail.status === "open" ? "destructive" : "secondary"}>{detail.status === "open" ? "Aguardando" : "Respondido"}</Badge>
                  </header>
                  <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-muted/15 p-3 sm:p-4">
                    {detail.messages.map((message) => (
                      <div key={message.id} className={`max-w-[88%] rounded-2xl px-3 py-2.5 text-sm shadow-sm ${message.sender === "admin" ? "ml-auto bg-primary text-primary-foreground" : "border bg-card text-card-foreground"}`}>
                        <p className="whitespace-pre-wrap break-words">{message.body}</p>
                        <p className={`mt-1 text-[10px] ${message.sender === "admin" ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{message.sender === "admin" ? "Você" : detail.clientName} · {formatRelativeTime(message.createdAt)}</p>
                      </div>
                    ))}
                    <div ref={bottomRef} />
                  </div>
                  <form onSubmit={submitReply} className="border-t bg-background p-3">
                    <Textarea rows={2} value={reply} onChange={(event) => setReply(event.target.value)} maxLength={2_000} placeholder="Escreva sua resposta…" className="resize-none" />
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <p className="flex items-center gap-1 text-[11px] text-muted-foreground"><CheckCheck className="h-3.5 w-3.5" />O professor recebe por este chat.</p>
                      <Button type="submit" size="sm" disabled={sendReply.isPending || !reply.trim()}>{sendReply.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="h-4 w-4" />Responder</>}</Button>
                    </div>
                  </form>
                </>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
