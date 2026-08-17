export type RevisaContext = {
  serie?: string;
  serie_ano?: string;
  turma?: string;
  disciplina?: string;
  bimestre?: number | string;
};

type Progress = {
  concluidas: number;
  ultima: number | null;
  proxima: number | null;
  completa: boolean;
  total: number;
};

type Activity = {
  id: number;
  ordem: number;
  numero: number;
  titulo: string;
  pagina_inicial: number;
  pagina_final: number;
};

type Sequence = {
  id: number;
  nome: string;
  titulo: string;
  pagina_inicial: number;
  pagina_final: number;
  atividades: Activity[];
};

const OFFICIAL_REVISa_PAGE = "https://goias.gov.br/educacao/revisa-goias/";

// Metadados extraídos do caderno público Revisa Goiás — 9º Ano — 3º Bimestre/2026.
// Não há reprodução do texto pedagógico do caderno: somente títulos, grupos e páginas
// para que o professor escolha a parte a ser considerada na geração.
const PUBLIC_9TH_GRADE_PORTUGUESE = {
  material: {
    id: 9003001,
    titulo: "Revisa Goiás",
    edicao: "Caderno público 2026",
    serie_ano: 9,
    serie_rotulo: "9º Ano",
    bimestre: 3,
    ano_letivo: 2026,
    fonte_oficial: OFFICIAL_REVISa_PAGE,
  },
  componente: { id: 90031, disciplina: "LÍNGUA PORTUGUESA" },
  blocos: [
    {
      id: 9003101,
      titulo: "Narrativa de Enigma",
      sequencias: [
        {
          id: 900310101,
          nome: "Grupo de Atividades 1",
          titulo: "Narrativa de Enigma — páginas 2 a 4",
          pagina_inicial: 2,
          pagina_final: 4,
          atividades: [{ id: 90031010101, ordem: 1, numero: 1, titulo: "Grupo de Atividades 1", pagina_inicial: 2, pagina_final: 4 }],
        },
        {
          id: 900310102,
          nome: "Grupo de Atividades 2",
          titulo: "Narrativa de Enigma — páginas 5 a 10",
          pagina_inicial: 5,
          pagina_final: 10,
          atividades: [{ id: 90031010201, ordem: 1, numero: 2, titulo: "Grupo de Atividades 2", pagina_inicial: 5, pagina_final: 10 }],
        },
        {
          id: 900310103,
          nome: "Grupo de Atividades 3",
          titulo: "Narrativa de Enigma — páginas 11 a 12",
          pagina_inicial: 11,
          pagina_final: 12,
          atividades: [{ id: 90031010301, ordem: 1, numero: 3, titulo: "Grupo de Atividades 3", pagina_inicial: 11, pagina_final: 12 }],
        },
      ] as Sequence[],
    },
  ],
};

