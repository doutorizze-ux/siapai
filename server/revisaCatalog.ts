import { OFFICIAL_REVISAS } from './revisaOfficialCatalog.generated';

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
  material: {
    id: number;
    titulo: string;
    edicao: string;
    serie_ano: number;
    serie_rotulo: string;
    nivel: 'ano' | 'serie';
    bimestre: number;
    ano_letivo: number;
    fonte_oficial: string;
    arquivo_oficial?: string;
  };
  componente: { id: number; disciplina: string; aliases?: readonly string[] };
  blocos: Array<{ id: number; titulo: string; sequencias: Sequence[] }>;
};

// Gerado exclusivamente dos metadados estruturais de PDFs públicos da SEDUC.
// Não há reprodução de texto pedagógico protegido no catálogo.
const PUBLIC_REVISAS = OFFICIAL_REVISAS as unknown as PublicCatalog[];

function normalize(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleUpperCase('pt-BR')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function gradeFrom(context: RevisaContext) {
  const match = String(context.serie_ano || context.serie || '').match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function bimesterFrom(context: RevisaContext) {
  const match = String(context.bimestre || '').match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function levelFrom(context: RevisaContext): 'ano' | 'serie' | '' {
  const series = normalize(context.serie_ano || context.serie);
  if (series.includes('SERIE')) return 'serie';
  if (series.includes('ANO')) return 'ano';
  return '';
}

function contextKey(context: RevisaContext) {
  return [levelFrom(context) || 'nivel-nao-informado', gradeFrom(context), normalize(context.disciplina), bimesterFrom(context)].join('|');
}

function matchesDiscipline(entry: PublicCatalog, received: string) {
  const discipline = normalize(received);
  if (!discipline) return false;
  const aliases = [entry.componente.disciplina, ...(entry.componente.aliases || [])].map(normalize);
  if (aliases.includes(discipline)) return true;
  return aliases.some((alias) => alias.includes(' ') && (discipline.includes(alias) || alias.includes(discipline)));
}

function findPublicCatalog(context: RevisaContext) {
  const grade = gradeFrom(context);
  const bimester = bimesterFrom(context);
  const level = levelFrom(context);
  return PUBLIC_REVISAS.find((entry) => (
    grade === entry.material.serie_ano
    && bimester === entry.material.bimestre
    && (!level || level === entry.material.nivel)
    && matchesDiscipline(entry, context.disciplina || '')
  )) || null;
}

function availableMaterialsLabel() {
  return PUBLIC_REVISAS
    .map((entry) => `${entry.material.serie_rotulo}/${entry.componente.disciplina}/${entry.material.bimestre}º bimestre`)
    .sort((a, b) => a.localeCompare(b, 'pt-BR'))
    .join('; ');
}

function unavailableReason(context: RevisaContext) {
  const level = levelFrom(context) === 'serie' ? 'Série' : levelFrom(context) === 'ano' ? 'Ano' : 'série/ano';
  const grade = gradeFrom(context) || 'não identificado';
  const discipline = String(context.disciplina || 'disciplina não identificada').trim() || 'disciplina não identificada';
  const bimester = bimesterFrom(context) || 'não identificado';
  return `Ainda não há um caderno Revisa público catalogado para ${grade}º ${level}, ${discipline}, ${bimester}º bimestre. Materiais atualmente disponíveis: ${availableMaterialsLabel()}.`;
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

export async function getPublicRevisaCatalog(
  context: RevisaContext,
  loadCompleted: (sequenceId: number, materialId?: number, componentId?: number) => Promise<number[]>,
) {
  const source = findPublicCatalog(context);
  if (!source) return { disponivel: false, materiais: [], contextKey: contextKey(context), reason: unavailableReason(context) };
  const progressBySequence = new Map<number, number[]>();
  for (const block of source.blocos) {
    for (const sequence of block.sequencias) {
      progressBySequence.set(sequence.id, await loadCompleted(sequence.id, source.material.id, source.componente.id));
    }
  }
  return {
    disponivel: true,
    materiais: [catalogEntry(source, progressBySequence)],
    contextKey: contextKey(context),
    fonte: { titulo: 'Revisa Goiás — fonte oficial', url: source.material.fonte_oficial },
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
  const source = findPublicCatalog(context);
  if (!source) throw new Error(unavailableReason(context));
  if (Number(selection.material_id) !== source.material.id || Number(selection.componente_id) !== source.componente.id) {
    throw new Error('O material selecionado não corresponde ao catálogo Revisa disponível para a turma aberta.');
  }
  const block = source.blocos.find((item) => item.id === Number(selection.bloco_id));
  const sequence = block?.sequencias.find((item) => item.id === Number(selection.sequencia_id));
  if (!block || !sequence) throw new Error('Bloco ou sequência Revisa não encontrados.');

  const completed = await loadCompleted(sequence.id);
  const progress = makeProgress(sequence, completed);
  const mode = String(selection.modo_selecao || 'sequencia');
  let activities = sequence.atividades.slice();
  let selectedPages: { from: number; to: number } | null = null;
  if (mode === 'atividades') {
    const from = Math.max(1, Number(selection.atividade_inicial_ordem) || 1);
    const to = Math.max(from, Number(selection.atividade_final_ordem) || from);
    activities = activities.filter((activity) => activity.ordem >= from && activity.ordem <= to);
  } else if (mode === 'paginas') {
    const from = Math.max(sequence.pagina_inicial, Number(selection.pagina_inicial) || sequence.pagina_inicial);
    const to = Math.min(sequence.pagina_final, Math.max(from, Number(selection.pagina_final) || from));
    selectedPages = { from, to };
    activities = activities.filter((activity) => activity.pagina_final >= from && activity.pagina_inicial <= to);
  }
  if (selection.continuar) activities = activities.filter((activity) => !completed.includes(activity.id));
  if (!activities.length) throw new Error(selection.continuar ? 'Esta sequência já foi concluída para a turma aberta.' : 'A seleção do Revisa não contém atividades.');

  const pageFrom = selectedPages?.from ?? Math.min(...activities.map((activity) => activity.pagina_inicial));
  const pageTo = selectedPages?.to ?? Math.max(...activities.map((activity) => activity.pagina_final));
  const referenceCode = `Revisa Goiás — ${source.material.serie_rotulo} — ${source.componente.disciplina} — ${source.material.bimestre}º Bimestre/${source.material.ano_letivo} — ${sequence.nome} — páginas ${pageFrom} a ${pageTo}`;
  return {
    materialId: source.material.id,
    componenteId: source.componente.id,
    blocoId: block.id,
    sequenciaId: sequence.id,
    atividadeIds: activities.map((activity) => activity.id),
    atividades: activities.map((activity) => ({
      ...activity,
      referencias: [{ obrigatorio: true, codigo: referenceCode, texto: referenceCode, url: source.material.fonte_oficial }],
    })),
    paginas: { from: pageFrom, to: pageTo },
    progresso: progress,
    fonte: { titulo: 'Revisa Goiás — fonte oficial', url: source.material.fonte_oficial },
  };
}

export function isPublicRevisaMaterial(materialId: number, componentId: number) {
  return PUBLIC_REVISAS.some((entry) => entry.material.id === materialId && entry.componente.id === componentId);
}
