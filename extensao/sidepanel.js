const byId = (id) => document.getElementById(id);
const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
let activeContext = null;
let supportFileText = '';

function getAuth() {
  return new Promise((resolve) => chrome.storage.local.get(['auth', 'siap_saas_cache__auth'], (result) => {
    if (result.auth) return resolve(result.auth);
    try { resolve(JSON.parse(result.siap_saas_cache__auth || 'null')?.value || null); } catch { resolve(null); }
  }));
}

// Erros internos do Chrome (ex.: aba em back/forward cache, service worker dormindo)
// não interessam ao usuário: quando a operação em si já concluiu, silenciamos.
function chromeMessageToError(lastError) {
  const raw = String(lastError?.message || '');
  if (/back\/forward cache|message channel is closed|Receiving end does not exist|Could not establish/i.test(raw)) {
    return new Error('Comunicação com a página pausada; recarregue o SIAP se algo não responder.');
  }
  return new Error(raw || 'Falha de comunicação interna do navegador.');
}

function request(message) {
  return new Promise((resolve, reject) => chrome.runtime.sendMessage(message, (response) => {
    if (chrome.runtime.lastError) return reject(chromeMessageToError(chrome.runtime.lastError));
    if (!response?.ok) return reject(new Error(response?.error || 'Não foi possível concluir a comunicação.'));
    resolve(response.data);
  }));
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab;
}

async function engine(command, payload = {}, expectedPage, timeoutMs) {
  const tab = await getActiveTab();
  if (!tab?.id || !tab.url?.startsWith('https://siap.educacao.go.gov.br/')) {
    throw new Error('Abra a tela correspondente no SIAP antes de executar este comando.');
  }
  return new Promise((resolve, reject) => chrome.tabs.sendMessage(tab.id, {
    type: 'SIAP_ENGINE_COMMAND', command, payload, expectedPage, timeoutMs
  }, (response) => {
    if (chrome.runtime.lastError) return reject(chromeMessageToError(chrome.runtime.lastError));
    if (!response?.ok) return reject(new Error(response?.error || 'A automação não pôde ser iniciada.'));
    resolve(response.data);
  }));
}

function setPageState(title, detail) {
  byId('pageState').innerHTML = `<strong>${escapeHtml(title)}</strong><span>${escapeHtml(detail)}</span>`;
}

function showOutput(id, text, error = false) {
  const output = byId(id);
  output.textContent = String(text || '');
  output.className = `output show${error ? ' error' : ''}`;
}

