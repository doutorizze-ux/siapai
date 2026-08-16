import { invokeLLM } from "./_core/llm";

export interface LessonPlanItem {
  title: string;
  skills: string;
  objectives: string;
  content: string;
  methodology: string;
  assessment: string;
}

export interface GeneratePlanInput {
  skills: string[];
  subject: string;
  grade: string;
  lessonCount: number;
  customTopic?: string;
  customScript?: string;
}

function buildUserPrompt(input: GeneratePlanInput): string {
  const parts: string[] = [];
  parts.push(
    `Você é um assistente pedagógico especialista em planejamento escolar para o SIAP (Sistema de Informação e Apoio ao Planejamento).`,
  );
  parts.push(`Disciplina: ${input.subject}`);
  parts.push(`Turma/ano: ${input.grade}`);
  parts.push(`Quantidade de aulas a gerar: ${input.lessonCount}`);
  if (input.skills.length > 0) {
    parts.push(`Habilidades da matriz curricular selecionadas:\n${input.skills.map((s, i) => `${i + 1}. ${s}`).join("\n")}`);
  }
  if (input.customTopic) {
    parts.push(`Tema personalizado fornecido pelo professor: ${input.customTopic}`);
  }
  if (input.customScript) {
    parts.push(`Roteiro de aula fornecido pelo professor:\n${input.customScript}`);
  }
  parts.push(
    `Gere exatamente ${input.lessonCount} plano(s) de aula completos. Para cada aula, preencha: título, habilidades trabalhadas, conteúdos/objetivos, metodologia e avaliação. Use linguagem clara, em português brasileiro, adequada à BNCC. NUNCA invente códigos de habilidades: use exatamente os códigos e descrições fornecidos. Se o professor forneceu um tema/roteiro, siga-o como ordem temática principal.`,
  );
  return parts.join("\n\n");
}

export function extractJsonContent(content: unknown): string {
  if (content == null) return "{}";
  if (typeof content === "string") {
    let text = content.trim();
    // 1. Remover blocos de thinking ```thinking ... ``` (antes de qualquer fence)
    text = text.replace(/^\s*```thinking[\s\S]*?```\s*/i, "");
    // 2. Remover fences de markdown ```json ... ```
    const fence = text.match(/^\s*```(?:json)?\s*\n([\s\S]*?)\n\s*```\s*$/);
    if (fence) text = fence[1].trim();
    text = text.replace(/^\s*```json\s*/i, "");
    text = text.replace(/```\s*$/, "");
    text = text.trim();
    // 3. JSON já começa com { ou [
    if (text.startsWith("{") || text.startsWith("[")) return text;
    // 4. Localizar o primeiro JSON completo (objeto ou array) por profundidade
    const startIdx = text.indexOf("{");
    const startIdxArray = text.indexOf("[");
    let start = startIdx;
    if (startIdxArray >= 0 && (startIdx < 0 || startIdxArray < startIdx)) start = startIdxArray;
    if (start < 0) return text;
    const openers = new Set(["{", "[", "("]);
    const closers: Record<string, string> = { "}": "{", "]": "[", ")": "(" };
    let depth = 0;
    let inString = false;
    let escape = false;
    let lastEnd = start;
    for (let i = start; i < text.length; i += 1) {
      const ch = text[i];
      if (escape) { escape = false; continue; }
      if (ch === "\\" && inString) { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (openers.has(ch)) {
        if (depth === 0) lastEnd = i;
        depth += 1;
      } else if (closers[ch]) {
        depth -= 1;
        if (depth === 0) return text.slice(start, i + 1);
      }
    }
    // Texto termina no meio do JSON: retorna tudo a partir do primeiro aberto
    return text.slice(start);
  }
  // Content já pode vir como objeto/array (alguns proxies retornam parseado)
  if (typeof content === "object") {
    return JSON.stringify(content);
  }
  return String(content);
}

export async function generateLessonPlans(input: GeneratePlanInput, options?: { maxAttempts?: number }): Promise<LessonPlanItem[]> {
  const maxAttempts = options?.maxAttempts ?? 3;
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const lessons = await runGenerateLessonPlans(input);
      return lessons;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }
  throw lastError ?? new Error("A IA retornou uma resposta inválida. Tente novamente.");
}

