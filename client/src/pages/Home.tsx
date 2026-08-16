import { useEffect, useState } from "react";
import { Link } from "wouter";
import { CheckCircle2, Loader2, Rocket, CalendarCheck, BookOpenCheck, Copy, Star, Award, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

const FEATURES = [
  {
    icon: Rocket,
    title: "Planejamento com IA",
    desc: "Selecione turma, disciplina e bimestre. A IA lê as habilidades do SIAP e gera objetivos, conteúdos, metodologias e avaliações completos — e aplica cada aula automaticamente.",
  },
  {
    icon: Copy,
    title: "Replicar para outras turmas",
    desc: "Copie o planejamento gerado para outras turmas do mesmo nível em poucos cliques, sem retrabalho.",
  },
  {
    icon: BookOpenCheck,
    title: "Conteúdo personalizado",
    desc: "Digite um tema ou envie seu roteiro de aula em texto. A IA preenche os campos do SIAP com base no seu conteúdo — incluindo o modo Revisa, que reescreve materiais incompatíveis.",
  },
  {
    icon: CalendarCheck,
    title: "Frequência automática",
    desc: "A extensão percorre o calendário de frequência do SIAP, valida o dia e registra presença/ausência automaticamente — com salvamento em lote por mês.",
  },
  {
    icon: Star,
    title: "Conteúdo programático",
    desc: "Lance o conteúdo ministrado e materiais de apoio dia a dia, com detecção automática de múltiplas aulas e reclique em caso de instabilidade do SIAP.",
  },
  {
    icon: ShieldCheck,
    title: "PEI com IA",
    desc: "Gere o PEI (Plano Educacional Individualizado) automaticamente: potencialidades, expectativas, necessidades e estratégias — preenchido no SIAP em um clique.",
  },
];

const FAQS = [
  {
    q: "O acesso é vitalício?",
    a: "O acesso vale até 31/12 do ano corrente (ciclo anual). É um pagamento único, sem mensalidade: se você renovar no próximo ano, paga apenas o valor vigente.",
  },
  {
    q: "Como instalo a extensão?",
    a: "Após a confirmação do pagamento, você recebe por e-mail seu código de acesso (formato PP-XXXXXXXX). Baixe o arquivo da extensão e carregue no Chrome/Edge em modo desenvolvedor. Ao abrir o SIAP, a extensão pede seu e-mail cadastrado, valida automaticamente no servidor e libera todos os módulos."
  },
  {
    q: "Preciso deixar o computador ligado durante a execução?",
    a: "Sim. A extensão funciona no seu navegador: inicie a execução (planejamento, frequência ou conteúdo) e acompanhe a barra de progresso. O painel cuida de tudo automaticamente.",
  },
  {
    q: "Funciona em qualquer rede de ensino com SIAP?",
    a: "O SIAP tem versões e layouts diferentes entre secretarias de educação. A extensão foi construída para os elementos mais comuns e os seletores são calibrados conforme a sua rede — consulte o suporte em caso de dúvidas.",
  },
  {
    q: "É seguro? A extensão vê minhas senhas?",
    a: "A extensão apenas preenche os campos da página do SIAP, como qualquer ferramenta de automação. Não armazenamos senhas do SIAP em lugar nenhum.",
  },
];

function Header() {
  return (
    <header className="sticky top-0 z-50 border-b bg-background/85 backdrop-blur">
      <div className="container flex h-14 items-center justify-between">
        <a href="#" className="flex items-center gap-2 font-extrabold text-lg tracking-tight text-primary">
          <img src="/manus-storage/siapai-logo-transparent_04b775c0.png" alt="SiapAI" className="h-8 w-8 rounded-lg" />
          SiapAI
        </a>
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-muted-foreground">
          <a href="#funcionalidades">Funcionalidades</a>
          <a href="#como-funciona">Como funciona</a>
          <a href="#preco">Preço</a>
          <a href="#faq">FAQ</a>
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/validar">
            <Button variant="ghost" size="sm" className="hidden sm:inline-flex">
              Validar licença
            </Button>
          </Link>
          <Link href="#preco">
            <Button size="sm">Quero começar</Button>
          </Link>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/8 via-transparent to-accent/60" />
      <div className="container relative py-16 md:py-24 grid lg:grid-cols-2 gap-10 items-center">
        <div className="animate-in">
          <span className="inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground mb-5">
            <ShieldCheck className="h-3.5 w-3.5" />
            Funciona no Chrome e Edge · Pagamento único
          </span>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight leading-[1.1]">
            A burocracia do SIAP, resolvida em <span className="text-primary">minutos</span>, não em dias.
          </h1>
          <p className="mt-5 text-lg text-muted-foreground max-w-xl">
            O SiapAI é uma extensão para o navegador que gera seu planejamento com IA e preenche o SIAP
            automaticamente — aulas, frequência, conteúdo programático e PEI.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="#preco">
              <Button size="lg" className="text-base px-7">
                Começar agora
              </Button>
            </Link>
            <a href="#funcionalidades">
              <Button size="lg" variant="outline" className="text-base px-7 bg-background">
                Ver como funciona
              </Button>
            </a>
          </div>
          <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-primary" /> Acesso até 31/12</span>
            <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-primary" /> Sem mensalidade</span>
            <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-primary" /> Liberação automática via Pix</span>
          </div>
        </div>
        <div className="relative animate-in [animation-delay:120ms]">
          <img
            src="/manus-storage/planejapro-hero_6660a013.png"
            alt="Painel SiapAI no SIAP"
            className="rounded-2xl border shadow-xl w-full"
          />
        </div>
      </div>
    </section>
  );
}

function Features() {
  return (
    <section id="funcionalidades" className="py-16 md:py-24 scroll-mt-14">
      <div className="container">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight">Tudo que você perde horas fazendo</h2>
          <p className="mt-3 text-muted-foreground text-lg">
            O painel lateral do SiapAI cuida do trabalho repetitivo enquanto você foca nos alunos.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map((f, i) => (
            <div
              key={f.title}
              className="rounded-2xl border bg-card p-6 shadow-sm transition-shadow hover:shadow-md animate-in"
              style={{ animationDelay: `${i * 60}ms` }}>
              <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                <f.icon className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-bold text-lg">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
        <div className="mt-14 rounded-2xl overflow-hidden border shadow-lg">
          <img src="/manus-storage/planejapro-features_68bf4564.png" alt="Funcionalidades do SiapAI" className="w-full" />
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    { step: "1", title: "Faça o pagamento via Pix", desc: "Pagamento único com liberação automática. Você recebe seu código de acesso na hora." },
    { step: "2", title: "Instale a extensão no Chrome/Edge", desc: "Carregue o arquivo da extensão no navegador (leva 1 minuto) e ative seu código de licença." },
    { step: "3", title: "Abra o SIAP e clique em executar", desc: "O painel lateral aparece no próprio SIAP. Escolha a tarefa, selecione turmas e meses e deixe o robô trabalhar." },
  ];
  return (
    <section id="como-funciona" className="py-16 md:py-24 bg-secondary/50 scroll-mt-14">
      <div className="container">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight">Do pagamento à execução em 3 passos</h2>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {steps.map((s, i) => (
            <div key={s.step} className="relative rounded-2xl bg-card border p-6 shadow-sm animate-in" style={{ animationDelay: `${i * 80}ms` }}>
              <span className="text-5xl font-extrabold text-primary/15 absolute right-5 top-3">{s.step}</span>
              <h3 className="font-bold text-lg mt-2">{s.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Pricing() {
  const { data, isLoading } = trpc.commerce.productInfo.useQuery();
  const price = data ? (data.priceCents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "59,90";

  return (
    <section id="preco" className="py-16 md:py-24 scroll-mt-14">
      <div className="container max-w-lg mx-auto">
        <div className="text-center mb-8">
          <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight">Um pagamento único, sem mensalidade</h2>
          <p className="mt-3 text-muted-foreground">
            Pague uma vez e use o ano inteiro. Liberação automática após a confirmação do Pix.
          </p>
        </div>
        <div className="rounded-3xl border bg-card shadow-lg overflow-hidden">
          <div className="bg-gradient-to-br from-primary to-[#0a8f78] p-6 text-primary-foreground">
            <p className="text-sm font-semibold opacity-90">{data?.name ?? "SiapAI"} · Acesso anual</p>
            <p className="mt-3 flex items-baseline gap-2">
              <span className="text-5xl font-extrabold tracking-tight">
                {isLoading ? <Loader2 className="h-10 w-10 animate-spin" /> : `R$ ${price}`}
              </span>
            </p>
            <p className="mt-2 text-sm opacity-90">
              {data?.description ?? "Acesso ao SiapAI até 31/12. Pagamento único, sem mensalidade."}
            </p>
          </div>
          <ul className="p-6 space-y-3">
            {[
              "Planejamento com IA aplicado automaticamente",
              "Frequência de aulas automática (por mês)",
              "Conteúdo programático em lote",
              "PEI completo gerado por IA",
              "Reclique automático contra instabilidade do SIAP",
              "Ativação pelo seu e-mail de cadastro",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-sm">
                <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                {item}
              </li>
            ))}
          </ul>
          <div className="px-6 pb-6">
            <Link href="/checkout">
              <Button size="lg" className="w-full text-base">
                Comprar agora — Pix QR Code
              </Button>
            </Link>
            <p className="mt-3 text-xs text-center text-muted-foreground">
              Liberação automática em até 2 minutos após a confirmação do pagamento.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function Faq() {
  return (
    <section id="faq" className="py-16 md:py-24 bg-secondary/50 scroll-mt-14">
      <div className="container max-w-2xl mx-auto">
        <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-center mb-10">Perguntas frequentes</h2>
        <div className="space-y-4">
          {FAQS.map((f) => (
            <details key={f.q} className="group rounded-2xl border bg-card shadow-sm open:shadow-md transition-shadow">
              <summary className="flex cursor-pointer items-center justify-between p-5 font-semibold list-none">
                {f.q}
                <span className="text-primary text-xl leading-none transition-transform group-open:rotate-45">+</span>
              </summary>
              <div className="px-5 pb-5 text-sm text-muted-foreground leading-relaxed">{f.a}</div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t py-8">
      <div className="container flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-2 font-semibold text-foreground">
          <img src="/manus-storage/siapai-logo-transparent_04b775c0.png" alt="" className="h-6 w-6 rounded" />
          SiapAI
        </span>
        <div className="flex items-center gap-5">
          <Link href="/validar">Validar licença</Link>
          <Link href="/checkout">Comprar</Link>
          <span>© {new Date().getFullYear()} SiapAI</span>
        </div>
      </div>
    </footer>
  );
}

export default function Home() {
  const [, navigate] = useState(0);
  useEffect(() => {
    void navigate;
  }, []);
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <Hero />
        <Features />
        <HowItWorks />
        <Pricing />
        <Faq />
      </main>
      <Footer />
    </div>
  );
}