function setBusy(button, busy, label) {
  if (!button) return;
  if (busy) {
    button.dataset.label = button.textContent;
    button.textContent = label || 'Processando…';
    button.disabled = true;
  } else {
    button.textContent = button.dataset.label || button.textContent;
    button.disabled = false;
  }
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

async function refreshLicense() {
  const state = byId('licenseState');
  const loginPanel = byId('loginPanel');
  const auth = await getAuth();
  if (!auth?.token) {
    state.className = 'license-state expired';
    state.querySelector('div').innerHTML = '<strong>Licença não identificada</strong><small>Valide o e-mail neste painel lateral.</small>';
    loginPanel.hidden = false;
    return null;
  }
  try {
    const result = await request({ type: 'SIAP_REQUEST', path: '/license/check.php', method: 'GET', token: auth.token });
    const valid = result?.ok !== false && result?.access_granted !== false && result?.expired !== true;
    state.className = `license-state ${valid ? 'active' : 'expired'}`;
    const date = result?.expires_at_br || result?.license?.expires_at || auth?.license?.expires_at || 'não informada';
    state.querySelector('div').innerHTML = `<strong>${valid ? 'Licença ativa' : 'Licença indisponível'}</strong><small>Validade: ${escapeHtml(date)}</small>`;
    loginPanel.hidden = valid;
    return valid ? auth : null;
  } catch {
    state.className = 'license-state expired';
    state.querySelector('div').innerHTML = '<strong>Não foi possível verificar a licença</strong><small>Confira sua conexão e abra o SIAP novamente.</small>';
    loginPanel.hidden = false;
    return null;
  }
}

async function validateLicenseEmail() {
  const button = byId('validateLicense');
  const email = byId('licenseEmail').value.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return showOutput('loginOutput', 'Informe um e-mail válido para a licença.', true);
  }
  try {
    setBusy(button, true, 'Validando…');
    const tab = await getActiveTab();
    if (!tab?.id || !tab.url?.startsWith('https://siap.educacao.go.gov.br/')) {
      throw new Error('Abra o SIAP e mantenha a página ativa para validar o acesso.');
    }
    const pageContext = await new Promise((resolve, reject) => chrome.tabs.sendMessage(tab.id, { type: 'SIAP_AUTH_CONTEXT' }, (response) => {
      if (chrome.runtime.lastError) return reject(chromeMessageToError(chrome.runtime.lastError));
      if (!response?.ok) return reject(new Error(response?.error || 'Não foi possível obter o contexto do SIAP.'));
      resolve(response.data || {});
    }));
    const response = await request({
      type: 'SIAP_REQUEST', path: '/auth/validate-email.php', method: 'POST',
      data: { email, site_user_name: pageContext.siteUserName || '', device_name: navigator.userAgent, device_seed: pageContext.deviceSeed || '' }
    });
    const result = response?.data || response;
    if (result?.ok !== true || !(result?.token || result?.data?.token)) {
      throw new Error(result?.error || result?.message || 'Não foi possível validar esta licença.');
    }
    const auth = {
      email,
      token: result.token || result?.data?.token,
      refreshToken: result.refresh_token || result?.data?.refresh_token || null,
      user: result.user || result?.data?.user || { email },
      license: result.license || result?.data?.license || null,
      renewal: result.renewal || result?.data?.renewal || null,
      accessGranted: result.access_granted !== false,
      message: result.message || ''
    };
    await new Promise((resolve, reject) => chrome.tabs.sendMessage(tab.id, { type: 'SIAP_AUTH_APPLY', auth }, (applyResponse) => {
      if (chrome.runtime.lastError) return reject(chromeMessageToError(chrome.runtime.lastError));
      if (!applyResponse?.ok) return reject(new Error(applyResponse?.error || 'Não foi possível salvar a sessão.'));
      resolve(applyResponse.data);
    }));
    showOutput('loginOutput', 'Licença validada com sucesso.');
    await refreshLicense();
  } catch (error) {
    showOutput('loginOutput', error.message || 'Não foi possível validar a licença.', true);
  } finally { setBusy(button, false); }
}

async function refreshContext() {
  const tab = await getActiveTab();
  if (!tab?.url?.startsWith('https://siap.educacao.go.gov.br/')) {
    activeContext = null;
    setPageState('Abra uma tela do SIAP', 'Os módulos trabalham com a turma, aula ou cadastro que estiver aberto no SIAP.');
    return null;
  }
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'SIAP_READ_CONTEXT' });
    activeContext = response?.context || null;
    setPageState(activeContext?.label || 'Página do SIAP reconhecida', activeContext?.summary || 'Selecione um módulo para continuar.');
    return activeContext;
  } catch {
    activeContext = { page: 'siap', summary: 'Recarregue a página do SIAP para permitir a leitura do contexto.' };
    setPageState('Contexto aguardando recarga', activeContext.summary);
    return activeContext;
  }
}

function selectedMonths(containerId) {
  return [...byId(containerId).querySelectorAll('input[type=checkbox]:checked')].map((input) => Number(input.value));
}

function createMonthGrid(containerId) {
  const container = byId(containerId);
  container.replaceChildren();
  MONTHS.forEach((name, index) => {
    const label = document.createElement('label');
    label.className = 'month-option';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = String(index);
    const text = document.createElement('span');
    text.textContent = name;
    label.append(input, text);
    container.append(label);
  });
}

function setAllMonths(containerId, checked) {
  byId(containerId).querySelectorAll('input[type=checkbox]').forEach((input) => { input.checked = checked; });
}

function selectedMaterials() {
  return [...byId('contentMaterialList').querySelectorAll('input[type=checkbox]:checked')].map((input) => input.value);
}