const LESSON_PLANS_SCHEMA = {
  type: "object" as const,
  properties: {
    lessons: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          title: { type: "string" as const, description: "Título da aula" },
          skills: { type: "string" as const, description: "Habilidades trabalhadas (códigos e descrições)" },
          objectives: { type: "string" as const, description: "Objetivos de conhecimento / conteúdos" },
          content: { type: "string" as const, description: "Conteúdo detalhado da aula" },
          methodology: { type: "string" as const, description: "Metodologias utilizadas" },
          assessment: { type: "string" as const, description: "Avaliações propostas" },
        },
        required: ["title", "skills", "objectives", "content", "methodology", "assessment"],
        additionalProperties: false,
      },
    },
  },
  required: ["lessons"],
  additionalProperties: false,
};

async function runGenerateLessonPlans(input: GeneratePlanInput): Promise<LessonPlanItem[]> {
  const response = await invokeLLM({
    model: "gemini-3-flash-preview",
    messages: [{ role: "user", content: buildUserPrompt(input) }],
    max_tokens: 16000,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "lesson_plans",
        strict: true,
        schema: {
          type: "object",
          properties: {
            lessons: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: { type: "string", description: "Título da aula" },
                  skills: { type: "string", description: "Habilidades trabalhadas (códigos e descrições)" },
                  objectives: { type: "string", description: "Objetivos de conhecimento / conteúdos" },
                  content: { type: "string", description: "Conteúdo detalhado da aula" },
                  methodology: { type: "string", description: "Metodologias utilizadas" },
                  assessment: { type: "string", description: "Avaliações propostas" },
                },
                required: ["title", "skills", "objectives", "content", "methodology", "assessment"],
                additionalProperties: false,
              },
            },
          },
          required: ["lessons"],
          additionalProperties: false,
        },
      },
    },
  });

  const content = response.choices?.[0]?.message?.content;
  let parsed: { lessons?: LessonPlanItem[] } = {};
  try {
    parsed = JSON.parse(extractJsonContent(content));
  } catch (error) {
    console.warn("[LLM] conteúdo bruto da IA (parse falhou):", JSON.stringify(content)?.slice(0, 2000));
    throw new Error("A IA retornou uma resposta inválida. Tente novamente.");
  }
  const lessons = parsed.lessons ?? [];
  if (lessons.length === 0) {
    throw new Error("A IA não retornou nenhum plano. Tente novamente.");
  }
  return lessons.slice(0, input.lessonCount);
}

export const LESSON_PLANS_JSON_SCHEMA = LESSON_PLANS_SCHEMA;

export interface PeiInput {
  aluno: string;
  condicao: string;
  obs?: string;
}

export interface PeiOutput {
  descricao: string;
  objetivos: string;
  estrategias: string;
  avaliacao: string;
}

export async function generatePei(input: PeiInput): Promise<PeiOutput> {
  const parts: string[] = [
    `Você é um especialista em educação inclusiva e Plano Educacional Individualizado (PEI).`,
    `Aluno: ${input.aluno}`,
    `Condição/diagnóstico: ${input.condicao}`,
  ];
  if (input.obs) parts.push(`Observações do professor: ${input.obs}`);
  parts.push(
    `Elabore uma proposta de PEI concisa e prática, em português brasileiro, com: descrição da condição e impacto na aprendizagem, objetivos individualizados, estratégias e adaptações curriculares, e avaliação adaptada. Retorne APENAS o JSON pedido, sem texto adicional.`,
  );

  const response = await invokeLLM({
    model: "gemini-3-flash-preview",
    messages: [{ role: "user", content: parts.join("\n\n") }],
    max_tokens: 8000,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "pei",
        strict: true,
        schema: {
          type: "object",
          properties: {
            descricao: { type: "string", description: "Descrição da condição e impacto na aprendizagem" },
            objetivos: { type: "string", description: "Objetivos individualizados" },
            estrategias: { type: "string", description: "Estratégias e adaptações curriculares" },
            avaliacao: { type: "string", description: "Avaliação adaptada" },
          },
          required: ["descricao", "objetivos", "estrategias", "avaliacao"],
          additionalProperties: false,
        },
      },
    },
  });

  const content = response.choices?.[0]?.message?.content;
  let parsed: PeiOutput = { descricao: "", objetivos: "", estrategias: "", avaliacao: "" };
  try {
    parsed = JSON.parse(extractJsonContent(content));
  } catch {
    console.warn("[LLM] conteúdo bruto da IA (PEI, parse falhou):", JSON.stringify(content)?.slice(0, 2000));
    throw new Error("A IA retornou uma resposta inválida. Tente novamente.");
  }
  return parsed;
}
