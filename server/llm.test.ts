import { describe, expect, it } from "vitest";
import { generateLessonPlans } from "./llm";

describe("generateLessonPlans (LLM real)", () => {
  it("gera planos de aula válidos a partir das habilidades do SIAP", async () => {
    const result = await generateLessonPlans({
      skills: [
        "(EF04MA03) Resolver e elaborar problemas com números naturais envolvendo adição e subtração.",
        "(EF04MA04) Utilizar as relações entre adição e subtração para facilitar cálculos.",
      ],
      subject: "Matemática",
      grade: "4º ano do Ensino Fundamental",
      lessonCount: 2,
    });
    expect(result.length).toBe(2);
    for (const lesson of result) {
      expect(lesson.title).toBeTruthy();
      expect(lesson.objectives).toBeTruthy();
      expect(lesson.methodology).toBeTruthy();
      expect(lesson.assessment).toBeTruthy();
    }
  }, 90000);
});

import { extractJsonContent } from "./llm";

describe("extractJsonContent (parse tolerante)", () => {
  it("aceita JSON puro como string", () => {
    const result = extractJsonContent('{"lessons": []}');
    expect(JSON.parse(result)).toEqual({ lessons: [] });
  });

  it("remove fences de markdown ```json ... ```", () => {
    const result = extractJsonContent('```json\n{"lessons": []}\n```');
    expect(JSON.parse(result)).toEqual({ lessons: [] });
  });

  it("remove blocos de thinking e retorna o JSON", () => {
    const result = extractJsonContent('```thinking\nalgum raciocínio\n```\n{"lessons": []}');
    expect(JSON.parse(result)).toEqual({ lessons: [] });
  });

  it("localiza o primeiro objeto JSON quando há texto antes", () => {
    const result = extractJsonContent('Aqui está o resultado: {"lessons": [{"title": "Aula"}]}');
    expect(JSON.parse(result)).toEqual({ lessons: [{ title: "Aula" }] });
  });

  it("aceita conteúdo já parseado (objeto)", () => {
    const result = extractJsonContent({ lessons: [{ title: "Aula" }] });
    expect(JSON.parse(result)).toEqual({ lessons: [{ title: "Aula" }] });
  });

  it("retorna {} para conteúdo nulo", () => {
    expect(JSON.parse(extractJsonContent(null))).toEqual({});
    expect(JSON.parse(extractJsonContent(undefined))).toEqual({});
  });

  it("aceita JSON iniciado por array", () => {
    const result = extractJsonContent('[{"title": "Aula"}]');
    expect(JSON.parse(result)).toEqual([{ title: "Aula" }]);
  });
});
