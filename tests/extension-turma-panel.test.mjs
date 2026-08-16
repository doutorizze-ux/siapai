import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const extensionRoot = resolve(process.cwd(), 'extensao');
const read = (file) => readFile(resolve(extensionRoot, file), 'utf8');

const [manifestRaw, content, bridge, panel] = await Promise.all([
  read('manifest.json'),
  read('content.js'),
  read('main_bridge.js'),
  read('planejamento/turma-panel.js'),
]);

const manifest = JSON.parse(manifestRaw);

assert.equal(manifest.version, '5.4.0');
assert.ok(
  manifest.web_accessible_resources[0].resources.includes('planejamento/turma-panel.js'),
  'O painel deve estar exposto como recurso acessível à página do SIAP.'
);
assert.match(
  content,
  /pageKey === 'planejamento_turma'[\s\S]{0,120}return \['planejamento\/turma-panel\.js'\]/,
  'A rota de turma deve carregar o painel de planejamento.'
);
assert.match(
  content,
  /SIAP_SAAS_MAIN_BRIDGE_SERVER/,
  'Chamadas da IA do painel devem ser encaminhadas ao service worker.'
);
assert.match(
  bridge,
  /pageKey === 'planejamento_turma'[\s\S]{0,220}SIAPTurmaPanel\.init/,
  'O bridge deve inicializar o painel de turma após carregar seus scripts.'
);
assert.match(
  panel,
  /PlanejamentoProfessorTurmaEdicao\.aspx/,
  'O painel deve reconhecer a página de turma utilizada pelo usuário.'
);

console.log('Contrato do painel de turma v5.4.0 validado.');
