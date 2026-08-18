import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const read = (relativePath: string) => readFileSync(join(root, relativePath), "utf8");

describe("oferta semestral e Correção de Avaliações no site", () => {
  it("protege a comunicação semestral no site e checkout", () => {
    const home = read("client/src/pages/Home.tsx");
    const checkout = read("client/src/pages/Checkout.tsx");
    expect(home).toContain("Plano semestral");
    expect(home).toContain("compras confirmadas de janeiro a junho valem até 30/06");
    expect(checkout).toContain("A validade termina em 30/06 ou 31/12");
  });

  it("explica o fluxo auditável da Correção de Avaliações sem prometer salvamento automático", () => {
    const home = read("client/src/pages/Home.tsx");
    expect(home).toContain("Correção de avaliações com prévia segura");
    expect(home).toContain("Envie o gabarito");
    expect(home).toContain("Envie as folhas numeradas");
    expect(home).toContain("Revise a prévia");
    expect(home).toContain("não salva o formulário do SIAP automaticamente");
  });
});