function renderContentMaterials(payload = {}) {
  const list = byId('contentMaterialList');
  const options = Array.isArray(payload.options) ? payload.options : [];
  const selected = new Set(Array.isArray(payload.selected) ? payload.selected : []);
  list.replaceChildren();
  if (!options.length) {
    list.innerHTML = '<em>Nenhum material foi encontrado na tela atual do SIAP.</em>';
    return;
  }
  options.forEach((material, index) => {
    const label = document.createElement('label');
    label.className = 'material-option';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = material;
    input.id = `content-material-${index}`;
    input.checked = selected.has(material);
    const text = document.createElement('span');
    text.textContent = material;
    label.append(input, text);
    list.append(label);
  });
  byId('otherMaterialText').value = payload.otherMaterialText || '';
}

async function refreshContentMaterials() {
  try {
    const payload = await engine('CONTENT_MATERIAL_OPTIONS', {}, 'conteudo');
    renderContentMaterials(payload);
    showOutput('contentOutput', 'Materiais nativos carregados da tela do SIAP.');
  } catch (error) { showOutput('contentOutput', error.message, true); }
}

function renderPlans(snapshot) {
  const list = byId('planPreview');
  const plans = Array.isArray(snapshot?.plans) ? snapshot.plans : [];
  const current = Number(snapshot?.currentIndex || 0);
  list.replaceChildren();
  if (!plans.length) {
    list.innerHTML = '<em>Nenhum planejamento carregado.</em>';
  } else {
    plans.forEach((plan, index) => {
      const card = document.createElement('article');
      card.className = `plan-card${index === current ? ' active' : ''}`;
      card.innerHTML = `<h4>Aula ${index + 1}${plan?.titulo ? ` · ${escapeHtml(plan.titulo)}` : ''}</h4>
        <p><strong>Habilidades:</strong> ${escapeHtml((plan?.habilidades || []).join(' | ') || '—')}</p>
        <p><strong>Conteúdos:</strong> ${escapeHtml((plan?.conteudos || []).join(' | ') || '—')}</p>
        <p><strong>Metodologia:</strong> ${escapeHtml(plan?.metodologia || '—')}</p>
        <p><strong>Avaliação:</strong> ${escapeHtml(plan?.avaliacao || '—')}</p>`;
      list.append(card);
    });
  }
  const hasPlans = plans.length > 0;
  byId('applyNext').disabled = !hasPlans;
  byId('applyAll').disabled = !hasPlans;
  byId('stopPlanning').disabled = !hasPlans;
  renderSavedPlans(snapshot?.savedPlans || []);
}

function renderSavedPlans(entries) {
  const list = byId('savedPlans');
  list.replaceChildren();
  if (!Array.isArray(entries) || !entries.length) {
    list.innerHTML = '<em>Nenhum lote salvo foi encontrado para reaproveitar.</em>';
    return;
  }
  entries.slice(0, 8).forEach((entry) => {
    const card = document.createElement('article');
    card.className = 'saved-card';
    card.innerHTML = `<strong>${escapeHtml(entry.disciplina || 'Disciplina não identificada')}</strong><br>${escapeHtml(entry.serieAno || 'Série não identificada')} · ${escapeHtml(entry.totalAulas || entry.plans?.length || 0)} aula(s)`;
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Carregar este lote';
    button.addEventListener('click', async () => {
      try {
        const snapshot = await engine('PLANNING_LOAD_SAVED', { id: entry.id }, 'planejamento');
        renderPlans(snapshot);
        showOutput('generationOutput', 'Lote salvo carregado. Confira a prévia antes de aplicar.');
      } catch (error) { showOutput('generationOutput', error.message, true); }
    });
    card.append(button);
    list.append(card);
  });
}

async function refreshPlans() {
  try {
    const snapshot = await engine('PLANNING_SNAPSHOT', {}, 'planejamento');
    renderPlans(snapshot);
  } catch (_) {
    renderPlans({ plans: [] });
  }
}

async function loadSupportFile() {
  const file = byId('planningFile').files?.[0];
  if (!file) { supportFileText = ''; return; }
  if (file.size > 500000) throw new Error('O arquivo de apoio deve ter no máximo 500 KB.');
  supportFileText = await file.text();
  showOutput('generationOutput', `Arquivo “${file.name}” carregado para a geração.`);
}

