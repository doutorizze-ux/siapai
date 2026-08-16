// SiapAI v5.2.0 — Service Worker (background)
// Faz TODAS as requisições ao backend como extensão (imune a CSP/antivírus da página do SIAP).
// O content script e o PEI enviam requests via chrome.runtime.sendMessage.
(function () {
  'use strict';

  const API_BASE = 'https://siapai.online/api';
  const FALLBACK_BASE = ''; // quando publicar, trocar para a URL manus.space estável
  const DEFAULT_TIMEOUT_MS = 60000;
  const GENERATE_TIMEOUT_MS = 120000;
  const MAX_ATTEMPTS = 2;

  let currentBase = API_BASE;

  function getTimeout(path) {
    if (path === '/ai/generate.php' || path === '/pei_generate.php' || path === '/catalogo-siap.php') {
      return GENERATE_TIMEOUT_MS;
    }
    return DEFAULT_TIMEOUT_MS;
  }

  async function doFetch(path, method, headers, body) {
    let lastError = null;
    const bases = currentBase ? [currentBase, ...FALLBACK_BASE.split('|').filter(Boolean)] : [API_BASE];
    for (const base of bases) {
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), getTimeout(path));
          const response = await fetch(`${base}${path}`, {
            method,
            headers,
            body: body !== null && body !== undefined ? JSON.stringify(body) : undefined,
            signal: controller.signal
          });
          clearTimeout(timeoutId);
          const text = await response.text();
          let json = null;
          try {
            json = text ? JSON.parse(text) : null;
          } catch (parseErr) {
            throw new Error(`Resposta inválida do servidor: ${String(text || '').slice(0, 300)}`);
          }
          if (!response.ok) {
            const message = json?.error || json?.message || json?.details || `HTTP ${response.status}`;
            const err = new Error(String(message));
            err.status = response.status;
            err.json = json;
            throw err;
          }
          return json || {};
        } catch (err) {
          lastError = err;
          if (attempt < MAX_ATTEMPTS) {
            await new Promise((r) => setTimeout(r, 1500 * attempt));
            continue;
          }
          console.warn('[SiapAI] falha em', path, 'na base', base, err);
        }
      }
    }
    throw lastError instanceof Error ? lastError : new Error('Falha de comunicação com o servidor.');
  }

  function buildHeaders(token) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  }

  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error) => {
    console.warn('[SiapAI] não foi possível configurar o painel lateral:', error);
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || !message.type) return false;
    const handle = async () => {
      switch (message.type) {
        case 'SIAP_REQUEST': {
          const { path, method = 'POST', data = null, token = '' } = message;
          return doFetch(String(path), String(method), buildHeaders(token), data);
        }
        case 'SIAP_SET_BASE': {
          currentBase = String(message.base || API_BASE);
          return { ok: true, base: currentBase };
        }
        case 'SIAP_GET_BASE': {
          return { base: currentBase };
        }
        default:
          throw new Error(`Tipo de mensagem desconhecido: ${message.type}`);
      }
    };
    handle().then(
      (result) => sendResponse({ ok: true, data: result }),
      (err) => sendResponse({ ok: false, error: err?.message || String(err), status: err?.status })
    );
    return true; // resposta assíncrona
  });
})();
