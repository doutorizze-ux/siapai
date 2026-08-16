import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'extensao');
const source = fs.readFileSync(path.join(root, 'main_bridge.js'), 'utf8');

function createStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key)
  };
}

const localStorage = createStorage();
const sessionStorage = createStorage();
const sent = [];
let listener = null;
const calls = { frequencyStart: 0, frequencyStop: 0, contentRun: 0, contentStop: 0, peiFill: null };
const materialGrid = {
  querySelectorAll: () => [
    { querySelector: () => ({ textContent: 'Revista Goiás' }) },
    { querySelector: () => ({ textContent: 'Goiás TEC' }) }
  ]
};
const windowMock = {
  addEventListener: (type, handler) => { if (type === 'message') listener = handler; },
  postMessage: (message) => sent.push(message),
  SIAPFrequencia: { start: async () => { calls.frequencyStart += 1; }, stop: () => { calls.frequencyStop += 1; } },
  SIAPExecutorConteudo: { run: async () => { calls.contentRun += 1; }, stop: () => { calls.contentStop += 1; } },
  SIAPPEIApi: {
    collectPayload: () => ({ turma: '2º Ano', disciplina: 'Matemática' }),
    fillFields: (data) => { calls.peiFill = data; }
  }
};
const context = vm.createContext({
  window: windowMock,
  document: { querySelector: (selector) => selector === '#cphFuncionalidade_cphCampos_GrdMaterialApoio' ? materialGrid : null },
  localStorage,
  sessionStorage,
  console,
  JSON,
  Date,
  Promise,
  setTimeout,
  clearTimeout
});
vm.runInContext(source, context, { filename: 'main_bridge.js' });

async function request(action, extras = {}) {
  sent.length = 0;
  listener({ data: { source: 'SIAP_SAAS_CONTENT', requestId: 'test', action, ...extras } });
  await new Promise((resolve) => setTimeout(resolve, 5));
  const response = sent.at(-1);
  assert.ok(response, `Ação ${action} deve responder pela ponte.`);
  assert.equal(response.ok, true, `Ação ${action} não deve falhar.`);
  return response.payload;
}

const activation = await request('activateHeadless');
assert.equal(activation.headless, true);
assert.equal(windowMock.__SIAP_SAAS_HEADLESS__, true);

const configuredFrequency = await request('engineCommand', { command: 'FREQUENCY_CONFIGURE', payload: { months: [2, 0, 2] } });
assert.deepEqual(Array.from(configuredFrequency.months), [2, 0, 2]);
assert.equal(localStorage.getItem('siap_freq_v51_selected_months'), '[0,2]');
await request('engineCommand', { command: 'FREQUENCY_START' });
await request('engineCommand', { command: 'FREQUENCY_STOP' });
assert.equal(calls.frequencyStart, 1);
assert.equal(calls.frequencyStop, 1);

const configuredContent = await request('engineCommand', {
  command: 'CONTENT_CONFIGURE',
  payload: { months: [4, 1], materials: ['Revista Goiás'], doubleLesson: true, otherMaterialText: 'Slides' }
});
assert.deepEqual(Array.from(configuredContent.months), [4, 1]);
assert.deepEqual(Array.from(configuredContent.materials), ['Revista Goiás']);
assert.equal(localStorage.getItem('tm_executor_conteudo_double_lesson_v13'), '1');
assert.equal(localStorage.getItem('tm_executor_conteudo_other_material_text_v13'), 'Slides');
const materials = await request('engineCommand', { command: 'CONTENT_MATERIAL_OPTIONS' });
assert.deepEqual(Array.from(materials.options), ['Revista Goiás', 'Goiás TEC', 'Nenhum material de apoio utilizado']);
assert.deepEqual(Array.from(materials.selected), ['Revista Goiás']);
await request('engineCommand', { command: 'CONTENT_START' });
await request('engineCommand', { command: 'CONTENT_STOP' });
assert.equal(calls.contentRun, 1);
assert.equal(calls.contentStop, 1);

const peiPayload = await request('engineCommand', { command: 'PEI_COLLECT', payload: { instruction: 'Priorizar recursos visuais.' } });
assert.equal(peiPayload.comando_ia, 'Priorizar recursos visuais.');
await request('engineCommand', { command: 'PEI_FILL', payload: { data: { txtPotencialidadesConteudo: 'Conteúdo adaptado.' } } });
assert.deepEqual(calls.peiFill, { txtPotencialidadesConteudo: 'Conteúdo adaptado.' });

console.log('OK: ponte headless configura e aciona Frequência, Conteúdo e PEI sem interface no DOM do SIAP.');
