const API_BASE = 'https://siapai.online/api';
const byId = (id) => document.getElementById(id);
let activeContext = null;

function getAuth() {
  return new Promise((resolve) => chrome.storage.local.get(['auth', 'siap_saas_cache__auth'], (result) => {
    if (result.auth) return resolve(result.auth);
    try { resolve(JSON.parse(result.siap_saas_cache__auth || 'null')?.value || null); } catch { resolve(null); }
  }));
}

function request(message) {
  return new Promise((resolve, reject) => chrome.runtime.sendMessage(message, (response) => {
    if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
    if (!response?.ok) return reject(new Error(response?.error || 'Não foi possível concluir a comunicação.'));
    resolve(response.data);
  }));
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab;
}

function setPageState(title, detail) {
  byId('pageState').innerHTML = `<strong>${title}</strong><span>${detail}</span>`;
}

function setOutput(text, error = false) {
  const output = byId('generationOutput');
  output.textContent = text;
  output.className = `output show${error ? ' error' : ''}`;
}

async function refreshLicense() {
  const state = byId('licenseState');
  const auth = await getAuth();
  if (!auth?.token) {
    state.className = 'license-state expired';
    state.querySelector('div').innerHTML = '<strong>Licença não identificada</strong><small>Abra o SIAP para validar o acesso.</small>';
    return null;
  }
  try {
    const result = await request({ type: 'SIAP_REQUEST', path: '/license/check.php', method: 'GET', token: auth.token });
    const valid = result?.ok !== false && result?.access_granted !== false && result?.expired !== true;
    state.className = `license-state ${valid ? 'active' : 'expired'}`;
    const date = result?.expires_at_br || result?.license?.expires_at || auth?.license?.expires_at || 'não informada';
    state.querySelector('div').innerHTML = `<strong>${valid ? 'Licença ativa' : 'Licença indisponível'}</strong><small>Validade: ${date}</small>`;
    return valid ? auth : null;
  } catch {
    state.className = 'license-state expired';
    state.querySelector('div').innerHTML = '<strong>Não foi possível verificar a licença</strong><small>Confira sua conexão e abra o SIAP novamente.</small>';
    return null;
  }
}

async function refreshContext() {
  const tab = await getActiveTab();
  if (!tab?.url?.startsWith('https://siap.educacao.go.gov.br/')) {
    activeContext = null;
    setPageState('Abra uma tela do SIAP', 'Os módulos trabalham com a turma ou a aula que estiver aberta no SIAP.');
    return null;
  }
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'SIAP_READ_CONTEXT' });
    activeContext = response?.context || null;
    const pageLabel = activeContext?.label || 'Página do SIAP reconhecida';
    const details = activeContext?.summary || 'Você pode usar o Planejamento com IA sem alterar a estrutura desta página.';
    setPageState(pageLabel, details);
    return activeContext;
  } catch {
    activeContext = { page: 'siap', summary: 'Recarregue a página do SIAP para permitir a leitura do contexto.' };
    setPageState('Contexto aguardando recarga', activeContext.summary);
    return activeContext;
  }
}

function extractText(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(extractText).join('\n');
  if (value && typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value || '');
}

async function generatePlan() {
  const button = byId('generatePlan');
  const auth = await refreshLicense();
  if (!auth?.token) return setOutput('Sua licença precisa estar ativa antes de gerar sugestões.', true);
  const count = Number(byId('lessonCount').value || 1);
  const requestText = byId('planningRequest').value.trim();
  const contextText = activeContext?.summary || 'Turma aberta no SIAP.';
  const prompt = `Gere ${count} sugestão(ões) de planejamento escolar em português do Brasil. Contexto da página: ${contextText}. Orientação do professor: ${requestText || 'Criar uma proposta adequada à turma identificada.'}. Para cada aula, informe objetivo, conteúdo, metodologia e avaliação. Responda em JSON válido com a chave aulas.`;
  button.disabled = true;
  button.textContent = 'Gerando…';
  setOutput('A IA está preparando as sugestões…');
  try {
    const data = await request({
      type: 'SIAP_REQUEST', path: '/ai/generate.php', method: 'POST', token: auth.token,
      data: { model: 'gpt-4.1-mini', temperature: 0.3, max_tokens: Math.max(3500, count * 900), messages: [{ role: 'user', content: prompt }] }
    });
    const body = data?.data ?? data?.content ?? data?.aulas ?? data;
    setOutput(extractText(body));
  } catch (error) {
    setOutput(error.message || 'Não foi possível gerar as sugestões.', true);
  } finally {
    button.disabled = false;
    button.textContent = 'Gerar sugestões';
  }
}

function initTabs() {
  document.querySelectorAll('.tab').forEach((button) => button.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((item) => item.classList.toggle('active', item === button));
    document.querySelectorAll('.module-panel').forEach((item) => item.classList.toggle('active', item.id === `panel-${button.dataset.tab}`));
  }));
}

document.querySelectorAll('[data-open-module]').forEach((button) => button.addEventListener('click', refreshContext));
byId('generatePlan').addEventListener('click', generatePlan);
initTabs();
Promise.all([refreshLicense(), refreshContext()]);
chrome.tabs.onActivated.addListener(() => refreshContext().catch(() => {}));
chrome.tabs.onUpdated.addListener((_id, changeInfo) => { if (changeInfo.status === 'complete') refreshContext().catch(() => {}); });
