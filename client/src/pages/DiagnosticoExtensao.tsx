import { useEffect, useState } from "react";
import { Link } from "wouter";

type Teste = {
  nome: string;
  status: "aguardando" | "executando" | "ok" | "erro";
  detalhe?: string;
};

// Mesma URL configurada no content.js da extensão SiapAI
const API_BASE = "https://3000-iapks8ess2i0u4is0qm4u-0d60910d.us1.manus.computer";

export default function DiagnosticoExtensao() {
  const [tests, setTests] = useState<Teste[]>([
    { nome: "1. Servidor alcançável (GET ping)", status: "aguardando" },
    { nome: "2. Validar e-mail (POST /api/auth/validate-email.php)", status: "aguardando" },
    { nome: "3. Verificar licença (POST /api/license/check.php)", status: "aguardando" },
    { nome: "4. Gerar planejamento IA (POST /api/planejamento/sugerir.php)", status: "aguardando" },
  ]);

  const setAt = (i: number, patch: Partial<Teste>) =>
    setTests(t => t.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));

  useEffect(() => {
    let cancelled = false;
    const url = API_BASE;
    if (!url) {
      setTests(t =>
        t.map(x => ({ ...x, status: "erro" as const, detalhe: "URL do servidor não configurada (API_BASE vazio)" }))
      );
      return;
    }
    (async () => {
      // Teste 1: ping
      setAt(0, { status: "executando" });
      try {
        const r1 = await fetch(`${url}/api/ping-extensao`, { method: "GET" });
        const t1 = await r1.json().catch(() => ({}));
        if (cancelled) return;
        setAt(0, {
          status: r1.ok && t1?.ok ? "ok" : "erro",
          detalhe: r1.ok ? `OK (${r1.status})` : `HTTP ${r1.status}`,
        });
      } catch (e: unknown) {
        if (cancelled) return;
        setAt(0, { status: "erro", detalhe: `Falha de rede: ${(e as Error).message}` });
        setAt(1, { status: "erro", detalhe: "Pulado (rede indisponível)" });
        setAt(2, { status: "erro", detalhe: "Pulado (rede indisponível)" });
        setAt(3, { status: "erro", detalhe: "Pulado (rede indisponível)" });
        return;
      }
      // Teste 2: validar e-mail
      setAt(1, { status: "executando" });
      try {
        const r2 = await fetch(`${url}/api/auth/validate-email.php`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: "02376222117@siapai.com.br" }),
        });
        const t2 = await r2.json().catch(() => ({}));
        if (cancelled) return;
        setAt(1, {
          status: r2.ok ? "ok" : "erro",
          detalhe: r2.ok ? `HTTP ${r2.status} — licença: ${t2?.ok ? "ativa" : "não ativa/inválida"}` : `HTTP ${r2.status}`,
        });
      } catch (e: unknown) {
        if (cancelled) return;
        setAt(1, { status: "erro", detalhe: `Falha de rede: ${(e as Error).message}` });
      }
      // Teste 3: verificar licença (usa token do teste 2)
      setAt(2, { status: "executando" });
      try {
        let token: string | null = null;
        try {
          const r2b = await fetch(`${url}/api/auth/validate-email.php`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: "02376222117@siapai.com.br" }),
          });
          const t2b = await r2b.json();
          token = t2b?.token || null;
        } catch {
          /* ignora */
        }
        if (!token) {
          setAt(2, { status: "erro", detalhe: "Sem token (validação falhou antes) — pulado" });
        } else {
          const r3 = await fetch(`${url}/api/license/check.php`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
          });
          const t3 = await r3.json().catch(() => ({}));
          if (cancelled) return;
          setAt(2, {
            status: r3.ok && t3?.ok ? "ok" : "erro",
            detalhe: r3.ok ? `HTTP ${r3.status} — ${t3?.ok ? "licença OK" : t3?.message || "licença inválida"}` : `HTTP ${r3.status}`,
          });
        }
      } catch (e: unknown) {
        if (cancelled) return;
        setAt(2, { status: "erro", detalhe: `Falha de rede: ${(e as Error).message}` });
      }
      // Teste 4: geração IA
      setAt(3, { status: "executando" });
      try {
        const r4 = await fetch(`${url}/api/planejamento/sugerir.php`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            serie: "8º Ano",
            turma: "A",
            disciplina: "Matemática",
            bimestre: "1",
            habilidades: "Reconhecer e relacionar grandezas proporcionais",
          }),
        });
        if (cancelled) return;
        setAt(3, {
          status: r4.ok ? "ok" : "erro",
          detalhe: r4.ok ? `HTTP ${r4.status} — IA respondendo` : `HTTP ${r4.status}`,
        });
      } catch (e: unknown) {
        if (cancelled) return;
        setAt(3, { status: "erro", detalhe: `Falha de rede: ${(e as Error).message}` });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-xl bg-white rounded-2xl shadow-xl p-8">
        <h1 className="text-2xl font-bold text-emerald-700 mb-1">SiapAI — Diagnóstico de conexão</h1>
        <p className="text-sm text-slate-500 mb-2">
          Servidor testado: <code className="text-xs bg-slate-100 px-1 rounded break-all">{API_BASE || "(não configurado)"}</code>
        </p>
        <p className="text-sm text-slate-600 mb-6">
          Esta página executa exatamente as mesmas requisições que a extensão faz. Se tudo passar aqui, o servidor está
          funcionando e o problema está na sandbox da extensão. Se falhar aqui, o problema é a conexão do seu navegador
          com o servidor (rede, proxy, antivírus ou o servidor "dormindo").
        </p>
        <ul className="space-y-3">
          {tests.map(t => (
            <li key={t.nome} className="flex items-start gap-3 border border-slate-200 rounded-lg p-3">
              <span
                className={
                  "mt-0.5 inline-block h-3 w-3 rounded-full shrink-0 " +
                  (t.status === "ok"
                    ? "bg-emerald-500"
                    : t.status === "erro"
                      ? "bg-red-500"
                      : t.status === "executando"
                        ? "bg-amber-400 animate-pulse"
                        : "bg-slate-300")
                }
              />
              <div>
                <div className="font-medium text-slate-800">{t.nome}</div>
                {t.detalhe && <div className="text-xs text-slate-500 break-all">{t.detalhe}</div>}
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-6 flex items-center justify-between">
          <Link href="/" className="text-sm text-emerald-700 hover:underline">
            ← Voltar para o site
          </Link>
          <button onClick={() => window.location.reload()} className="text-sm px-4 py-2 rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 active:scale-95 transition">
            Repetir testes
          </button>
        </div>
      </div>
    </div>
  );
}
