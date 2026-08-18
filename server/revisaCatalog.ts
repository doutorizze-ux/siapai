export type RevisaContext = {
  serie?: string;
  serie_ano?: string;
  turma?: string;
  disciplina?: string;
  bimestre?: number | string;
};

type Progress = { concluidas: number; ultima: number | null; proxima: number | null; completa: boolean; total: number };
type Activity = { id: number; ordem: number; numero: number; titulo: string; pagina_inicial: number; pagina_final: number };
type Sequence = { id: number; nome: string; titulo: string; pagina_inicial: number; pagina_final: number; atividades: Activity[] };
type PublicCatalog = {
  material: { id: number; titulo: string; edicao: string; serie_ano: number; serie_rotulo: string; nivel: "ano" | "serie"; bimestre: number; ano_letivo: number; fonte_oficial: string };
  componente: { id: number; disciplina: string };
  blocos: Array<{ id: number; titulo: string; sequencias: Sequence[] }>;
};

const OFFICIAL_REVISA_PAGE = "https://goias.gov.br/educacao/revisa-goias/";
const OFFICIAL_3RD_SERIES_PORTUGUESE_FIRST_BIMESTER_PDF = "https://goias.gov.br/educacao/wp-content/uploads/sites/40/2026/02/REVISA-GOIAS-3a-SERIE-LP-E-MAT-1o-BIMESTRE-2026_ESTUDANTE.pdf";

// Metadados de cadernos públicos da SEDUC. O sistema não reproduz conteúdo
// pedagógico: mantém só material, bloco, sequência e intervalo de páginas.
const PUBLIC_9TH_GRADE_PORTUGUESE: PublicCatalog = {
  material: { id: 9003001, titulo: "Revisa Goiás", edicao: "Caderno público 2026", serie_ano: 9, serie_rotulo: "9º Ano", nivel: "ano", bimestre: 3, ano_letivo: 2026, fonte_oficial: OFFICIAL_REVISA_PAGE },
  componente: { id: 90031, disciplina: "LÍNGUA PORTUGUESA" },
  blocos: [{
    id: 9003101, titulo: "Narrativa de Enigma", sequencias: [
      { id: 900310101, nome: "Grupo de Atividades 1", titulo: "Narrativa de Enigma — páginas 2 a 4", pagina_inicial: 2, pagina_final: 4, atividades: [{ id: 90031010101, ordem: 1, numero: 1, titulo: "Grupo de Atividades 1", pagina_inicial: 2, pagina_final: 4 }] },
      { id: 900310102, nome: "Grupo de Atividades 2", titulo: "Narrativa de Enigma — páginas 5 a 10", pagina_inicial: 5, pagina_final: 10, atividades: [{ id: 90031010201, ordem: 1, numero: 2, titulo: "Grupo de Atividades 2", pagina_inicial: 5, pagina_final: 10 }] },
      { id: 900310103, nome: "Grupo de Atividades 3", titulo: "Narrativa de Enigma — páginas 11 a 12", pagina_inicial: 11, pagina_final: 12, atividades: [{ id: 90031010301, ordem: 1, numero: 3, titulo: "Grupo de Atividades 3", pagina_inicial: 11, pagina_final: 12 }] },
    ],
  }],
};

