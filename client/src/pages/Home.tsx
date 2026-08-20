import { useEffect, useState } from "react";
import { Link } from "wouter";
import { CheckCircle2, Loader2, Rocket, CalendarCheck, BookOpenCheck, Copy, Star, Award, ShieldCheck, FileCheck2, ScanLine, ListChecks, MousePointerClick, ClipboardCheck, Trophy, FileText, Sparkles, PlayCircle, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

const CHROME_WEB_STORE_URL = "https://chromewebstore.google.com/detail/dcifappjgnkilhdiefljlooinnpeakmh";

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
  {
    icon: FileCheck2,
    title: "Correção de avaliações",
    desc: "Envie o gabarito e as folhas numeradas. A IA monta uma prévia auditável de cada aluno para você conferir antes de preencher a grade do SIAP.",
  },
];

const MODULE_SHOWCASE = [
  { icon: Sparkles, label: "PLANEJAMENTO E REVISA", title: "Planeje aulas com apoio da IA SiapAI", desc: "Defina a quantidade de aulas, informe o conteúdo ou envie um roteiro. O painel reúne opções para gerar planejamentos e aplicar as próximas aulas no SIAP.", image: "/images/siapai-modulos/planejamento-revisa.png", alt: "Tela do módulo de planejamento com Revisa do SiapAI" },
  { icon: ClipboardCheck, label: "CORREÇÃO DE AVALIAÇÕES", title: "Leia o gabarito e monte uma prévia segura", desc: "Envie o gabarito e as folhas numeradas para organizar a prévia da turma antes de preencher a grade no SIAP.", image: "/images/siapai-modulos/correcao-avaliacoes.png", alt: "Tela do módulo de correção de avaliações do SiapAI" },
  { icon: CalendarCheck, label: "FREQUÊNCIA AUTOMÁTICA", title: "Escolha os meses e acompanhe a execução", desc: "Marque somente os períodos que deseja executar, acompanhe o status e mantenha o controle do que já foi concluído.", image: "/images/siapai-modulos/frequencia-automatica.png", alt: "Tela do módulo de frequência automática do SiapAI" },
  { icon: FileText, label: "CONTEÚDO PROGRAMÁTICO", title: "Organize conteúdos e materiais de apoio", desc: "Selecione os meses, escolha os materiais utilizados e execute o lançamento do conteúdo programático no seu ritmo.", image: "/images/siapai-modulos/conteudo-programatico.png", alt: "Tela do módulo de conteúdo programático do SiapAI" },
  { icon: ShieldCheck, label: "PEI COM IA", title: "Gere o PEI a partir do contexto pedagógico", desc: "Confira os dados identificados, inclua orientações quando quiser e gere uma proposta de Plano Educacional Individualizado no painel.", image: "/images/siapai-modulos/pei-com-ia.png", alt: "Tela do módulo PEI com IA do SiapAI" },
  { icon: Trophy, label: "RANKING POR BLOCOS", title: "Consolide os resultados por disciplina", desc: "Selecione a modalidade de avaliação, capture os relatórios das disciplinas e monte um ranking bimestral organizado.", image: "/images/siapai-modulos/ranking-blocos.png", alt: "Tela do módulo Ranking por Blocos do SiapAI" },
];

const FAQS = [
  {
    q: "O acesso é vitalício?",
    a: "Não. O plano é semestral por calendário: compras confirmadas de janeiro a junho valem até 30/06; compras confirmadas de julho a dezembro valem até 31/12. É pagamento único, sem mensalidade.",
  },
  {
    q: "Como instalo a extensão?",
    a: "Instale pelo botão disponível na Chrome Web Store. Depois da confirmação do pagamento, abra o SIAP e informe seu e-mail cadastrado para validar a licença e liberar os módulos."
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
          <img src="https://files.manuscdn.com/user_upload_by_module/session_file/310519663876770025/prWiYtCFZbRhSEqO.webp" alt="SiapAI" className="h-8 w-8 rounded-lg" />
          SiapAI
        </a>
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-muted-foreground">
          <a href="#funcionalidades">Funcionalidades</a>
          <a href="#modulos">Módulos</a>
          <a href="#tutoriais">Tutoriais</a>
          <a href="#como-funciona">Como funciona</a>
          <a href="#correcao-avaliacoes">Correção de avaliações</a>
          <a href="#preco">Preço</a>
          <a href="#faq">FAQ</a>
        </nav>
        <div className="flex items-center gap-2">
          <a href={CHROME_WEB_STORE_URL} target="_blank" rel="noreferrer" className="hidden lg:inline-flex">
            <Button variant="outline" size="sm">Instalar extensão ↗</Button>
          </a>
          <Link href="/validar">
            <Button variant="ghost" size="sm" className="hidden sm:inline-flex">
              Validar licença
            </Button>
          </Link>
          <a href="#preco">
            <Button size="sm">Quero começar</Button>
          </a>
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
            automaticamente — aulas, frequência, conteúdo programático, PEI e a prévia segura para correção de avaliações.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <a href="#preco">
              <Button size="lg" className="text-base px-7">
                Começar agora
              </Button>
            </a>
            <a href={CHROME_WEB_STORE_URL} target="_blank" rel="noreferrer">
              <Button size="lg" variant="outline" className="text-base px-7 bg-background">
                Instalar no Chrome ↗
              </Button>
            </a>
            <a href="#funcionalidades">
              <Button size="lg" variant="ghost" className="text-base px-7">
                Ver como funciona
              </Button>
            </a>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">Já tem licença? Instale pela Chrome Web Store e entre no SIAP com seu e-mail cadastrado.</p>
          <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-primary" /> Validade por semestre</span>
            <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-primary" /> Sem mensalidade</span>
            <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-primary" /> Liberação automática via Pix</span>
          </div>
        </div>
        <div className="relative animate-in [animation-delay:120ms]">
          <img
            src="https://files.manuscdn.com/user_upload_by_module/session_file/310519663876770025/WhDZasVBwXINZLDH.webp"
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
          <img src="https://files.manuscdn.com/user_upload_by_module/session_file/310519663876770025/HHXsTRYnORWweGea.webp" alt="Funcionalidades do SiapAI" className="w-full" />
        </div>
      </div>
    </section>
  );
}

