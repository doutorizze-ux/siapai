const API_BASE = 'https://siapai.online/api';
const AFFILIATE_CODE_ENDPOINT = 'https://3000-iapks8ess2i0u4is0qm4u-0d60910d.us1.manus.computer/wp-json/planejapro/v1/affiliate-code';
const REF_BASE = 'https://siapai.app/';
const TUTORIAL_URL = 'https://siapai.app/';
const SUPORTE_URL = 'https://siapai.app/';
const SUPORTE_MSG_PREFIX = 'Olá, meu email é';
const CACHE_PREFIX = 'siap_saas_cache__';

const el = (id) => document.getElementById(id);

function formatDateBR(value) {
  if (!value) return 'Não informado';
  const text = String(value);
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(text)) return text;
  const date = new Date(text.replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return text;
  return date.toLocaleDateString('pt-BR');
}

function readCachedValue(raw) {
  try {
    const parsed = JSON.parse(raw || 'null');
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.expiresAt && parsed.expiresAt < Date.now()) return null;
    return parsed.value || null;
  } catch {
    return null;
  }
}

function firstValue(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== '') return String(value).trim();
  }
  return '';
}

function extractAffiliateCode(payload, auth) {
  const data = payload?.data || {};
  const user = payload?.user || data?.user || auth?.user || {};
  const license = payload?.license || data?.license || auth?.license || {};
  const affiliate = user.affiliate || user.afiliado || data?.affiliate || data?.afiliado || auth?.affiliate || auth?.afiliado || payload?.affiliate || payload?.afiliado || {};

  const code = firstValue(
    payload?.referral_code,
    payload?.referralCode,
    payload?.codigo,
    payload?.code,
    payload?.user?.referral_code,
    payload?.data?.referral_code,
    payload?.data?.referralCode,
    payload?.data?.codigo,
    payload?.data?.code,
    payload?.affiliate_code,
    payload?.codigo_afiliado,
    payload?.codigo_indicacao,
    user.referral_code,
    user.referralCode,
    user.affiliate_code,
    user.affiliateCode,
    user.codigo_afiliado,
    user.codigoAfiliado,
    user.codigo_indicacao,
    user.indicacao_codigo,
    affiliate.referral_code,
    affiliate.code,
    affiliate.codigo,
    affiliate.ref,
    license.referral_code,
    license.affiliate_code,
    auth?.referral_code,
    auth?.referralCode,
    auth?.user?.referral_code,
    auth?.affiliate_code,
    auth?.codigo_afiliado
  );
  return normalizeAffiliateCode(code);
}
function normalizeAffiliateCode(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    return (url.searchParams.get('ref') || raw).trim();
  } catch {
    const match = raw.match(/[?&]ref=([^&]+)/i);
    return match ? decodeURIComponent(match[1]).trim() : raw;
  }
}

function buildReferralLink(code) {
  const cleanCode = normalizeAffiliateCode(code);
  return cleanCode ? `${REF_BASE}?ref=${encodeURIComponent(cleanCode)}` : REF_BASE;
}

function setIndicacaoUrl(code, email) {
  const link = buildReferralLink(code);
  const input = el('linkIndicacao');
  const ajuda = el('indicacaoAjuda');
  if (input) input.value = link;
  if (ajuda) {
    ajuda.classList.toggle('erro', !code);
    ajuda.textContent = code
      ? 'Link curto pronto para copiar e divulgar.'
      : 'Código de indicação não encontrado. Atualize o plugin de afiliados para a versão com endpoint da extensão.';
  }
}

async function copyReferralLink() {
  const input = el('linkIndicacao');
  const button = el('btnCopiarIndicacao');
  if (!input || !button) return;
  const text = input.value || REF_BASE;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    input.focus();
    input.select();
    document.execCommand('copy');
  }
  button.textContent = 'Copiado';
  button.classList.add('copiado');
  setTimeout(() => {
    button.textContent = 'Copiar';
    button.classList.remove('copiado');
  }, 1800);
}

function updateSupportLink(email) {
  const cleanEmail = firstValue(email);
  const message = cleanEmail
    ? `${SUPORTE_MSG_PREFIX} ${cleanEmail} e preciso de ajuda`
    : 'Olá, preciso de ajuda';
  const btn = el('btnSuporte');
  if (btn) btn.href = `${SUPORTE_URL}?text=${encodeURIComponent(message)}`;
}