async function generatePlan() {
  const button = byId('generatePlan');
  const auth = await refreshLicense();
  if (!auth?.token) return showOutput('generationOutput', 'Sua licença precisa estar ativa antes de gerar planejamentos.', true);
  try {
    setBusy(button, true, 'Preparando…');
    await loadSupportFile();
    const count = Number(byId('lessonCount').value || 1);
    const instruction = [byId('planningRequest').value.trim(), supportFileText.trim()].filter(Boolean).join('\n\n');
    const options = { count, instruction, supportText: supportFileText, customContentEnabled: byId('customContent').checked, replicateToOtherClass: byId('replicateClass').checked };
    const prepared = await engine('PLANNING_PREPARE', options, 'planejamento', 30000);
    setBusy(button, true, 'Gerando com IA…');
    showOutput('generationOutput', `Gerando ${count} aula(s) para ${prepared.context?.disciplina || 'a turma aberta'}…`);
    const providerResponse = await request({
      type: 'SIAP_REQUEST', path: '/ai/generate.php', method: 'POST', token: auth.token,
      data: { model: 'gpt-4.1-mini', temperature: 0.3, max_tokens: Math.min(32000, Math.max(3500, count * 900)), messages: [{ role: 'system', content: 'Você responde apenas JSON válido.' }, { role: 'user', content: prepared.prompt }] }
    });
    const snapshot = await engine('PLANNING_STORE', { ...options, providerResponse }, 'planejamento', 30000);
    renderPlans(snapshot);
    showOutput('generationOutput', `${snapshot.count} aula(s) gerada(s). Revise a prévia e escolha “Aplicar próxima aula” ou “Aplicar todas”.`);
  } catch (error) {
    showOutput('generationOutput', error.message || 'Não foi possível gerar os planejamentos.', true);
  } finally { setBusy(button, false); }
}

async function runPlanning(command, message) {
  const button = command === 'PLANNING_APPLY_NEXT' ? byId('applyNext') : command === 'PLANNING_APPLY_ALL' ? byId('applyAll') : byId('stopPlanning');
  try {
    setBusy(button, true, command === 'PLANNING_STOP' ? 'Parando…' : 'Aplicando…');
    const snapshot = await engine(command, {}, 'planejamento', command === 'PLANNING_APPLY_ALL' ? 30000 : 15000);
    renderPlans(snapshot);
    showOutput('generationOutput', message);
  } catch (error) {
    // Se a aba do SIAP entrou em cache do navegador (back/forward cache), o
    // canal do service worker fecha depois da execução — a aplicação pode ter
    // concluído normalmente; nesse caso não exibimos o erro cru do Chrome.
    if (command !== 'PLANNING_STOP') {
      const raw = String(error?.message || '');
      if (/back\/forward cache|message channel is closed|Receiving end does not exist|Could not establish/i.test(raw)) {
        console.warn('[SiapAI] Canal fechado após execução (aba em cache do navegador);', raw);
        showOutput('generationOutput', 'Comando enviado. Se algo não responder, recarregue a página do SIAP.');
        return;
      }
    }
    showOutput('generationOutput', error.message || 'Não foi possível concluir.', true);
  } finally { setBusy(button, false); }
}

async function runFrequency(start) {
  const output = 'frequencyOutput';
  try {
    if (start) {
      const months = selectedMonths('frequencyMonths');
      if (!months.length) throw new Error('Selecione ao menos um mês para a frequência.');
      await engine('FREQUENCY_CONFIGURE', { months }, 'frequencia');
      await engine('FREQUENCY_START', {}, 'frequencia', 30000);
      showOutput(output, 'Frequência iniciada. Mantenha a tela do SIAP aberta até a conclusão.');
    } else {
      await engine('FREQUENCY_STOP', {}, 'frequencia');
      showOutput(output, 'Frequência interrompida pelo professor.');
    }
  } catch (error) { showOutput(output, error.message, true); }
}

