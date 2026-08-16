const API_BASE = 'https://siapai.online/api';
const CACHE_PREFIX = 'siap_saas_cache__';
const el = (id) => document.getElementById(id);

function formatDateBR(value) {
  if (!value) return 'Não informada';
  const text = String(value);
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(text)) return text;
  const date = new Date(text.replace(' ', 'T'));
  return Number.isNaN(date.getTime()) ? text : date.toLocaleDateString('pt-BR');
}

function readCachedValue(raw) {
  try {
    const parsed = JSON.parse(raw || 'null');
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.expiresAt && parsed.expiresAt < Date.now()) return null;
    return parsed.value || null;
  } catch { return null; }
}

async function getAuth() {
  const result = await new Promise((resolve) => chrome.storage.local.get(['auth', `${CACHE_PREFIX}auth`], resolve));
  return result?.auth || readCachedValue(result?.[`${CACHE_PREFIX}auth`]) || null;
}

async function checkLicense(token) {
  const response = await fetch(`${API_BASE}/license/check.php`, { headers: { Authorization: `Bearer ${token}` } });
  const text = await response.text();
  try { return JSON.parse(text); } catch { return { ok: false }; }
}

function renderState({ title, detail, validity, badge, tone = '' }) {
  const card = el('statusCard');
  const tag = el('statusBadge');
  card.classList.remove('expirado', 'aviso');
  tag.classList.remove('expirado', 'aviso');
  if (tone) { card.classList.add(tone); tag.classList.add(tone); }
  el('statusTitulo').textContent = title;
  el('statusDetail').textContent = detail;
  el('validadePlano').textContent = validity;
  tag.textContent = badge;
}

function renderStatus(status, auth) {
  if (!auth?.email) {
    renderState({ title: 'Entre no SIAP', detail: 'Abra o SIAP para validar seu e-mail.', validity: 'Aguardando acesso', badge: 'Aguardando' });
    return;
  }
  const license = status?.license || auth.license || {};
  const expired = status?.expired === true || auth.accessGranted === false;
  const days = Number(status?.days_remaining ?? auth?.renewal?.days_remaining);
  const warning = !expired && Number.isFinite(days) && days <= 15;
  const validity = status?.expires_at_br || formatDateBR(license.expires_at || license.valid_until || license.validade);
  if (expired) {
    renderState({ title: 'Licença vencida', detail: 'Regularize o acesso para continuar usando os módulos.', validity: `Validade: ${validity}`, badge: 'Vencida', tone: 'expirado' });
  } else if (warning) {
    renderState({ title: 'Licença próxima do vencimento', detail: `Restam ${days} dia(s) de acesso.`, validity: `Validade: ${validity}`, badge: 'Atenção', tone: 'aviso' });
  } else {
    renderState({ title: 'Licença ativa', detail: auth.email, validity: `Validade: ${validity}`, badge: 'Ativa' });
  }
}

async function init() {
  const button = el('btnAtualizar');
  button.addEventListener('click', init);
  button.disabled = true;
  button.textContent = 'Atualizando…';
  try {
    const auth = await getAuth();
    if (!auth?.token) { renderStatus(null, auth); return; }
    const status = await checkLicense(auth.token);
    renderStatus(status?.ok ? status : null, auth);
  } catch {
    const auth = await getAuth();
    renderStatus(null, auth);
  } finally {
    button.disabled = false;
    button.textContent = 'Atualizar status';
  }
}

init();