// Fonte: PDF público oficial da SEDUC, 3ª Série, 1º bimestre/2026. Os grupos
// e limites de páginas foram conferidos individualmente no documento de 48 páginas.
const PUBLIC_3RD_SERIES_PORTUGUESE_FIRST_BIMESTER: PublicCatalog = {
  material: { id: 3001001, titulo: "Revisa Goiás — Língua Portuguesa e Matemática", edicao: "3ª Série · 1º bimestre · 2026", serie_ano: 3, serie_rotulo: "3ª Série", nivel: "serie", bimestre: 1, ano_letivo: 2026, fonte_oficial: OFFICIAL_3RD_SERIES_PORTUGUESE_FIRST_BIMESTER_PDF },
  componente: { id: 30011, disciplina: "LÍNGUA PORTUGUESA" },
  blocos: [
    {
      id: 3001101, titulo: "Artigo de Opinião", sequencias: [
        { id: 300110101, nome: "Grupo de Atividades 1", titulo: "Contextualização do artigo de opinião — páginas 2 a 4", pagina_inicial: 2, pagina_final: 4, atividades: [{ id: 30011010101, ordem: 1, numero: 1, titulo: "Grupo de Atividades 1", pagina_inicial: 2, pagina_final: 4 }] },
        { id: 300110102, nome: "Grupo de Atividades 2", titulo: "Ampliação dos conhecimentos — páginas 5 a 6", pagina_inicial: 5, pagina_final: 6, atividades: [{ id: 30011010201, ordem: 1, numero: 2, titulo: "Grupo de Atividades 2", pagina_inicial: 5, pagina_final: 6 }] },
        { id: 300110103, nome: "Grupo de Atividades 3", titulo: "Sistematização e produção — páginas 7 a 8", pagina_inicial: 7, pagina_final: 8, atividades: [{ id: 30011010301, ordem: 1, numero: 3, titulo: "Grupo de Atividades 3", pagina_inicial: 7, pagina_final: 8 }] },
      ],
    },
    {
      id: 3001102, titulo: "Poema", sequencias: [
        { id: 300110201, nome: "Grupo de Atividades 1", titulo: "Contextualização do poema — páginas 9 a 11", pagina_inicial: 9, pagina_final: 11, atividades: [{ id: 30011020101, ordem: 1, numero: 1, titulo: "Grupo de Atividades 1", pagina_inicial: 9, pagina_final: 11 }] },
        { id: 300110202, nome: "Grupo de Atividades 2", titulo: "Ampliação dos conhecimentos — páginas 12 a 13", pagina_inicial: 12, pagina_final: 13, atividades: [{ id: 30011020201, ordem: 1, numero: 2, titulo: "Grupo de Atividades 2", pagina_inicial: 12, pagina_final: 13 }] },
        { id: 300110203, nome: "Grupo de Atividades 3", titulo: "Sistematização dos conhecimentos — páginas 14 a 17", pagina_inicial: 14, pagina_final: 17, atividades: [{ id: 30011020301, ordem: 1, numero: 3, titulo: "Grupo de Atividades 3", pagina_inicial: 14, pagina_final: 17 }] },
      ],
    },
    {
      id: 3001103, titulo: "Revisão final de descritores", sequencias: [
        { id: 300110301, nome: "Questões de revisão", titulo: "Revisão de habilidades linguísticas — páginas 18 a 24", pagina_inicial: 18, pagina_final: 24, atividades: [{ id: 30011030101, ordem: 1, numero: 1, titulo: "Questões de revisão", pagina_inicial: 18, pagina_final: 24 }] },
      ],
    },
  ],
};

const PUBLIC_REVISAS: PublicCatalog[] = [PUBLIC_9TH_GRADE_PORTUGUESE, PUBLIC_3RD_SERIES_PORTUGUESE_FIRST_BIMESTER];

function normalize(value: unknown) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleUpperCase("pt-BR").replace(/[^A-Z0-9]+/g, " ").trim();
}
function gradeFrom(context: RevisaContext) {
  const match = String(context.serie_ano || context.serie || "").match(/\d+/);
  return match ? Number(match[0]) : 0;
}
function bimesterFrom(context: RevisaContext) {
  const match = String(context.bimestre || "").match(/\d+/);
  return match ? Number(match[0]) : 0;
}
function levelFrom(context: RevisaContext): "ano" | "serie" | "" {
  const series = normalize(context.serie_ano || context.serie);
  if (series.includes("SERIE")) return "serie";
  if (series.includes("ANO")) return "ano";
  return "";
}
function contextKey(context: RevisaContext) {
  return [levelFrom(context) || "nivel-nao-informado", gradeFrom(context), normalize(context.disciplina), bimesterFrom(context)].join("|");
}
function findPublicCatalog(context: RevisaContext) {
  const grade = gradeFrom(context);
  const discipline = normalize(context.disciplina);
  const bimester = bimesterFrom(context);
  const level = levelFrom(context);
  return PUBLIC_REVISAS.find((entry) => grade === entry.material.serie_ano && discipline.includes("PORTUGUES") && bimester === entry.material.bimestre && (!level || level === entry.material.nivel)) || null;
}
function unavailableReason(context: RevisaContext) {
  const level = levelFrom(context) === "serie" ? "Série" : levelFrom(context) === "ano" ? "Ano" : "série/ano";
  const grade = gradeFrom(context) || "não identificado";
  const discipline = String(context.disciplina || "disciplina não identificada").trim() || "disciplina não identificada";
  const bimester = bimesterFrom(context) || "não identificado";
  return `Ainda não há um caderno Revisa público catalogado para ${grade}º ${level}, ${discipline}, ${bimester}º bimestre. Materiais já disponíveis: 9º Ano/Língua Portuguesa/3º bimestre e 3ª Série/Língua Portuguesa/1º bimestre.`;
}
function makeProgress(sequence: Sequence, completed: number[]): Progress {
  const finished = new Set(completed.map(Number));
  const ordered = sequence.atividades.slice().sort((a, b) => a.ordem - b.ordem);
  const concluded = ordered.filter((activity) => finished.has(activity.id));
  const next = ordered.find((activity) => !finished.has(activity.id));
  return { concluidas: concluded.length, ultima: concluded.length ? concluded[concluded.length - 1].ordem : null, proxima: next?.ordem ?? null, completa: ordered.length > 0 && concluded.length === ordered.length, total: ordered.length };
}
function catalogEntry(source: PublicCatalog, progressBySequence: Map<number, number[]>) {
  const entry = structuredClone(source);
  const blocoSequences: Array<{ sequencia: Sequence & { atividades_count: number; progresso: Progress } }> = [];
  entry.blocos.forEach((block) => block.sequencias.forEach((sequence) => {
    const progress = makeProgress(sequence, progressBySequence.get(sequence.id) || []);
    const sequenceWithProgress = { ...sequence, atividades_count: sequence.atividades.length, progresso: progress };
    Object.assign(sequence, sequenceWithProgress);
    blocoSequences.push({ sequencia: sequenceWithProgress });
  }));
  return { ...entry, blocoSequences };
}

