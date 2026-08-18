import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const STORE_URL = "https://chromewebstore.google.com/detail/dcifappjgnkilhdiefljlooinnpeakmh";
const homePath = join(process.cwd(), "client", "src", "pages", "Home.tsx");

describe("chamada de instalação na página pública", () => {
  it("mantém o link oficial da Chrome Web Store nos pontos de conversão", () => {
    const home = readFileSync(homePath, "utf8");

    expect(home).toContain(STORE_URL);
    expect(home).toContain("Instalar no Chrome");
    expect(home).toContain("Instalar extensão");
    expect(home).toContain("Instale pela Chrome Web Store");
    expect(home).not.toContain("carregue no Chrome/Edge em modo desenvolvedor");
  });
});