function normalize(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleUpperCase("pt-BR")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

function gradeFrom(context: RevisaContext) {
  const match = String(context.serie_ano || context.serie || "").match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function bimesterFrom(context: RevisaContext) {
  const match = String(context.bimestre || "").match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function compatible(context: RevisaContext) {
  const grade = gradeFrom(context);
  const discipline = normalize(context.disciplina);
  const bimester = bimesterFrom(context);
  return grade === 9 && discipline.includes("PORTUGUES") && bimester === 3;
}

function makeProgress(sequence: Sequence, completed: number[]): Progress {
  const finished = new Set(completed.map(Number));
  const ordered = sequence.atividades.slice().sort((a, b) => a.ordem - b.ordem);
  const concluded = ordered.filter((activity) => finished.has(activity.id));
  const next = ordered.find((activity) => !finished.has(activity.id));
  return {
    concluidas: concluded.length,
    ultima: concluded.length ? concluded[concluded.length - 1].ordem : null,
    proxima: next?.ordem ?? null,
    completa: ordered.length > 0 && concluded.length === ordered.length,
    total: ordered.length,
  };
}

function catalogEntry(progressBySequence: Map<number, number[]>) {
  const entry = structuredClone(PUBLIC_9TH_GRADE_PORTUGUESE);
  const blocoSequences: Array<{ sequencia: Sequence & { atividades_count: number; progresso: Progress } }> = [];
  entry.blocos.forEach((block) => {
    block.sequencias.forEach((sequence) => {
      const progress = makeProgress(sequence, progressBySequence.get(sequence.id) || []);
      const sequenceWithProgress = { ...sequence, atividades_count: sequence.atividades.length, progresso: progress };
      Object.assign(sequence, sequenceWithProgress);
      blocoSequences.push({ sequencia: sequenceWithProgress });
    });
  });
  return { ...entry, blocoSequences };
}

export async function getPublicRevisaCatalog(
  context: RevisaContext,
  loadCompleted: (sequenceId: number) => Promise<number[]>,
) {
  if (!compatible(context)) {
    return {
      disponivel: false,
      materiais: [],
      contextKey: [gradeFrom(context), normalize(context.disciplina), bimesterFrom(context)].join("|"),
      reason: "O catálogo público inicial do Revisa está disponível para 9º ano, Língua Portuguesa, 3º bimestre. Os demais cadernos serão incluídos a partir das fontes oficiais.",
    };
  }
  const progressBySequence = new Map<number, number[]>();
  for (const block of PUBLIC_9TH_GRADE_PORTUGUESE.blocos) {
    for (const sequence of block.sequencias) {
      progressBySequence.set(sequence.id, await loadCompleted(sequence.id));
    }
  }
  return {
    disponivel: true,
    materiais: [catalogEntry(progressBySequence)],
    contextKey: [gradeFrom(context), normalize(context.disciplina), bimesterFrom(context)].join("|"),
    fonte: { titulo: "Revisa Goiás — portal oficial", url: OFFICIAL_REVISa_PAGE },
  };
}

export type RevisaSelection = {
  material_id?: number;
  componente_id?: number;
  bloco_id?: number;
  sequencia_id?: number;
  modo_selecao?: string;
  atividade_inicial_ordem?: number;
  atividade_final_ordem?: number;
  pagina_inicial?: number;
  pagina_final?: number;
  continuar?: boolean;
};

export async function getPublicRevisaExcerpt(
  context: RevisaContext,
  selection: RevisaSelection,
  loadCompleted: (sequenceId: number) => Promise<number[]>,
) {
  if (!compatible(context)) throw new Error("Não há material Revisa público compatível com a turma aberta.");
  if (Number(selection.material_id) !== PUBLIC_9TH_GRADE_PORTUGUESE.material.id || Number(selection.componente_id) !== PUBLIC_9TH_GRADE_PORTUGUESE.componente.id) {
    throw new Error("O material selecionado não corresponde ao catálogo Revisa disponível.");
  }
  const block = PUBLIC_9TH_GRADE_PORTUGUESE.blocos.find((item) => item.id === Number(selection.bloco_id));
  const sequence = block?.sequencias.find((item) => item.id === Number(selection.sequencia_id));
  if (!block || !sequence) throw new Error("Bloco ou sequência Revisa não encontrados.");

  const completed = await loadCompleted(sequence.id);
  const progress = makeProgress(sequence, completed);
  const mode = String(selection.modo_selecao || "sequencia");
  let activities = sequence.atividades.slice();
  if (mode === "atividades") {
    const from = Math.max(1, Number(selection.atividade_inicial_ordem) || 1);
    const to = Math.max(from, Number(selection.atividade_final_ordem) || from);
    activities = activities.filter((activity) => activity.ordem >= from && activity.ordem <= to);
  } else if (mode === "paginas") {
    const from = Math.max(1, Number(selection.pagina_inicial) || sequence.pagina_inicial);
    const to = Math.max(from, Number(selection.pagina_final) || from);
    activities = activities.filter((activity) => activity.pagina_final >= from && activity.pagina_inicial <= to);
  }
  if (selection.continuar) activities = activities.filter((activity) => !completed.includes(activity.id));
  if (!activities.length) throw new Error(selection.continuar ? "Esta sequência já foi concluída para a turma aberta." : "A seleção do Revisa não contém atividades.");

  const pageFrom = Math.min(...activities.map((activity) => activity.pagina_inicial));
  const pageTo = Math.max(...activities.map((activity) => activity.pagina_final));
  const referenceCode = `Revisa Goiás — 9º Ano — Língua Portuguesa — 3º Bimestre/2026 — ${sequence.nome} — páginas ${pageFrom} a ${pageTo}`;
  return {
    materialId: PUBLIC_9TH_GRADE_PORTUGUESE.material.id,
    componenteId: PUBLIC_9TH_GRADE_PORTUGUESE.componente.id,
    blocoId: block.id,
    sequenciaId: sequence.id,
    atividadeIds: activities.map((activity) => activity.id),
    atividades: activities.map((activity) => ({
      ...activity,
      referencias: [{ obrigatorio: true, codigo: referenceCode, texto: referenceCode, url: OFFICIAL_REVISa_PAGE }],
    })),
    paginas: { from: pageFrom, to: pageTo },
    progresso: progress,
    fonte: { titulo: "Revisa Goiás — portal oficial", url: OFFICIAL_REVISa_PAGE },
  };
}

export function isPublicRevisaMaterial(materialId: number, componentId: number) {
  return materialId === PUBLIC_9TH_GRADE_PORTUGUESE.material.id && componentId === PUBLIC_9TH_GRADE_PORTUGUESE.componente.id;
}
