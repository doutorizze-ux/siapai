import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const EXT = join(process.cwd(), "..", "siapai-repo", "extensao");
const manifest = JSON.parse(readFileSync(join(EXT, "manifest.json"), "utf8"));
const allJs = (dir: string) => readdirSync(join(EXT, dir)).filter((f) => f.endsWith(".js"));

describe("Contrato da extensão SiapAI v5.8.1", () => {
  it("manifest é v5.8.1, MV3, com side panel", () => {
    expect(manifest.version).toBe("5.8.1");
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.side_panel).toBeDefined();
    expect(manifest.name).toBe("SiapAI");
    expect(manifest.background?.service_worker).toBe("background.js");
  });

  it("web_accessible_resources cobre todos os módulos da extensão", () => {
    const resources = manifest.web_accessible_resources.flatMap((entry: any) => entry.resources);
    const coveredByGlob = (resource: string) => {
      for (const pattern of resources) {
        if (pattern.endsWith("/*.js") && resource.startsWith(pattern.replace("*.js", ""))) return true;
        if (pattern === resource) return true;
      }
      return false;
    };
    for (const file of allJs("planejamento")) {
      expect(coveredByGlob(`planejamento/${file}`), `planejamento/${file}`).toBe(true);
    }
    for (const file of allJs("conteudo")) {
      expect(coveredByGlob(`conteudo/${file}`), `conteudo/${file}`).toBe(true);
    }
    for (const file of allJs("frequencia")) {
      expect(coveredByGlob(`frequencia/${file}`), `frequencia/${file}`).toBe(true);
    }
    for (const file of allJs("pei")) {
      expect(coveredByGlob(`pei/${file}`), `pei/${file}`).toBe(true);
    }
    for (const file of ["content.js", "background.js", "sidepanel.js", "main_bridge.js", "popup.js"]) {
      expect(resources).toContain(file);
    }
  });

  it("todos os JS da extensão têm sintaxe válida", () => {
    const files = [
      "content.js", "background.js", "sidepanel.js", "popup.js", "main_bridge.js",
      ...allJs("planejamento").map((f) => `planejamento/${f}`),
      ...allJs("conteudo").map((f) => `conteudo/${f}`),
      ...allJs("frequencia").map((f) => `frequencia/${f}`),
      ...allJs("pei").map((f) => `pei/${f}`),
    ];
    for (const file of files) {
      const code = readFileSync(join(EXT, file), "utf8");
      expect(() => new Function(code), `${file} deve compilar`).not.toThrow();
    }
  });

  it("content.js contém sanitização de sourceName (nenhum .aspx pode virar sourceURL)", () => {
    const code = readFileSync(join(EXT, "content.js"), "utf8");
    expect(code).toContain("sanitizeSourceName");
    expect(code).toContain("replace(/[^a-zA-Z0-9._-]/g, '_'");
    const routesMatch = /match:\s*\(url\)\s*=>\s*([^,\n]+)/g;
    const matches = [...code.matchAll(routesMatch)];
    for (const m of matches) {
      // matchers devem ser baseados em regex; url.includes é aceito somente junto do nome de página oficial completo (fallback)
      const body = m[1];
      const bareIncludes = body.includes("url.includes('PlanejamentoProfessorPlanejamentoAulaEdicao.aspx')") || body.includes('url.includes("PlanejamentoProfessorPlanejamentoAulaEdicao.aspx")');
      expect(bareIncludes, `matcher sem regex: ${body.slice(0, 120)}`).toBe(false);
    }
  });

  it("rotas de página toleram a variação toJulaEdicao do SIAP", () => {
    const code = readFileSync(join(EXT, "content.js"), "utf8");
    const start = code.indexOf("const PAGE_ROUTES = [");
    const end = code.indexOf("];", start);
    let routes: { key: string; match: (url: string) => boolean }[] = [];
    new Function("routes", "routes = " + code.slice(start + "const PAGE_ROUTES =".length, end + 2))(routes);
    routes = [];
    // eslint-disable-next-line no-eval
    eval("routes = " + code.slice(start + "const PAGE_ROUTES =".length, end + 2));
    const toJula = "https://siap.educacao.go.gov.br/PlanejamentoProfessor/PlanejamentoProfessor-toJulaEdicao.aspx";
    const padrao = "https://siap.educacao.go.gov.br/PlanejamentoProfessor/PlanejamentoProfessorAulaEdicao.aspx";
    const encontradas = routes.filter((r) => r.match(toJula));
    expect(encontradas.length).toBeGreaterThanOrEqual(1);
    expect(encontradas[0].key).toBe("planejamento");
    expect(routes.find((r) => r.match(padrao))?.key).toBe("planejamento");
    expect(routes.find((r) => r.match("https://siap.educacao.go.gov.br/Default.aspx"))).toBeUndefined();
  });

  it("sidepanel.html mostra v5.8.1", () => {
    const html = readFileSync(join(EXT, "sidepanel.html"), "utf8");
    expect(html).toContain("v5.8.1");
  });
});
