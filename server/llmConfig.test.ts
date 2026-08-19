import { afterEach, describe, expect, it } from "vitest";
import { getManagedLlmModel } from "./llmConfig";

const originalModel = process.env.LLM_MODEL;

afterEach(() => {
  if (originalModel === undefined) {
    delete process.env.LLM_MODEL;
  } else {
    process.env.LLM_MODEL = originalModel;
  }
});

describe("getManagedLlmModel", () => {
  it("preserva o modelo legado enquanto nenhuma configuração de produção existir", () => {
    delete process.env.LLM_MODEL;
    expect(getManagedLlmModel("gemini-3.6-flash")).toBe("gemini-3.6-flash");
  });

  it("aceita o modelo OpenAI configurado somente no ambiente do servidor", () => {
    process.env.LLM_MODEL = "gpt-4.1-mini";
    expect(getManagedLlmModel("gemini-3.6-flash")).toBe("gpt-4.1-mini");
  });

  it("ignora valores malformados e mantém o fallback seguro", () => {
    process.env.LLM_MODEL = "gpt 4.1 mini; unexpected";
    expect(getManagedLlmModel("gemini-3.6-flash")).toBe("gemini-3.6-flash");
  });
});
