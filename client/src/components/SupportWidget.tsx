import { useEffect, useMemo, useState } from "react";
import { CircleCheck, LifeBuoy, Loader2, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

type PublicConversationAccess = { conversationId: number; clientToken: string };
const STORAGE_KEY = "siapai.support.conversation.v1";

function readAccess(): PublicConversationAccess | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PublicConversationAccess;
    return Number.isInteger(parsed.conversationId) && typeof parsed.clientToken === "string" ? parsed : null;
  } catch {
    return null;
  }
}

function persistAccess(access: PublicConversationAccess) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(access));
}

export function SupportWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [access, setAccess] = useState<PublicConversationAccess | null>(() => (typeof window === "undefined" ? null : readAccess()));
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const utils = trpc.useUtils();
  const conversation = trpc.support.getPublicConversation.useQuery(access as PublicConversationAccess, {
    enabled: Boolean(access),
    refetchInterval: isOpen ? 7_000 : false,
    refetchOnWindowFocus: true,
  });
  const createConversation = trpc.support.createConversation.useMutation();
  const sendMessage = trpc.support.sendPublicMessage.useMutation();

  const messages = useMemo(() => conversation.data?.messages ?? [], [conversation.data?.messages]);

  useEffect(() => {
    if (conversation.error) {
      window.localStorage.removeItem(STORAGE_KEY);
      setAccess(null);
    }
  }, [conversation.error]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!message.trim()) return;
    try {
      if (!access) {
        if (name.trim().length < 2) {
          toast.error("Informe seu nome para começarmos o atendimento.");
          return;
        }
        const created = await createConversation.mutateAsync({ clientName: name, clientEmail: email, body: message });
        const nextAccess = { conversationId: created.conversationId, clientToken: created.clientToken };
        persistAccess(nextAccess);
        setAccess(nextAccess);
      } else {
        await sendMessage.mutateAsync({ ...access, body: message });
      }
      setMessage("");
      await utils.support.getPublicConversation.invalidate();
    } catch (error) {
      toast.error((error as Error).message || "Não foi possível enviar sua mensagem.");
    }
  };

  const sending = createConversation.isPending || sendMessage.isPending;

  return (
    <div className="fixed bottom-4 right-4 z-50 sm:bottom-6 sm:right-6">
      {isOpen && (
        <section aria-label="Atendimento SiapAI" className="mb-3 flex h-[min(580px,calc(100vh-6.5rem))] w-[calc(100vw-2rem)] max-w-sm flex-col overflow-hidden rounded-2xl border border-primary/20 bg-background shadow-2xl">
          <header className="flex items-center justify-between bg-primary px-4 py-3 text-primary-foreground">
            <div>
              <p className="flex items-center gap-2 text-sm font-bold"><LifeBuoy className="h-4 w-4" /> Suporte SiapAI</p>
              <p className="mt-0.5 text-xs text-primary-foreground/80">Fale com a nossa equipe por aqui.</p>
            </div>
            <button type="button" onClick={() => setIsOpen(false)} aria-label="Fechar suporte" className="rounded-md p-1.5 transition-colors hover:bg-white/15">
              <X className="h-5 w-5" />
            </button>
          </header>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-muted/30 p-3">
            {!access ? (
              <div className="rounded-xl border bg-card p-3 text-sm text-muted-foreground">
                Olá! Deixe sua dúvida e responderemos nesta conversa. Seu telefone não é solicitado.
              </div>
            ) : conversation.isLoading ? (
              <div className="flex items-center justify-center py-12 text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Carregando conversa…</div>
            ) : (
              messages.map((item) => (
                <div key={item.id} className={`max-w-[88%] rounded-2xl px-3 py-2 text-sm shadow-sm ${item.sender === "customer" ? "ml-auto bg-primary text-primary-foreground" : "border bg-card text-card-foreground"}`}>
                  <p className="whitespace-pre-wrap break-words">{item.body}</p>
                  <p className={`mt-1 text-[10px] ${item.sender === "customer" ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                    {item.sender === "customer" ? "Você" : "Equipe SiapAI"} · {new Date(item.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              ))
            )}
          </div>

          <form onSubmit={submit} className="space-y-2 border-t bg-background p-3">
            {!access && (
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="support-name" className="text-xs">Seu nome</Label>
                  <Input id="support-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} placeholder="Como podemos chamar você?" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="support-email" className="text-xs">E-mail <span className="text-muted-foreground">(opcional)</span></Label>
                  <Input id="support-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={320} placeholder="voce@email.com" />
                </div>
              </div>
            )}
            <Textarea value={message} onChange={(event) => setMessage(event.target.value)} maxLength={2_000} rows={2} placeholder={access ? "Escreva sua mensagem…" : "Como podemos ajudar?"} className="resize-none" />
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] leading-4 text-muted-foreground">Respondemos por este chat. Não mostramos seu número nem o nosso.</p>
              <Button type="submit" size="sm" disabled={sending || !message.trim()}>
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="h-4 w-4" />Enviar</>}
              </Button>
            </div>
          </form>
        </section>
      )}
      <Button type="button" onClick={() => setIsOpen((current) => !current)} className="h-12 rounded-full px-4 shadow-lg shadow-primary/30" aria-expanded={isOpen} aria-controls="support-widget">
        {isOpen ? <X className="h-5 w-5" /> : <LifeBuoy className="h-5 w-5" />}
        <span>Suporte</span>
      </Button>
    </div>
  );
}