async function runContent(start) {
  const output = 'contentOutput';
  try {
    if (start) {
      const months = selectedMonths('contentMonths');
      if (!months.length) throw new Error('Selecione ao menos um mês para o conteúdo programático.');
      const materials = selectedMaterials();
      await engine('CONTENT_CONFIGURE', { months, materials, autoMode: true, doubleLesson: byId('doubleLesson').checked, otherMaterialText: byId('otherMaterialText').value.trim() }, 'conteudo');
      await engine('CONTENT_START', {}, 'conteudo', 30000);
      showOutput(output, 'Conteúdo programático iniciado. Mantenha a aba “Conteúdos” ativa no SIAP.');
    } else {
      await engine('CONTENT_STOP', {}, 'conteudo');
      showOutput(output, 'Conteúdo programático interrompido pelo professor.');
    }
  } catch (error) { showOutput(output, error.message, true); }
}

async function generatePei() {
  const button = byId('generatePei');
  const auth = await refreshLicense();
  if (!auth?.token) return showOutput('peiOutput', 'Sua licença precisa estar ativa antes de gerar o PEI.', true);
  try {
    setBusy(button, true, 'Lendo PEI…');
    const instruction = byId('peiInstruction').value.trim();
    const months = selectedMonths('peiMonths');
    if (!months.length) throw new Error('Selecione ao menos um mês permitido para o PEI.');
    const payload = await engine('PEI_COLLECT', { instruction, months }, 'pei');
    setBusy(button, true, 'Gerando com IA…');
    const response = await request({ type: 'SIAP_REQUEST', path: '/pei_generate.php', method: 'POST', token: auth.token, data: payload });
    const data = response?.data?.data || response?.data || response;
    setBusy(button, true, 'Salvando no SIAP…');
    await engine('PEI_FILL_AND_SAVE', { data }, 'pei', 30000);
    showOutput('peiOutput', 'PEI gerado e salvo com confirmação do SIAP.');
  } catch (error) { showOutput('peiOutput', error.message || 'Não foi possível gerar o PEI.', true); } finally { setBusy(button, false); }
}

function initTabs() {
  document.querySelectorAll('.tab').forEach((button) => button.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((item) => item.classList.toggle('active', item === button));
    document.querySelectorAll('.module-panel').forEach((item) => item.classList.toggle('active', item.id === `panel-${button.dataset.tab}`));
    refreshContext().catch(() => {});
    if (button.dataset.tab === 'conteudo') refreshContentMaterials();
  }));
}

createMonthGrid('frequencyMonths');
createMonthGrid('contentMonths');
createMonthGrid('peiMonths');
byId('generatePlan').addEventListener('click', generatePlan);
byId('applyNext').addEventListener('click', () => runPlanning('PLANNING_APPLY_NEXT', 'Próxima aula enviada para os campos nativos do SIAP. Revise antes de salvar.'));
byId('applyAll').addEventListener('click', () => runPlanning('PLANNING_APPLY_ALL', 'Aplicação automática iniciada. Mantenha a tela do SIAP aberta.'));
byId('stopPlanning').addEventListener('click', () => runPlanning('PLANNING_STOP', 'Automação de planejamento interrompida.'));
byId('refreshPlans').addEventListener('click', refreshPlans);
byId('frequencyAll').addEventListener('click', () => setAllMonths('frequencyMonths', true));
byId('frequencyNone').addEventListener('click', () => setAllMonths('frequencyMonths', false));
byId('contentAll').addEventListener('click', () => setAllMonths('contentMonths', true));
byId('contentNone').addEventListener('click', () => setAllMonths('contentMonths', false));
byId('peiAll').addEventListener('click', () => setAllMonths('peiMonths', true));
byId('peiNone').addEventListener('click', () => setAllMonths('peiMonths', false));
byId('frequencyStart').addEventListener('click', () => runFrequency(true));
byId('frequencyStop').addEventListener('click', () => runFrequency(false));
byId('contentStart').addEventListener('click', () => runContent(true));
byId('contentStop').addEventListener('click', () => runContent(false));
byId('refreshContentMaterials').addEventListener('click', refreshContentMaterials);
byId('generatePei').addEventListener('click', generatePei);
byId('validateLicense').addEventListener('click', validateLicenseEmail);
initTabs();
Promise.all([refreshLicense(), refreshContext()]).then(() => refreshPlans());
chrome.tabs.onActivated.addListener(() => refreshContext().catch(() => {}));
chrome.tabs.onUpdated.addListener((_id, changeInfo) => { if (changeInfo.status === 'complete') refreshContext().catch(() => {}); });
