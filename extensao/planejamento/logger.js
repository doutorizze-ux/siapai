window.SIAPLogger = (() => {
  'use strict';

  const RUNTIME_KEY = '__SIAP_DIAGNOSTIC_LOGGER_V324__';
  const STORAGE_KEY = 'siap_diagnostico_aula_v324';
  const LOGGER_VERSION = '3.2.40-revisa-qualquer-bimestre';
  const MAX_RECORDS = 3200;
  const MAX_VISIBLE_ROWS = 650;
  const STALE_TRACE_MS = 2 * 60 * 60 * 1000;

  const previousRuntime = window[RUNTIME_KEY];
  if (previousRuntime?.api) {
    previousRuntime.rebind?.();
    setTimeout(() => previousRuntime.rebind?.(), 0);
    setTimeout(() => previousRuntime.rebind?.(), 500);
    return previousRuntime.api;
  }

  const nativeConsole = {
    log: typeof console?.log === 'function' ? console.log.bind(console) : () => {},
    warn: typeof console?.warn === 'function' ? console.warn.bind(console) : () => {},
    error: typeof console?.error === 'function' ? console.error.bind(console) : () => {}
  };

  let persistTimer = null;
  let toolbarTimer = null;
  let instrumentationTimer = null;
  let heartbeatTimer = null;
  let snapshotTimer = null;
  let lastSnapshotSignature = '';
  let ajaxStartedAt = 0;
  let ajaxSequence = 0;
  const activeSpans = new Map();

  function newTraceId() {
    const random = Math.random().toString(36).slice(2, 10);
    return `aula-${Date.now().toString(36)}-${random}`;
  }

  function emptyState() {
    return {
      schema: 1,
      loggerVersion: LOGGER_VERSION,
      traceId: '',
      active: false,
      status: 'aguardando',
      reason: '',
      startedAt: 0,
      completedAt: 0,
      records: [],
      pages: [],
      meta: {}
    };
  }

  function loadState() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return emptyState();
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return emptyState();
      parsed.records = Array.isArray(parsed.records) ? parsed.records.slice(-MAX_RECORDS) : [];
      parsed.pages = Array.isArray(parsed.pages) ? parsed.pages.slice(-30) : [];
      parsed.meta = parsed.meta && typeof parsed.meta === 'object' ? parsed.meta : {};
      if (parsed.active && parsed.startedAt && Date.now() - Number(parsed.startedAt) > STALE_TRACE_MS) {
        parsed.active = false;
        parsed.status = 'interrompido_por_tempo';
        parsed.completedAt = Date.now();
      }
      return { ...emptyState(), ...parsed };
    } catch (_) {
      return emptyState();
    }
  }

  let state = loadState();

  function saveStateNow() {
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      // Se o navegador limitar o sessionStorage, preserva a parte mais recente.
      try {
        state.records = state.records.slice(-1200);
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch (_) {
        nativeConsole.warn('[SIAP DIAG] Não foi possível persistir o diagnóstico.', err);
      }
    }
  }

  function schedulePersist(immediate = false) {
    if (immediate) {
      saveStateNow();
      return;
    }
    if (persistTimer) return;
    persistTimer = setTimeout(saveStateNow, 220);
  }

  function normalizeSpaces(value) {
    return String(value ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function redactText(value, limit = 1200) {
    let text = String(value ?? '');
    text = text
      .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+=*/gi, 'Bearer [REMOVIDO]')
      .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, '[CHAVE_REMOVIDA]')
      .replace(/\beyJ[A-Za-z0-9_-]{20,}(?:\.[A-Za-z0-9_-]+){1,2}\b/g, '[TOKEN_REMOVIDO]')
      .replace(/(["']?(?:password|senha|token|authorization|api[_-]?key)["']?\s*[:=]\s*["']?)[^"'\s,}&]+/gi, '$1[REMOVIDO]');
    if (text.length > limit) return `${text.slice(0, limit)}… [${text.length} caracteres]`;
    return text;
  }

  function safeUrl(value) {
    try {
      const url = new URL(String(value || ''), location.href);
      const names = Array.from(url.searchParams.keys());
      url.search = names.length ? `?${names.map(name => `${encodeURIComponent(name)}=[omitido]`).join('&')}` : '';
      url.hash = '';
      return redactText(url.toString(), 600);
    } catch (_) {
      return redactText(value, 600);
    }
  }

  function safeValue(value, depth = 0, seen = new WeakSet()) {
    if (value == null || typeof value === 'number' || typeof value === 'boolean') return value;
    if (typeof value === 'string') return redactText(value, 700);
    if (typeof value === 'function') return `[função ${value.name || 'anônima'}]`;
    if (typeof value !== 'object') return redactText(String(value), 300);
    if (depth > 4) return '[profundidade limitada]';
    if (seen.has(value)) return '[referência circular]';
    seen.add(value);

    if (value instanceof Error) {
      return {
        name: value.name,
        message: redactText(value.message, 900),
        stack: redactText(value.stack || '', 1800)
      };
    }
    if (value instanceof Element) return describeElement(value);
    if (Array.isArray(value)) {
      const sliced = value.slice(0, 24).map(item => safeValue(item, depth + 1, seen));
      if (value.length > sliced.length) sliced.push(`[+${value.length - sliced.length} item(ns)]`);
      return sliced;
    }

    const output = {};
    const blocked = /^(authorization|token|access[_-]?token|refresh[_-]?token|api[_-]?key|password|senha|secret|cookie)$/i;
    for (const key of Object.keys(value).slice(0, 45)) {
      output[key] = blocked.test(key) ? '[REMOVIDO]' : safeValue(value[key], depth + 1, seen);
    }
    return output;
  }

  function describeElement(element) {
    if (!element || typeof element !== 'object') return null;
    const tag = String(element.tagName || '').toLowerCase();
    const id = String(element.id || '');
    const name = String(element.name || '');
    const type = String(element.type || '');
    const text = normalizeSpaces(element.innerText || element.textContent || element.value || '').slice(0, 180);
    const href = element.getAttribute?.('href');
    return {
      tag,
      id,
      name,
      type,
      text: redactText(text, 180),
      href: href ? safeUrl(href) : undefined,
      disabled: !!element.disabled
    };
  }

  function elapsedMs(timestamp = Date.now()) {
    return state.startedAt ? Math.max(0, timestamp - Number(state.startedAt)) : 0;
  }

  function formatDuration(ms) {
    const value = Math.max(0, Number(ms) || 0);
    if (value < 1000) return `${Math.round(value)} ms`;
    if (value < 60000) return `${(value / 1000).toFixed(value < 10000 ? 3 : 2)} s`;
    const minutes = Math.floor(value / 60000);
    return `${minutes} min ${((value % 60000) / 1000).toFixed(1)} s`;
  }

  function formatClock(timestamp) {
    try {
      return new Date(timestamp).toLocaleTimeString('pt-BR', { hour12: false });
    } catch (_) {
      return new Date(timestamp).toISOString();
    }
  }

  function appendPanelRecord(record) {
    const box = document.querySelector('#tm-gpt-log');
    if (!box || !record) return;
    const row = document.createElement('div');
    row.className = `tm-gpt-log-line siap-diag-row siap-diag-${String(record.level || 'info').toLowerCase()}`;
    const duration = record.durationMs != null ? ` • ${formatDuration(record.durationMs)}` : '';
    row.textContent = `[+${(Number(record.elapsedMs || 0) / 1000).toFixed(3)}s] [${record.category}] ${record.message}${duration}`;
    box.prepend(row);
    while (box.children.length > MAX_VISIBLE_ROWS) box.lastElementChild?.remove();
  }

  function appendLegacyLine(message) {
    const box = document.querySelector('#tm-gpt-log');
    if (!box) return;
    const row = document.createElement('div');
    row.className = 'tm-gpt-log-line';
    row.textContent = `[${new Date().toLocaleTimeString()}] ${redactText(message, 1800)}`;
    box.prepend(row);
    while (box.children.length > MAX_VISIBLE_ROWS) box.lastElementChild?.remove();
  }

  function trace(level, category, message, data = null, options = {}) {
    if (!state.active && !options.allowInactive) return null;
    const timestamp = Date.now();
    const record = {
      seq: state.records.length ? Number(state.records[state.records.length - 1].seq || 0) + 1 : 1,
      timestamp,
      elapsedMs: elapsedMs(timestamp),
      level: String(level || 'INFO').toUpperCase(),
      category: String(category || 'GERAL').toUpperCase(),
      event: String(options.event || ''),
      message: redactText(message, 1600),
      durationMs: options.durationMs == null ? undefined : Math.round(Number(options.durationMs) || 0),
      data: data == null ? undefined : safeValue(data)
    };
    state.records.push(record);
    if (state.records.length > MAX_RECORDS) state.records.splice(0, state.records.length - MAX_RECORDS);
    schedulePersist(!!options.immediate);
    if (options.visible !== false) appendPanelRecord(record);
    updateToolbar();
    return record;
  }

  function getSelectedOption(selector) {
    const select = document.querySelector(selector);
    if (!select) return null;
    const option = select.options?.[select.selectedIndex];
    return {
      value: String(select.value || ''),
      text: normalizeSpaces(option?.textContent || option?.innerText || '')
    };
  }

  function collectSnapshot() {
    let context = {};
    try {
      const current = window.SIAPContext?.getCurrentContext?.() || {};
      context = {
        turma: normalizeSpaces(current.turma || ''),
        serie: normalizeSpaces(current.serie || current.serieAno || ''),
        disciplina: normalizeSpaces(current.disciplina || ''),
        eixo: normalizeSpaces(current.eixo || ''),
        bimestre: Number(current.bimestre || 0) || ''
      };
    } catch (_) {}

    let habilidadesSelecionadas = null;
    let conteudosSelecionados = null;
    let matrizSelecionada = null;
    try {
      const grid = document.querySelector('#cphFuncionalidade_cphCampos_gdvExpectativas');
      if (grid) habilidadesSelecionadas = Math.max(0, grid.querySelectorAll('tr').length - 1);
    } catch (_) {}
    try {
      const selected = window.SIAPConteudos?.getConteudosSelecionadosTextos?.();
      if (Array.isArray(selected)) conteudosSelecionados = selected.length;
    } catch (_) {}
    try {
      const selected = window.SIAPMatrizSaeb?.getSelectedTexts?.();
      if (Array.isArray(selected)) matrizSelecionada = selected.length;
    } catch (_) {}

    const metodologia = document.querySelector('#cphFuncionalidade_cphCampos_txtMetodologia');
    const avaliacao = document.querySelector('#cphFuncionalidade_cphCampos_txtAvaliacao');
    const personalizado = document.querySelector('#cphFuncionalidade_cphCampos_lstConteudos_txtDescricaoConteudo_0, textarea[id*="lstConteudos_txtDescricaoConteudo"]');
    const aula = document.querySelector('#cphFuncionalidade_cphCampos_txtNumeroAula');
    const customSave = document.querySelector('#siap_btn_salvar_abrir_proxima');
    const legacySave = document.querySelector('#cphFuncionalidade_cphCampos_btnSalvarProximo');
    let prmBusy = null;
    try {
      prmBusy = !!window.SIAPUtils?.getPageRequestManager?.()?.get_isInAsyncPostBack?.();
    } catch (_) {}

    return {
      url: safeUrl(location.href),
      readyState: document.readyState,
      aula: normalizeSpaces(aula?.value || ''),
      contexto: context,
      eixoSelect: getSelectedOption('#ddlEixo, select[id$="ddlEixo"], select[name$="$ddlEixo"]'),
      bimestreSelect: getSelectedOption('#cphFuncionalidade_cphCampos_ddlBimestre, #ddlBimestre, select[id$="ddlBimestre"], select[name$="$ddlBimestre"]'),
      selecionados: {
        habilidades: habilidadesSelecionadas,
        conteudos: conteudosSelecionados,
        matrizSaeb: matrizSelecionada
      },
      campos: {
        metodologiaExiste: !!metodologia,
        metodologiaCaracteres: String(metodologia?.value || '').length,
        avaliacaoExiste: !!avaliacao,
        avaliacaoCaracteres: String(avaliacao?.value || '').length,
        personalizadoExiste: !!personalizado,
        personalizadoCaracteres: String(personalizado?.value || '').length
      },
      salvar: {
        botaoNovoExiste: !!customSave,
        botaoNovoDesabilitado: !!customSave?.disabled,
        botaoAntigoExiste: !!legacySave,
        botaoAntigoDesabilitado: !!legacySave?.disabled
      },
      postbackEmAndamento: prmBusy
    };
  }

  function recordSnapshot(reason, force = false) {
    if (!state.active) return;
    const snapshot = collectSnapshot();
    const signature = JSON.stringify(snapshot);
    if (!force && signature === lastSnapshotSignature) return;
    lastSnapshotSignature = signature;
    trace('INFO', 'ESTADO', `Estado da tela: ${reason}`, snapshot, { event: 'snapshot', visible: force });
  }

  function scheduleSnapshot(reason, delay = 350) {
    if (!state.active) return;
    if (snapshotTimer) clearTimeout(snapshotTimer);
    snapshotTimer = setTimeout(() => {
      snapshotTimer = null;
      recordSnapshot(reason, false);
    }, delay);
  }

  function traceConfig() {
    const config = window.SIAPConfig || {};
    return {
      model: config.MODEL || '',
      clickDelayMs: config.CLICK_DELAY_MS,
      afterSaveDelayMs: config.AFTER_SAVE_DELAY_MS,
      waitTimeoutMs: config.WAIT_TIMEOUT_MS,
      autoResumeDelayMs: config.AUTO_RESUME_DELAY_MS,
      loggerVersion: LOGGER_VERSION
    };
  }

  function startTrace(reason = 'Início manual', options = {}) {
    if (state.active && !options.force) {
      trace('INFO', 'SESSÃO', `Novo marco: ${reason}`, null, { event: 'mark', immediate: true });
      return state.traceId;
    }

    state = emptyState();
    state.traceId = newTraceId();
    state.active = true;
    state.status = 'em_andamento';
    state.reason = normalizeSpaces(reason) || 'Início manual';
    state.startedAt = Date.now();
    state.meta = {
      userAgent: navigator.userAgent,
      language: navigator.language,
      viewport: `${window.innerWidth || 0}x${window.innerHeight || 0}`,
      initialUrl: safeUrl(location.href),
      config: traceConfig()
    };
    state.pages.push({ timestamp: Date.now(), url: safeUrl(location.href), reason: 'inicio' });
    lastSnapshotSignature = '';
    activeSpans.clear();
    trace('INFO', 'SESSÃO', `Diagnóstico iniciado: ${state.reason}`, state.meta, {
      event: 'start',
      immediate: true
    });
    recordSnapshot('início do diagnóstico', true);
    renderStoredRecords();
    updateToolbar();
    return state.traceId;
  }

  function finishTrace(status = 'concluido', message = 'Planejamento da aula finalizado') {
    if (!state.active) return;
    recordSnapshot('estado final', true);
    trace(status === 'concluido' ? 'OK' : 'ERRO', 'SESSÃO', message, {
      spansAindaAbertos: Array.from(activeSpans.values()).map(span => ({
        label: span.label,
        abertoHaMs: Date.now() - span.startedAt
      }))
    }, { event: 'finish', immediate: true });
    state.active = false;
    state.status = status;
    state.completedAt = Date.now();
    activeSpans.clear();
    saveStateNow();
    updateToolbar();
  }

  function updateStatus(message) {
    const el = document.querySelector('#tm-gpt-status');
    if (el) el.textContent = message;
  }

  function appendLog(message) {
    appendLegacyLine(message);
  }

  function log(...args) {
    const message = args.map(value => {
      if (typeof value === 'string') return value;
      try { return JSON.stringify(safeValue(value)); } catch (_) { return String(value); }
    }).join(' ');
    const safeMessage = redactText(message, 1800);

    if (/^Preenchendo aula\s+\d+/i.test(safeMessage) && !state.active) {
      startTrace('Preenchimento de uma aula iniciado automaticamente');
    }

    if (window.SIAPConfig?.DEBUG) nativeConsole.log('[SIAP GPT]', ...args);
    updateStatus(safeMessage);
    appendLegacyLine(safeMessage);
    trace(
      /(?:erro|falhou|falha total|não pôde|não conseguiu)/i.test(safeMessage) ? 'AVISO' : 'INFO',
      'FLUXO',
      safeMessage,
      null,
      { event: 'legacy_log', visible: false }
    );

    if (/^Aula\s+\d+\s+conclu[ií]da\.?$/i.test(safeMessage) || /✔\s*Replica[cç][aã]o finalizada/i.test(safeMessage)) {
      finishTrace('concluido', `Aula finalizada com sucesso: ${safeMessage}`);
    } else if (/Erro (?:ao aplicar|no autom[aá]tico|ao gerar planejamento)|Execu[cç][aã]o autom[aá]tica parada/i.test(safeMessage)) {
      finishTrace('finalizado_com_erro', `Diagnóstico encerrado após falha/interrupção: ${safeMessage}`);
    }
  }

  function beginSpan(category, label, data = null, options = {}) {
    if (!state.active) return null;
    const span = {
      id: `${category}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      category: String(category || 'OPERAÇÃO').toUpperCase(),
      label,
      startedAt: Date.now()
    };
    activeSpans.set(span.id, span);
    if (options.logStart !== false) {
      trace('INFO', span.category, `INÍCIO — ${label}`, data, {
        event: 'span_start',
        visible: options.visibleStart !== false
      });
    }
    return span;
  }

  function endSpan(span, ok, data = null, error = null, options = {}) {
    if (!span) return;
    const duration = Date.now() - span.startedAt;
    activeSpans.delete(span.id);
    const visible = options.visibleEnd === false
      ? false
      : (options.visibleThresholdMs == null || duration >= Number(options.visibleThresholdMs));
    trace(ok ? 'OK' : 'ERRO', span.category, `${ok ? 'FIM' : 'FALHA'} — ${span.label}`, {
      ...(data == null ? {} : { resultado: data }),
      ...(error ? { erro: safeValue(error) } : {})
    }, {
      event: ok ? 'span_end' : 'span_error',
      durationMs: duration,
      visible,
      immediate: !ok
    });
    scheduleSnapshot(`após ${span.label}`, 250);
  }

  function summarizeBody(body) {
    if (body == null) return null;
    if (typeof body === 'string') {
      const chars = body.length;
      const trimmed = body.trim();
      if (trimmed.startsWith('{') && chars <= 750000) {
        try {
          const json = JSON.parse(trimmed);
          const summary = { tipo: 'json', caracteres: chars, chaves: Object.keys(json).slice(0, 30) };
          if (json.model) summary.model = json.model;
          if (json.max_tokens || json.max_completion_tokens) summary.maxTokens = json.max_tokens || json.max_completion_tokens;
          if (Array.isArray(json.messages)) {
            summary.mensagens = json.messages.map(item => ({
              role: item?.role || '',
              caracteres: String(item?.content || '').length
            }));
          }
          if (json.action) summary.action = json.action;
          if (json.contexto) summary.contexto = safeValue(json.contexto);
          if (Array.isArray(json.habilidades)) summary.totalHabilidades = json.habilidades.length;
          if (Array.isArray(json.conteudos)) summary.totalConteudos = json.conteudos.length;
          if (Array.isArray(json.matriz_saeb)) summary.totalMatrizSaeb = json.matriz_saeb.length;
          if (json.habilidade) summary.habilidade = safeValue(json.habilidade);
          if (json.conteudo) summary.conteudo = safeValue(json.conteudo);
          return summary;
        } catch (_) {}
      }
      const parts = trimmed ? trimmed.split('&') : [];
      return {
        tipo: 'formulario/texto',
        caracteres: chars,
        totalCampos: parts.length,
        nomesCampos: parts.slice(0, 25).map(part => {
          const key = part.split('=', 1)[0] || '';
          try { return decodeURIComponent(key.replace(/\+/g, ' ')); } catch (_) { return key; }
        })
      };
    }
    if (typeof FormData !== 'undefined' && body instanceof FormData) {
      const keys = [];
      try { for (const key of body.keys()) keys.push(String(key)); } catch (_) {}
      return { tipo: 'FormData', totalCampos: keys.length, nomesCampos: keys.slice(0, 30) };
    }
    if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) {
      return summarizeBody(body.toString());
    }
    return { tipo: Object.prototype.toString.call(body), resumo: redactText(String(body), 250) };
  }

  function summarizeResult(value, spec = {}) {
    if (typeof spec.result === 'function') {
      try { return spec.result(value); } catch (err) { return { erroResumo: String(err) }; }
    }
    if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string' || value == null) return value;
    if (Array.isArray(value)) return { total: value.length, primeiros: safeValue(value.slice(0, 4)) };
    return safeValue(value);
  }

  function wrapMethod(globalName, methodName, spec = {}) {
    const object = window[globalName];
    const original = object?.[methodName];
    if (!object || typeof original !== 'function' || original.__siapDiagnosticWrapped) return !!original;

    function wrapped(...args) {
      if (spec.startReason && !state.active) startTrace(spec.startReason);
      const label = typeof spec.label === 'function' ? spec.label(args) : (spec.label || `${globalName}.${methodName}`);
      let argSummary = null;
      try { argSummary = typeof spec.args === 'function' ? spec.args(args) : safeValue(args); } catch (_) {}
      const span = beginSpan(spec.category || globalName, label, argSummary, {
        logStart: spec.logStart !== false,
        visibleStart: spec.visibleStart !== false
      });

      let result;
      try {
        result = original.apply(this, args);
      } catch (err) {
        endSpan(span, false, null, err, spec);
        throw err;
      }

      if (result && typeof result.then === 'function') {
        return Promise.resolve(result).then(value => {
          endSpan(span, true, summarizeResult(value, spec), null, spec);
          return value;
        }, err => {
          endSpan(span, false, null, err, spec);
          throw err;
        });
      }

      endSpan(span, true, summarizeResult(result, spec), null, spec);
      return result;
    }

    try { Object.defineProperty(wrapped, 'name', { value: original.name || methodName }); } catch (_) {}
    wrapped.__siapDiagnosticWrapped = true;
    wrapped.__siapDiagnosticOriginal = original;
    object[methodName] = wrapped;
    return true;
  }

  function instrumentModuleMethods() {
    const textArg = args => ({ solicitado: redactText(args?.[0] || '', 500), tentativa: args?.[1] });
    const locationResult = value => ({
      total: Array.isArray(value) ? value.length : 0,
      locais: Array.isArray(value) ? value.slice(0, 8).map(item => ({
        siapId: item?.siap_id || '',
        codigo: item?.codigo || '',
        texto: redactText(item?.texto || item?.descricao || '', 280),
        eixo: item?.eixo || '',
        bimestre: item?.bimestre || '',
        caminhoPostback: redactText(item?.caminho_postback || item?.postback_argument || '', 280)
      })) : []
    });

    const specs = [
      ['SIAPExecutor', 'generatePlans', { category: 'GERAÇÃO', label: 'Gerar planejamento', startReason: 'Geração de uma aula iniciada', args: () => ({ quantidadeSolicitada: document.querySelector('#tm-gpt-qtd')?.value || '', instrucaoCaracteres: String(document.querySelector('#tm-gpt-content')?.value || '').length }) }],
      ['SIAPExecutor', 'applyNextPlan', { category: 'AULA', label: 'Aplicar próxima aula', startReason: 'Aplicação de uma aula iniciada' }],
      ['SIAPExecutor', 'applyAllPlans', { category: 'AULA', label: 'Aplicação automática', startReason: 'Aplicação automática de uma aula iniciada' }],
      ['SIAPExecutor', 'autoResumeIfNeeded', { category: 'RETOMADA', label: 'Verificar retomada automática', logStart: false, visibleThresholdMs: 1000 }],
      ['SIAPExecutor', 'fillPlanOnPage', { category: 'AULA', label: 'Preencher todos os campos da aula', startReason: 'Preenchimento de uma aula iniciado', args: args => ({ salvarEAbrirProxima: args?.[1] !== false, plano: { titulo: args?.[0]?.titulo || '', habilidades: args?.[0]?.habilidades || [], conteudos: args?.[0]?.conteudos || [], matrizSaeb: args?.[0]?.matrizSaeb || [], metodologiaCaracteres: String(args?.[0]?.metodologia || '').length, avaliacaoCaracteres: String(args?.[0]?.avaliacao || '').length } }) }],
      ['SIAPApi', 'callOpenAI', { category: 'IA', label: args => `API de IA para ${args?.[0] || 1} aula(s)`, args: args => ({ quantidade: args?.[0], instrucaoCaracteres: String(args?.[1] || '').length, contexto: { turma: args?.[3]?.turma || '', disciplina: args?.[3]?.disciplina || '', serie: args?.[3]?.serie || args?.[3]?.serieAno || '', eixo: args?.[3]?.eixo || '', bimestre: args?.[3]?.bimestre || '' } }), result: value => ({ aulasRetornadas: Array.isArray(value?.aulas) ? value.aulas.length : 0, titulos: Array.isArray(value?.aulas) ? value.aulas.slice(0, 5).map(aula => aula?.titulo || '') : [] }) }],
      ['SIAPApi', 'resolveInstructionFromCatalog', { category: 'CATÁLOGO', label: 'Confirmar comando no banco', args: args => ({ instrucao: redactText(args?.[0] || '', 700) }), result: safeValue }],
      ['SIAPApi', 'syncCurrentCatalog', { category: 'CATÁLOGO', label: 'Sincronizar catálogo atual', args: args => safeValue(args?.[0] || {}), visibleThresholdMs: 500 }],
      ['SIAPApi', 'findHabilidadeLocations', { category: 'CATÁLOGO', label: args => `Consultar habilidade: ${redactText(args?.[0] || '', 180)}`, args: textArg, result: locationResult }],
      ['SIAPApi', 'findConteudoLocations', { category: 'CATÁLOGO', label: args => `Consultar conteúdo: ${redactText(args?.[0] || '', 180)}`, args: textArg, result: locationResult }],
      ['SIAPHabilidades', 'addHabilidadeByText', { category: 'HABILIDADE', label: args => `Adicionar habilidade: ${redactText(args?.[0] || '', 240)}`, args: textArg }],
      ['SIAPHabilidades', 'addHabilidadeByDirectPostback', { category: 'HABILIDADE', label: args => `Postback direto da habilidade ${args?.[1] || ''}`, args: args => ({ texto: redactText(args?.[0] || '', 400), siapId: args?.[1] || '' }) }],
      ['SIAPConteudos', 'addConteudoByText', { category: 'CONTEÚDO', label: args => `Adicionar conteúdo: ${redactText(args?.[0] || '', 240)}`, args: textArg }],
      ['SIAPConteudos', 'addConteudoByDirectPostback', { category: 'CONTEÚDO', label: args => `Postback direto do conteúdo ${args?.[1]?.siap_id || ''}`, args: args => ({ texto: redactText(args?.[0] || '', 400), local: safeValue(args?.[1] || {}) }) }],
      ['SIAPMatrizSaeb', 'addMatrizSaebByText', { category: 'MATRIZ SAEB', label: args => `Adicionar item SAEB: ${redactText(args?.[0] || '', 240)}`, args: textArg }],
      ['SIAPEixo', 'selectEixo', { category: 'NAVEGAÇÃO', label: args => `Selecionar eixo: ${redactText(args?.[0]?.text || args?.[0]?.value || args?.[0] || '', 180)}`, args: args => safeValue(args) }],
      ['SIAPBimestre', 'selectBimestre', { category: 'NAVEGAÇÃO', label: args => `Selecionar bimestre: ${redactText(args?.[0]?.text || args?.[0]?.value || args?.[0] || '', 180)}`, args: args => safeValue(args) }],
      ['SIAPValidation', 'validarAntesDeSalvar', { category: 'VALIDAÇÃO', label: 'Validar campos antes de salvar', result: safeValue }],
      ['SIAPUtils', 'setTextareaValue', { category: 'CAMPO', label: args => `Preencher textarea ${String(args?.[0] || '')}`, args: args => ({ seletor: args?.[0] || '', caracteres: String(args?.[1] || '').length }) }],
      ['SIAPUtils', 'safeClick', { category: 'CLIQUE', label: args => `Clique programático em ${args?.[0]?.id || args?.[0]?.tagName || 'elemento'}`, args: args => describeElement(args?.[0]), visibleThresholdMs: 100 }],
      ['SIAPUtils', 'firePostBackInPage', { category: 'POSTBACK', label: args => `Disparar __doPostBack: ${args?.[0] || ''} / ${args?.[1] || ''}`, args: args => ({ eventTarget: args?.[0] || '', eventArgument: args?.[1] || '' }) }],
      ['SIAPUtils', 'runJavascriptHrefInPage', { category: 'POSTBACK', label: 'Executar href javascript do SIAP', args: args => describeElement(args?.[0]) }],
      ['SIAPUtils', 'runTreeNodePostbackInPage', { category: 'POSTBACK', label: 'Executar TreeView_SelectNode do SIAP', args: args => describeElement(args?.[0]) }],
      ['SIAPUtils', 'waitForAsyncPostBack', { category: 'ESPERA', label: args => `Aguardar postback assíncrono (limite ${args?.[0] || 3500} ms)`, args: args => ({ timeout: args?.[0] || 3500, janelaInicio: args?.[1] || 700 }), logStart: false, visibleThresholdMs: 1000 }],
      ['SIAPUtils', 'waitUntil', { category: 'ESPERA', label: args => `Aguardar condição (limite ${args?.[1] || window.SIAPConfig?.WAIT_TIMEOUT_MS || 0} ms)`, args: args => ({ timeout: args?.[1], intervalo: args?.[2] }), logStart: false, visibleThresholdMs: 1000 }],
      ['SIAPUtils', 'sleep', { category: 'PAUSA FIXA', label: args => `Pausa programada de ${Number(args?.[0] || 0)} ms`, args: args => ({ programadoMs: Number(args?.[0] || 0) }), logStart: false, visibleThresholdMs: 750 }]
    ];

    for (const [globalName, methodName, spec] of specs) wrapMethod(globalName, methodName, spec);
  }

  function installFetchInstrumentation() {
    if (typeof window.fetch !== 'function' || window.fetch.__siapDiagnosticWrapped) return;
    const originalFetch = window.fetch;
    async function diagnosticFetch(input, init = {}) {
      const url = typeof input === 'string' ? input : (input?.url || '');
      const method = String(init?.method || input?.method || 'GET').toUpperCase();
      const span = beginSpan('REDE', `${method} ${safeUrl(url)}`, {
        transporte: 'fetch',
        corpo: summarizeBody(init?.body)
      }, { visibleStart: false });
      try {
        const response = await originalFetch.apply(this, arguments);
        endSpan(span, response.ok, {
          status: response.status,
          statusText: response.statusText,
          type: response.type,
          redirected: response.redirected,
          urlFinal: safeUrl(response.url)
        }, response.ok ? null : new Error(`HTTP ${response.status}`), { visibleThresholdMs: 400 });
        return response;
      } catch (err) {
        endSpan(span, false, { url: safeUrl(url), method }, err);
        throw err;
      }
    }
    diagnosticFetch.__siapDiagnosticWrapped = true;
    diagnosticFetch.__siapDiagnosticOriginal = originalFetch;
    window.fetch = diagnosticFetch;
  }

  function installXhrInstrumentation() {
    const proto = window.XMLHttpRequest?.prototype;
    if (!proto || proto.open?.__siapDiagnosticWrapped) return;
    const originalOpen = proto.open;
    const originalSend = proto.send;
    const xhrMeta = new WeakMap();

    function diagnosticOpen(method, url) {
      xhrMeta.set(this, { method: String(method || 'GET').toUpperCase(), url: safeUrl(url), openedAt: Date.now() });
      return originalOpen.apply(this, arguments);
    }
    diagnosticOpen.__siapDiagnosticWrapped = true;

    function diagnosticSend(body) {
      const meta = xhrMeta.get(this) || { method: 'GET', url: '(desconhecida)' };
      const span = beginSpan('REDE', `${meta.method} ${meta.url}`, {
        transporte: 'XMLHttpRequest',
        corpo: summarizeBody(body)
      }, { visibleStart: false });
      const finalize = () => {
        try {
          const ok = Number(this.status || 0) >= 200 && Number(this.status || 0) < 400;
          endSpan(span, ok, {
            status: Number(this.status || 0),
            statusText: this.statusText || '',
            responseURL: safeUrl(this.responseURL || meta.url),
            respostaCaracteres: typeof this.responseText === 'string' ? this.responseText.length : null
          }, ok ? null : new Error(`XHR HTTP ${this.status || 0}`), { visibleThresholdMs: 400 });
        } catch (err) {
          endSpan(span, false, null, err);
        }
      };
      this.addEventListener('loadend', finalize, { once: true });
      return originalSend.apply(this, arguments);
    }
    diagnosticSend.__siapDiagnosticWrapped = true;

    proto.open = diagnosticOpen;
    proto.send = diagnosticSend;
  }

  function installNativePostbackInstrumentation() {
    const original = window.__doPostBack;
    if (typeof original === 'function' && !original.__siapDiagnosticWrapped) {
      function diagnosticPostBack(eventTarget, eventArgument) {
        trace('INFO', 'POSTBACK', '__doPostBack chamado', {
          eventTarget: redactText(eventTarget, 400),
          eventArgument: redactText(eventArgument, 700)
        }, { event: 'native_postback' });
        return original.apply(this, arguments);
      }
      diagnosticPostBack.__siapDiagnosticWrapped = true;
      diagnosticPostBack.__siapDiagnosticOriginal = original;
      window.__doPostBack = diagnosticPostBack;
    }
  }

  function bindPageRequestManager() {
    let prm = null;
    try {
      prm = window.Sys?.WebForms?.PageRequestManager?.getInstance?.();
    } catch (_) {}
    if (!prm || prm.__siapDiagnosticBound) return false;
    prm.__siapDiagnosticBound = true;

    prm.add_initializeRequest?.((_sender, args) => {
      ajaxSequence += 1;
      const element = args?.get_postBackElement?.();
      trace('INFO', 'ASP.NET AJAX', `initializeRequest #${ajaxSequence}`, { elemento: describeElement(element) }, { event: 'ajax_initialize', visible: false });
    });
    prm.add_beginRequest?.((_sender, args) => {
      ajaxStartedAt = Date.now();
      const element = args?.get_postBackElement?.();
      trace('INFO', 'ASP.NET AJAX', `beginRequest #${ajaxSequence}`, { elemento: describeElement(element) }, { event: 'ajax_begin' });
    });
    prm.add_pageLoading?.(() => {
      trace('INFO', 'ASP.NET AJAX', `pageLoading #${ajaxSequence}`, null, { event: 'ajax_page_loading', visible: false });
    });
    prm.add_pageLoaded?.(() => {
      trace('INFO', 'ASP.NET AJAX', `pageLoaded #${ajaxSequence}`, null, { event: 'ajax_page_loaded', visible: false });
      scheduleSnapshot(`pageLoaded do postback #${ajaxSequence}`, 180);
    });
    prm.add_endRequest?.((_sender, args) => {
      const duration = ajaxStartedAt ? Date.now() - ajaxStartedAt : 0;
      let error = null;
      try { error = args?.get_error?.() || null; } catch (_) {}
      trace(error ? 'ERRO' : 'OK', 'ASP.NET AJAX', `endRequest #${ajaxSequence}`, {
        erro: error ? safeValue(error) : null
      }, { event: 'ajax_end', durationMs: duration, immediate: !!error });
      ajaxStartedAt = 0;
      scheduleSnapshot(`fim do postback #${ajaxSequence}`, 250);
    });
    return true;
  }

  function isRelevantElement(element) {
    if (!element?.matches) return false;
    return element.matches(
      '#tm-gpt-panel *, #cphFuncionalidade_cphCampos_treeView *, #conteudomatrizsaebs *, ' +
      '#ddlEixo, select[id$="ddlEixo"], select[name$="$ddlEixo"], ' +
      '#cphFuncionalidade_cphCampos_ddlBimestre, #ddlBimestre, select[id$="ddlBimestre"], select[name$="$ddlBimestre"], ' +
      '#siap_btn_salvar_abrir_proxima, #cphFuncionalidade_cphCampos_btnSalvarProximo, #cphFuncionalidade_cphCampos_btnReplicar'
    );
  }

  function installDomInstrumentation() {
    if (document.documentElement?.dataset?.siapDiagnosticBound === '1') return;
    if (document.documentElement) document.documentElement.dataset.siapDiagnosticBound = '1';

    document.addEventListener('click', event => {
      const target = event.target?.closest?.('button, input[type="button"], input[type="submit"], a, select, label');
      const id = String(target?.id || '');
      if (id === 'tm-gpt-generate') {
        startTrace('Clique em Gerar planejamentos', { force: true });
      } else if (id === 'tm-gpt-apply') {
        startTrace('Clique em Aplicar próxima aula');
      } else if (id === 'tm-gpt-auto') {
        startTrace('Clique em Aplicar todas');
      }
      if (!state.active || !target || !isRelevantElement(target)) return;
      trace('INFO', 'INTERAÇÃO', 'Clique capturado', { elemento: describeElement(target), confiavel: !!event.isTrusted }, { event: 'click', visible: false });
      scheduleSnapshot(`clique em ${id || target.tagName}`, 300);
    }, true);

    document.addEventListener('change', event => {
      const target = event.target;
      if (!state.active || !target || !isRelevantElement(target)) return;
      trace('INFO', 'INTERAÇÃO', 'Alteração de campo capturada', {
        elemento: describeElement(target),
        valor: target.matches?.('select') ? getSelectedOption(`#${CSS.escape(target.id)}`) : undefined
      }, { event: 'change' });
      scheduleSnapshot('alteração de campo', 300);
    }, true);

    document.addEventListener('submit', event => {
      if (!state.active) return;
      trace('INFO', 'FORMULÁRIO', 'Envio de formulário detectado', {
        action: safeUrl(event.target?.action || location.href),
        method: event.target?.method || 'GET'
      }, { event: 'submit', immediate: true });
      recordSnapshot('antes do envio do formulário', true);
    }, true);

    window.addEventListener('error', event => {
      if (!state.active) return;
      trace('ERRO', 'JAVASCRIPT', 'Erro não tratado', {
        message: event.message,
        arquivo: safeUrl(event.filename),
        linha: event.lineno,
        coluna: event.colno,
        erro: safeValue(event.error)
      }, { event: 'window_error', immediate: true });
    });

    window.addEventListener('unhandledrejection', event => {
      if (!state.active) return;
      trace('ERRO', 'PROMISE', 'Promise rejeitada sem tratamento', safeValue(event.reason), {
        event: 'unhandled_rejection',
        immediate: true
      });
    });

    window.addEventListener('pagehide', event => {
      if (state.active) {
        trace('INFO', 'NAVEGAÇÃO', 'Saindo da página; diagnóstico será retomado na próxima tela', {
          persisted: !!event.persisted,
          url: safeUrl(location.href)
        }, { event: 'pagehide', immediate: true, visible: false });
        recordSnapshot('antes de sair da página', false);
      }
      saveStateNow();
    });

    window.addEventListener('pageshow', event => {
      if (!state.active) return;
      state.pages.push({ timestamp: Date.now(), url: safeUrl(location.href), reason: event.persisted ? 'bfcache' : 'carregamento' });
      trace('INFO', 'NAVEGAÇÃO', 'Página carregada; diagnóstico retomado', {
        persisted: !!event.persisted,
        url: safeUrl(location.href),
        readyState: document.readyState
      }, { event: 'pageshow', immediate: true });
      recordSnapshot('página retomada', true);
    });

    try {
      const observer = new MutationObserver(() => {
        if (state.active) scheduleSnapshot('mudança relevante no HTML', 420);
        ensureToolbar();
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
    } catch (_) {}
  }

  function installPerformanceInstrumentation() {
    if (window.__SIAP_DIAGNOSTIC_PERFORMANCE_BOUND__) return;
    window.__SIAP_DIAGNOSTIC_PERFORMANCE_BOUND__ = true;
    if (typeof PerformanceObserver !== 'function') return;

    try {
      const resourceObserver = new PerformanceObserver(list => {
        if (!state.active) return;
        for (const entry of list.getEntries()) {
          if (Number(entry.duration || 0) < 100) continue;
          trace('INFO', 'RECURSO', `${entry.initiatorType || 'recurso'}: ${safeUrl(entry.name)}`, {
            transferidosBytes: entry.transferSize || 0,
            corpoBytes: entry.decodedBodySize || 0,
            protocolo: entry.nextHopProtocol || ''
          }, { event: 'resource', durationMs: entry.duration, visible: Number(entry.duration || 0) >= 1000 });
        }
      });
      resourceObserver.observe({ type: 'resource', buffered: true });
    } catch (_) {}

    try {
      const longTaskObserver = new PerformanceObserver(list => {
        if (!state.active) return;
        for (const entry of list.getEntries()) {
          trace('AVISO', 'NAVEGADOR', 'Tarefa longa bloqueou a página', {
            nome: entry.name || '',
            inicioPerformanceMs: entry.startTime
          }, { event: 'longtask', durationMs: entry.duration, visible: true });
        }
      });
      longTaskObserver.observe({ type: 'longtask', buffered: true });
    } catch (_) {}
  }

  function summaryText() {
    const records = state.records || [];
    const durations = records
      .filter(record => Number(record.durationMs || 0) > 0)
      .map(record => ({
        category: record.category,
        message: record.message,
        durationMs: Number(record.durationMs || 0),
        level: record.level
      }))
      .sort((a, b) => b.durationMs - a.durationMs);
    const slowWaits = durations.filter(item => ['ESPERA', 'PAUSA FIXA', 'ASP.NET AJAX', 'REDE', 'IA', 'CATÁLOGO', 'HABILIDADE', 'CONTEÚDO', 'NAVEGAÇÃO'].includes(item.category));
    const errors = records.filter(record => ['ERRO', 'FALHA'].includes(record.level) || /erro|falha/i.test(record.event || ''));
    const network = records.filter(record => record.category === 'REDE' && /span_(?:end|error)/.test(record.event || ''));
    const postbacks = records.filter(record => record.category === 'ASP.NET AJAX' && record.event === 'ajax_end');
    const totalDuration = (state.completedAt || Date.now()) - (state.startedAt || Date.now());

    const lines = [];
    lines.push('RESUMO AUTOMÁTICO');
    lines.push(`Duração observada: ${formatDuration(totalDuration)}`);
    lines.push(`Registros: ${records.length}`);
    lines.push(`Requisições de rede concluídas: ${network.length}`);
    lines.push(`Postbacks ASP.NET concluídos: ${postbacks.length}`);
    lines.push(`Erros/alertas técnicos: ${errors.length}`);
    lines.push('');
    lines.push('MAIORES TEMPOS OBSERVADOS (operações podem se sobrepor):');
    if (!durations.length) lines.push('- Nenhuma duração registrada.');
    durations.slice(0, 20).forEach((item, index) => {
      lines.push(`${index + 1}. ${formatDuration(item.durationMs)} — [${item.category}] ${item.message}`);
    });
    lines.push('');
    lines.push('ESPERAS/POSTBACKS/CONSULTAS MAIS LENTOS:');
    if (!slowWaits.length) lines.push('- Nenhuma espera registrada.');
    slowWaits.slice(0, 25).forEach((item, index) => {
      lines.push(`${index + 1}. ${formatDuration(item.durationMs)} — [${item.category}] ${item.message}`);
    });
    lines.push('');
    lines.push('ERROS E ALERTAS:');
    if (!errors.length) lines.push('- Nenhum erro técnico registrado.');
    errors.slice(0, 30).forEach(record => {
      lines.push(`- +${formatDuration(record.elapsedMs)} [${record.category}] ${record.message}`);
    });
    return lines.join('\n');
  }

  function buildReport() {
    const end = state.completedAt || Date.now();
    const lines = [
      'PLANEJA PRO SIAP — DIAGNÓSTICO COMPLETO DE UMA AULA',
      '====================================================',
      `Versão do logger: ${LOGGER_VERSION}`,
      `ID do diagnóstico: ${state.traceId || '-'}`,
      `Status: ${state.status || '-'}`,
      `Motivo de início: ${state.reason || '-'}`,
      `Início: ${state.startedAt ? new Date(state.startedAt).toISOString() : '-'}`,
      `Fim/exportação: ${new Date(end).toISOString()}`,
      `Duração total: ${formatDuration(end - (state.startedAt || end))}`,
      `Página inicial: ${state.meta?.initialUrl || '-'}`,
      `Navegador: ${redactText(state.meta?.userAgent || navigator.userAgent, 800)}`,
      `Configuração: ${JSON.stringify(safeValue(state.meta?.config || {}))}`,
      '',
      summaryText(),
      '',
      'PÁGINAS PERCORRIDAS',
      '-------------------'
    ];

    if (!state.pages.length) lines.push('- Nenhuma navegação registrada.');
    state.pages.forEach((page, index) => {
      lines.push(`${index + 1}. ${new Date(page.timestamp).toISOString()} — ${page.reason || '-'} — ${page.url || '-'}`);
    });

    lines.push('', 'LINHA DO TEMPO COMPLETA', '-----------------------');
    for (const record of state.records || []) {
      const duration = record.durationMs != null ? ` | duração=${formatDuration(record.durationMs)}` : '';
      const event = record.event ? ` | evento=${record.event}` : '';
      lines.push(
        `#${record.seq} | ${new Date(record.timestamp).toISOString()} | +${formatDuration(record.elapsedMs)} | ` +
        `${record.level} | ${record.category}${event}${duration} | ${record.message}`
      );
      if (record.data !== undefined) {
        try { lines.push(`    dados=${JSON.stringify(record.data)}`); } catch (_) {}
      }
    }

    lines.push('', 'FIM DO DIAGNÓSTICO');
    return lines.join('\r\n');
  }

  function reportFilename() {
    const stamp = new Date(state.startedAt || Date.now()).toISOString().replace(/[:.]/g, '-');
    return `Planeja-PRO-log-aula-${stamp}.txt`;
  }

  function downloadReport() {
    if (!state.records?.length) {
      window.alert('Ainda não há diagnóstico para baixar. Gere ou aplique uma aula primeiro.');
      return false;
    }
    const blob = new Blob([buildReport()], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = reportFilename();
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    setTimeout(() => {
      anchor.remove();
      URL.revokeObjectURL(url);
    }, 1000);
    return true;
  }

  async function copyReport() {
    const text = buildReport();
    try {
      await navigator.clipboard.writeText(text);
      updateToolbarMessage('Log copiado.');
      return true;
    } catch (_) {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand('copy');
      textarea.remove();
      updateToolbarMessage(ok ? 'Log copiado.' : 'Não foi possível copiar.');
      return ok;
    }
  }

  function clearReport() {
    state = emptyState();
    lastSnapshotSignature = '';
    activeSpans.clear();
    saveStateNow();
    const box = document.querySelector('#tm-gpt-log');
    if (box) box.innerHTML = '';
    updateToolbar();
  }

  function updateToolbarMessage(message) {
    const status = document.querySelector('#siap-diag-status');
    if (!status) return;
    const previous = status.textContent;
    status.textContent = message;
    setTimeout(() => {
      if (status.textContent === message) {
        status.textContent = previous;
        updateToolbar();
      }
    }, 1800);
  }

  function updateToolbar() {
    const status = document.querySelector('#siap-diag-status');
    const download = document.querySelector('#siap-diag-download');
    const copy = document.querySelector('#siap-diag-copy');
    if (status) {
      if (state.active) {
        status.textContent = `● GRAVANDO • ${formatDuration(Date.now() - state.startedAt)} • ${state.records.length} eventos`;
        status.className = 'siap-diag-status ativo';
      } else if (state.records.length) {
        status.textContent = `✓ ${state.status === 'concluido' ? 'AULA CONCLUÍDA' : String(state.status || 'FINALIZADO').toUpperCase()} • ${formatDuration((state.completedAt || Date.now()) - (state.startedAt || Date.now()))}`;
        status.className = `siap-diag-status ${state.status === 'concluido' ? 'concluido' : 'erro'}`;
      } else {
        status.textContent = 'Aguardando gerar/aplicar uma aula';
        status.className = 'siap-diag-status';
      }
    }
    if (download) download.disabled = !state.records.length;
    if (copy) copy.disabled = !state.records.length;
  }

  function renderStoredRecords() {
    const box = document.querySelector('#tm-gpt-log');
    if (!box || box.dataset.siapDiagRenderedTraceId === state.traceId) return;
    if (state.records.length) {
      box.innerHTML = '';
      state.records.slice(-MAX_VISIBLE_ROWS).forEach(record => appendPanelRecord(record));
    }
    box.dataset.siapDiagRenderedTraceId = state.traceId || 'vazio';
  }

  function ensureToolbar() {
    const box = document.querySelector('#tm-gpt-log');
    if (!box || document.querySelector('#siap-diag-toolbar')) return false;
    const toolbar = document.createElement('div');
    toolbar.id = 'siap-diag-toolbar';
    toolbar.innerHTML = `
      <div id="siap-diag-status" class="siap-diag-status">Aguardando gerar/aplicar uma aula</div>
      <div class="siap-diag-actions">
        <button type="button" id="siap-diag-new">Novo log</button>
        <button type="button" id="siap-diag-download">Baixar .txt</button>
        <button type="button" id="siap-diag-copy">Copiar</button>
        <button type="button" id="siap-diag-clear">Limpar</button>
      </div>`;
    box.parentNode?.insertBefore(toolbar, box);

    if (!document.querySelector('#siap-diag-style')) {
      const style = document.createElement('style');
      style.id = 'siap-diag-style';
      style.textContent = `
        #siap-diag-toolbar{margin-top:8px;padding:8px;border:1px solid #26384a;border-radius:8px;background:#17212b;color:#e8f2ff;font:11px/1.35 Consolas,monospace}
        .siap-diag-status{padding:6px 8px;border-radius:6px;background:#283746;color:#cfdeeb;font-weight:700;margin-bottom:7px}
        .siap-diag-status.ativo{background:#5b3b00;color:#ffe5a6;animation:siapDiagPulse 1.4s ease-in-out infinite}
        .siap-diag-status.concluido{background:#124d2d;color:#bff5d2}.siap-diag-status.erro{background:#682323;color:#ffd0d0}
        .siap-diag-actions{display:flex;gap:5px;flex-wrap:wrap}.siap-diag-actions button{border:0;border-radius:5px;padding:6px 8px;background:#2d6cdf;color:#fff;cursor:pointer;font:700 10px Arial,sans-serif}.siap-diag-actions button:disabled{opacity:.45;cursor:not-allowed}#siap-diag-clear{background:#6b7280}
        #tm-gpt-log{max-height:320px!important}.siap-diag-row{border-left:2px solid #4c6a82;padding-left:5px}.siap-diag-erro{color:#ffb4b4!important;border-left-color:#ef4444}.siap-diag-aviso{color:#ffe29a!important;border-left-color:#eab308}.siap-diag-ok{color:#bff5d2!important;border-left-color:#22c55e}
        @keyframes siapDiagPulse{50%{filter:brightness(1.25)}}`;
      document.head?.appendChild(style);
    }

    toolbar.querySelector('#siap-diag-new')?.addEventListener('click', () => startTrace('Diagnóstico iniciado manualmente', { force: true }));
    toolbar.querySelector('#siap-diag-download')?.addEventListener('click', downloadReport);
    toolbar.querySelector('#siap-diag-copy')?.addEventListener('click', copyReport);
    toolbar.querySelector('#siap-diag-clear')?.addEventListener('click', () => {
      if (!state.records.length || window.confirm('Limpar o diagnóstico atual?')) clearReport();
    });
    renderStoredRecords();
    updateToolbar();
    return true;
  }

  function installHeartbeat() {
    if (heartbeatTimer) return;
    heartbeatTimer = setInterval(() => {
      if (!state.active) {
        updateToolbar();
        return;
      }
      const pending = Array.from(activeSpans.values()).map(span => ({
        categoria: span.category,
        operacao: span.label,
        aguardandoHaMs: Date.now() - span.startedAt
      }));
      trace('INFO', 'CRONÔMETRO', pending.length ? 'Operações ainda em andamento' : 'Extensão ativa sem operação instrumentada pendente', {
        pendentes: pending
      }, { event: 'heartbeat', visible: false });
      recordSnapshot('verificação periódica', false);
      updateToolbar();
    }, 3000);
  }

  function rebind() {
    installFetchInstrumentation();
    installXhrInstrumentation();
    installNativePostbackInstrumentation();
    bindPageRequestManager();
    instrumentModuleMethods();
    ensureToolbar();
  }

  const api = {
    log,
    updateStatus,
    appendLog,
    trace,
    startTrace,
    finishTrace,
    snapshot: (reason = 'snapshot manual') => recordSnapshot(reason, true),
    buildReport,
    downloadReport,
    copyReport,
    clearReport,
    getState: () => safeValue(state),
    version: LOGGER_VERSION
  };

  window[RUNTIME_KEY] = { api, rebind };
  installDomInstrumentation();
  installPerformanceInstrumentation();
  installFetchInstrumentation();
  installXhrInstrumentation();
  installNativePostbackInstrumentation();
  bindPageRequestManager();
  instrumentModuleMethods();
  installHeartbeat();

  toolbarTimer = setInterval(() => {
    if (ensureToolbar()) clearInterval(toolbarTimer);
  }, 400);
  instrumentationTimer = setInterval(() => {
    installNativePostbackInstrumentation();
    bindPageRequestManager();
    instrumentModuleMethods();
  }, 500);
  setTimeout(() => {
    if (instrumentationTimer) {
      clearInterval(instrumentationTimer);
      instrumentationTimer = null;
    }
  }, 90000);

  if (state.active) {
    state.pages.push({ timestamp: Date.now(), url: safeUrl(location.href), reason: 'logger_recarregado' });
    trace('INFO', 'NAVEGAÇÃO', 'Logger carregado novamente; diagnóstico anterior continua ativo', {
      url: safeUrl(location.href),
      tempoAcumuladoMs: Date.now() - state.startedAt
    }, { event: 'logger_resume', immediate: true });
  }

  return api;
})();
