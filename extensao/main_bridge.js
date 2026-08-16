(function () {
  'use strict';

  if (window.__SIAP_SAAS_MAIN_BRIDGE_READY__) return;
  window.__SIAP_SAAS_MAIN_BRIDGE_READY__ = true;

  function send(requestId, ok, payload) {
    window.postMessage({
      source: 'SIAP_SAAS_MAIN_BRIDGE',
      requestId: requestId,
      ok: !!ok,
      payload: payload || {}
    }, '*');
  }

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  async function waitForAnyGlobal(names, timeoutMs) {
    var startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      for (var i = 0; i < names.length; i++) {
        if (window[names[i]]) return window[names[i]];
      }
      await sleep(150);
    }
    return null;
  }

  async function initPage(pageKey, requiredGlobals) {
    if (pageKey === 'conteudo') {
      await waitForAnyGlobal(['SIAPExecutorConteudo', 'SIAPValidarConteudo'], 6000);
      if (!window.SIAPExecutorConteudo && window.SIAPValidarConteudo) window.SIAPExecutorConteudo = window.SIAPValidarConteudo;
      if (!window.SIAPValidarConteudo && window.SIAPExecutorConteudo) window.SIAPValidarConteudo = window.SIAPExecutorConteudo;
    }

    var missing = (requiredGlobals || []).filter(function (name) { return !window[name]; });
    if (missing.length) throw new Error('Módulos ausentes: ' + missing.join(', '));

    if (pageKey === 'planejamento') {
      if (!window.SIAPBootstrap || typeof window.SIAPBootstrap.init !== 'function') throw new Error('SIAPBootstrap.init não está disponível.');
      window.SIAPBootstrap.init();
    } else if (pageKey === 'planejamento_turma') {
      if (!window.SIAPTurmaPanel || typeof window.SIAPTurmaPanel.init !== 'function') throw new Error('SIAPTurmaPanel.init não está disponível.');
      window.SIAPTurmaPanel.init();
    } else if (pageKey === 'frequencia') {
      if (!window.SIAPFrequencia || typeof window.SIAPFrequencia.init !== 'function') throw new Error('SIAPFrequencia.init não está disponível.');
      window.SIAPFrequencia.init();
    } else if (pageKey === 'conteudo') {
      var mod = window.SIAPExecutorConteudo || window.SIAPValidarConteudo;
      if (!mod || typeof mod.init !== 'function') throw new Error('Módulo de conteúdo não está disponível.');
      mod.init();
    }
  }

  window.addEventListener('message', async function (event) {
    var data = event && event.data;
    if (!data || data.source !== 'SIAP_SAAS_CONTENT' || !data.requestId) return;

    try {
      if (data.action === 'ping') {
        send(data.requestId, true, { ready: true });
        return;
      }

      if (data.action === 'executeCode') {
        var code = String(data.code || '');
        if (!code.trim()) throw new Error('Código vazio recebido pelo bridge.');
        (0, eval)(code + '\n//# sourceURL=' + (data.sourceName || 'planeja-pro-protected-module.js'));
        send(data.requestId, true, { executed: true });
        return;
      }

      if (data.action === 'initPage') {
        await initPage(data.pageKey, data.requiredGlobals || []);
        send(data.requestId, true, { initialized: true, pageKey: data.pageKey });
        return;
      }
    } catch (err) {
      send(data.requestId, false, { message: err && err.message ? err.message : String(err) });
    }
  });
})();