export async function getPublicRevisaCatalog(context: RevisaContext, loadCompleted: (sequenceId: number, materialId?: number, componentId?: number) => Promise<number[]>) {
  const source = findPublicCatalog(context);
  if (!source) return { disponivel: false, materiais: [], contextKey: contextKey(context), reason: unavailableReason(context) };
  const progressBySequence = new Map<number, number[]>();
  for (const block of source.blocos) for (const sequence of block.sequencias) {
    progressBySequence.set(sequence.id, await loadCompleted(sequence.id, source.material.id, source.componente.id));
  }
  return { disponivel: true, materiais: [catalogEntry(source, progressBySequence)], contextKey: contextKey(context), fonte: { titulo: "Revisa Goiás — fonte oficial", url: source.material.fonte_oficial } };
}

export type RevisaSelection = { material_id?: number; componente_id?: number; bloco_id?: number; sequencia_id?: number; modo_selecao?: string; atividade_inicial_ordem?: number; atividade_final_ordem?: number; pagina_inicial?: number; pagina_final?: number; continuar?: boolean };

export async function getPublicRevisaExcerpt(context: RevisaContext, selection: RevisaSelection, loadCompleted: (sequenceId: number) => Promise<number[]>) {
  const source = findPublicCatalog(context);
  if (!source) throw new Error(unavailableReason(context));
  if (Number(selection.material_id) !== source.material.id || Number(selection.componente_id) !== source.componente.id) throw new Error("O material selecionado não corresponde ao catálogo Revisa disponível para a turma aberta.");
  const block = source.blocos.find((item) => item.id === Number(selection.bloco_id));
  const sequence = block?.sequencias.find((item) => item.id === Number(selection.sequencia_id));
  if (!block || !sequence) throw new Error("Bloco ou sequência Revisa não encontrados.");
  const completed = await loadCompleted(sequence.id);
  const progress = makeProgress(sequence, completed);
  const mode = String(selection.modo_selecao || "sequencia");
  let activities = sequence.atividades.slice();
  let selectedPages: { from: number; to: number } | null = null;
  if (mode === "atividades") {
    const from = Math.max(1, Number(selection.atividade_inicial_ordem) || 1);
    const to = Math.max(from, Number(selection.atividade_final_ordem) || from);
    activities = activities.filter((activity) => activity.ordem >= from && activity.ordem <= to);
  } else if (mode === "paginas") {
    const from = Math.max(sequence.pagina_inicial, Number(selection.pagina_inicial) || sequence.pagina_inicial);
    const to = Math.min(sequence.pagina_final, Math.max(from, Number(selection.pagina_final) || from));
    selectedPages = { from, to };
    activities = activities.filter((activity) => activity.pagina_final >= from && activity.pagina_inicial <= to);
  }
  if (selection.continuar) activities = activities.filter((activity) => !completed.includes(activity.id));
  if (!activities.length) throw new Error(selection.continuar ? "Esta sequência já foi concluída para a turma aberta." : "A seleção do Revisa não contém atividades.");
  const pageFrom = selectedPages?.from ?? Math.min(...activities.map((activity) => activity.pagina_inicial));
  const pageTo = selectedPages?.to ?? Math.max(...activities.map((activity) => activity.pagina_final));
  const referenceCode = `Revisa Goiás — ${source.material.serie_rotulo} — Língua Portuguesa — ${source.material.bimestre}º Bimestre/${source.material.ano_letivo} — ${sequence.nome} — páginas ${pageFrom} a ${pageTo}`;
  return {
    materialId: source.material.id, componenteId: source.componente.id, blocoId: block.id, sequenciaId: sequence.id,
    atividadeIds: activities.map((activity) => activity.id),
    atividades: activities.map((activity) => ({ ...activity, referencias: [{ obrigatorio: true, codigo: referenceCode, texto: referenceCode, url: source.material.fonte_oficial }] })),
    paginas: { from: pageFrom, to: pageTo }, progresso: progress, fonte: { titulo: "Revisa Goiás — fonte oficial", url: source.material.fonte_oficial },
  };
}

export function isPublicRevisaMaterial(materialId: number, componentId: number) {
  return PUBLIC_REVISAS.some((entry) => entry.material.id === materialId && entry.componente.id === componentId);
}