function renderStatus(payload, auth) {
  const license = payload?.license || auth?.license || {};
  const email = payload?.user?.email || auth?.email || '';
  updateSupportLink(email);
  const expired = !!payload?.expired || auth?.accessGranted === false;
  const days = Number(payload?.days_remaining ?? auth?.renewal?.days_remaining);
  const warning = !expired && Number.isFinite(days) && days <= 15;
  const validity = payload?.expires_at_br || formatDateBR(license.expires_at || license.valid_until || license.validade);

  const card = el('statusCard');
  const badge = el('statusBadge');
  card.classList.remove('expirado', 'aviso');
  badge.classList.remove('expirado', 'aviso');

  if (expired) {
    el('statusTitulo').textContent = 'Plano vencido';
    badge.textContent = 'Vencido';
    card.classList.add('expirado');
    badge.classList.add('expirado');
  } else if (warning) {
    el('statusTitulo').textContent = `Plano vence em ${days} dia(s)`;
    badge.textContent = 'Atenção';
    card.classList.add('aviso');
    badge.classList.add('aviso');
  } else {
    el('statusTitulo').textContent = 'Plano ativo';
    badge.textContent = 'Ativo';
  }

  el('validadePlano').textContent = validity;
  setIndicacaoUrl(extractAffiliateCode(payload, auth), email);
}

async function getStorage(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (result) => resolve(result || {}));
  });
}

async function getAuth() {
  const result = await getStorage(['auth', `${CACHE_PREFIX}auth`]);
  return result?.auth || readCachedValue(result?.[`${CACHE_PREFIX}auth`]) || null;
}

async function checkLicense(token) {
  const response = await fetch(`${API_BASE}/license/check.php`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` }
  });
  return response.json();
}


function authEmail(auth) {
  return firstValue(auth?.email, auth?.user?.email, auth?.license?.email);
}

async function requestAffiliateEndpoint(url, auth, method = 'GET', body = null) {
  const headers = auth?.token ? { Authorization: `Bearer ${auth.token}` } : {};
  const options = { method, headers };
  if (method !== 'GET') {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body || {});
  }
  const response = await fetch(url, options);
  const text = await response.text();
  try { return JSON.parse(text || '{}'); } catch { return {}; }
}

async function fetchAffiliateCode(auth) {
  const email = authEmail(auth);
  const userId = firstValue(auth?.user?.id, auth?.user_id, auth?.license?.user_id);
  const licenseKey = firstValue(auth?.license_key, auth?.license?.license_key, auth?.license?.key, auth?.key);
  const direct = extractAffiliateCode(null, auth);
  if (direct) return direct;

  const urls = [
    `${AFFILIATE_CODE_ENDPOINT}?email=${encodeURIComponent(email)}&user_id=${encodeURIComponent(userId)}&license=${encodeURIComponent(licenseKey)}`,
    `${AFFILIATE_CODE_ENDPOINT}`
  ];

  for (const url of urls) {
    try {
      const data = await requestAffiliateEndpoint(url, auth, 'GET');
      const code = extractAffiliateCode(data, auth);
      if (code) return code;
    } catch {}
  }

  try {
    const data = await requestAffiliateEndpoint(AFFILIATE_CODE_ENDPOINT, auth, 'POST', { email, user_id: userId, license: licenseKey });
    const code = extractAffiliateCode(data, auth);
    if (code) return code;
  } catch {}

  return '';
}

async function init() {
  el('btnTutorial').href = TUTORIAL_URL;
  el('btnSuporte').href = `${SUPORTE_URL}?text=${encodeURIComponent('Olá, preciso de ajuda')}`;
  el('btnCopiarIndicacao')?.addEventListener('click', copyReferralLink);

  const auth = await getAuth();
  updateSupportLink(authEmail(auth));
  if (!auth?.email) {
    el('statusTitulo').textContent = 'Faça login no SIAP';
    el('validadePlano').textContent = 'Abra o SIAP para validar';
    el('statusBadge').textContent = 'Aguardando';
    setIndicacaoUrl('', '');
    return;
  }

  setIndicacaoUrl(extractAffiliateCode(null, auth), auth.email);

  if (!auth?.token) {
    renderStatus(null, auth);
    return;
  }

  try {
    const status = await checkLicense(auth.token);
    if (status?.ok) renderStatus(status, auth);
    else renderStatus(null, auth);
  } catch (err) {
    renderStatus(null, auth);
  }

  const code = await fetchAffiliateCode(auth);
  if (code) setIndicacaoUrl(code, auth.email);
}

init();