function ModuleShowcase() {
  return (
    <section id="modulos" className="scroll-mt-14 border-y bg-gradient-to-b from-primary/5 via-background to-background py-16 md:py-24">
      <div className="container">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary"><Sparkles className="h-3.5 w-3.5" /> Conheça os módulos na prática</span>
          <h2 className="mt-4 text-3xl font-extrabold tracking-tight md:text-4xl">Tudo o que você precisa para trabalhar no SIAP, em um só painel</h2>
          <p className="mt-3 text-lg text-muted-foreground">Veja telas reais da extensão SiapAI e entenda como cada módulo apoia sua rotina pedagógica.</p>
        </div>
        <div className="mt-12 grid gap-7 md:grid-cols-2 lg:grid-cols-3">
          {MODULE_SHOWCASE.map((module, index) => {
            const Icon = module.icon;
            return (
              <article key={module.title} className="group overflow-hidden rounded-3xl border bg-card shadow-sm transition-shadow hover:shadow-lg">
                <div className="relative flex min-h-[290px] items-center justify-center overflow-hidden bg-gradient-to-br from-primary/10 to-secondary p-5">
                  <img src={module.image} alt={module.alt} className="max-h-[430px] w-auto max-w-full rounded-2xl border border-primary/10 shadow-xl transition-transform duration-300 group-hover:scale-[1.02]" loading={index > 1 ? "lazy" : "eager"} />
                </div>
                <div className="p-6">
                  <div className="flex items-center gap-2 text-xs font-bold tracking-wider text-primary"><Icon className="h-4 w-4" /> {module.label}</div>
                  <h3 className="mt-3 text-xl font-extrabold tracking-tight">{module.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{module.desc}</p>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function Tutorials() {
  const { data: tutorials, isLoading } = trpc.commerce.tutorials.useQuery();

  if (!isLoading && (!tutorials || tutorials.length === 0)) return null;

  return (
    <section id="tutoriais" className="scroll-mt-14 bg-secondary/45 py-16 md:py-24">
      <div className="container">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-background px-3 py-1 text-xs font-bold tracking-wide text-primary"><Video className="h-3.5 w-3.5" /> APRENDA PASSO A PASSO</span>
          <h2 className="mt-4 text-3xl font-extrabold tracking-tight md:text-4xl">Tutoriais para usar o SiapAI com segurança</h2>
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">Assista aos vídeos e acompanhe cada etapa antes de executar no SIAP.</p>
        </div>
        {isLoading ? (
          <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((item) => <div key={item} className="overflow-hidden rounded-3xl border bg-card p-4"><div className="aspect-video animate-pulse rounded-2xl bg-muted" /><div className="mt-5 h-5 w-3/4 animate-pulse rounded bg-muted" /><div className="mt-3 h-4 w-full animate-pulse rounded bg-muted" /></div>)}
          </div>
        ) : (
          <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {tutorials?.map((tutorial) => (
              <article key={tutorial.id} className="overflow-hidden rounded-3xl border bg-card shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-xl">
                <div className="relative aspect-video bg-black">
                  <iframe className="absolute inset-0 h-full w-full" src={`https://www.youtube-nocookie.com/embed/${tutorial.youtubeVideoId}`} title={tutorial.title} loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen />
                </div>
                <div className="p-6">
                  <div className="flex items-center gap-2 text-sm font-bold text-primary"><PlayCircle className="h-4 w-4" /> Tutorial SiapAI</div>
                  <h3 className="mt-3 text-xl font-extrabold tracking-tight">{tutorial.title}</h3>
                  {tutorial.description && <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{tutorial.description}</p>}
                  <a href={tutorial.youtubeUrl} target="_blank" rel="noreferrer" className="mt-5 inline-flex items-center gap-1.5 text-sm font-bold text-primary hover:underline">Assistir no YouTube ↗</a>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    { step: "1", title: "Faça o pagamento via Pix", desc: "Pagamento único com liberação automática. Você recebe seu código de acesso na hora." },
    { step: "2", title: "Instale pela Chrome Web Store", desc: "Use o botão de instalação, adicione a extensão ao Chrome e ative-a com o seu e-mail de licença." },
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

function GradeCorrection() {
  const steps = [
    { icon: FileCheck2, title: "1. Envie o gabarito", desc: "Envie a foto do gabarito da avaliação. O módulo identifica as respostas corretas das questões." },
    { icon: ScanLine, title: "2. Envie as folhas numeradas", desc: "Envie as folhas de resposta dos alunos com o número escrito no campo Nº. É possível enviar até 60 por vez." },
    { icon: ListChecks, title: "3. Revise a prévia", desc: "O SiapAI mostra os acertos por aluno. Folhas com número ilegível, marcação ambígua ou resposta incompleta ficam sinalizadas para conferência." },
    { icon: MousePointerClick, title: "4. Preencha com sua confirmação", desc: "Depois da revisão, use “Preencher grade pela prévia”. O módulo marca a grade e as presenças necessárias, mas não salva o formulário do SIAP automaticamente." },
  ];

  return (
    <section id="correcao-avaliacoes" className="py-16 md:py-24 scroll-mt-14">
      <div className="container">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary"><Award className="h-3.5 w-3.5" /> Novo módulo SiapAI</span>
          <h2 className="mt-4 text-3xl md:text-4xl font-extrabold tracking-tight">Correção de avaliações com prévia segura</h2>
          <p className="mt-3 text-lg text-muted-foreground">Transforme gabaritos e folhas numeradas em uma prévia conferível antes de lançar as notas no SIAP.</p>
        </div>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return <article key={step.title} className="rounded-2xl border bg-card p-6 shadow-sm">
              <div className="mb-5 flex items-center justify-between"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10"><Icon className="h-6 w-6 text-primary" /></div><span className="text-sm font-bold text-primary/50">0{index + 1}</span></div>
              <h3 className="font-bold text-lg">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.desc}</p>
            </article>;
          })}
        </div>
        <p className="mx-auto mt-6 max-w-3xl rounded-xl border border-primary/20 bg-primary/5 p-4 text-center text-sm text-foreground"><strong>Você continua no controle:</strong> o módulo nunca inventa respostas nem salva o SIAP sem a sua confirmação final.</p>
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
            Pague uma vez e use até o fim do semestre-calendário. Liberação automática após a confirmação do Pix.
          </p>
        </div>
        <div className="rounded-3xl border bg-card shadow-lg overflow-hidden">
          <div className="bg-gradient-to-br from-primary to-[#0a8f78] p-6 text-primary-foreground">
            <p className="text-sm font-semibold opacity-90">{data?.name ?? "SiapAI"} · Plano semestral</p>
            <p className="mt-3 flex items-baseline gap-2">
              <span className="text-5xl font-extrabold tracking-tight">
                {isLoading ? <Loader2 className="h-10 w-10 animate-spin" /> : `R$ ${price}`}
              </span>
            </p>
            <p className="mt-2 text-sm opacity-90">
              Plano semestral com validade até o fim do semestre de confirmação do pagamento.
            </p>
          </div>
          <ul className="p-6 space-y-3">
            {[
              "Planejamento com IA aplicado automaticamente",
              "Frequência de aulas automática (por mês)",
              "Conteúdo programático em lote",
              "PEI completo gerado por IA",
              "Correção de avaliações com prévia auditável",
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
          <img src="https://files.manuscdn.com/user_upload_by_module/session_file/310519663876770025/prWiYtCFZbRhSEqO.webp" alt="" className="h-6 w-6 rounded" />
          SiapAI
        </span>
        <div className="flex items-center gap-5">
          <a href={CHROME_WEB_STORE_URL} target="_blank" rel="noreferrer">Instalar extensão</a>
          <a href="#tutoriais">Tutoriais</a>
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
        <ModuleShowcase />
        <Tutorials />
        <HowItWorks />
        <GradeCorrection />
        <Pricing />
        <Faq />
      </main>
      <Footer />
    </div>
  );
}
