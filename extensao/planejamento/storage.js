window.SIAPStorage = (() => {
  const C = window.SIAPConfig;
  const S = window.SIAPState;
  const K = C.STORAGE_KEYS;

  function parseBool(value) {
    return value === '1';
  }

  function normalizeKey(text) {
    return String(text || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function getSerieAnoFromTurma(turma) {
    const raw = String(turma || '').trim().toUpperCase();
    const match = raw.match(/^(\d{1,2})/);
    return match ? match[1] : raw;
  }

  function parseLessonNumber(value) {
    const num = parseInt(String(value || '').replace(/\D+/g, ''), 10);
    return Number.isFinite(num) ? num : null;
  }

  function saveState() {
    try {
      const plansToStore = Array.isArray(S.generatedPlans) ? S.generatedPlans : [];
      sessionStorage.setItem(K.GENERATED_PLANS, JSON.stringify(plansToStore));
      sessionStorage.setItem(K.CURRENT_PLAN_INDEX, String(S.currentPlanIndex));
      sessionStorage.setItem(K.UPLOADED_TEXT, S.uploadedText || '');

      const qtdEl = document.querySelector('#tm-gpt-qtd');
      const contentEl = document.querySelector('#tm-gpt-content');
      const apiKeyEl = document.querySelector('#tm-gpt-api-key');
      const customContentEl = document.querySelector('#tm-gpt-enable-custom-content');
      const replicateEl = document.querySelector('#tm-gpt-replicate-to-other-class');
      const revisaEnabledEl = document.querySelector('#tm-gpt-revisa-enabled');

      if (customContentEl) S.enableCustomContent = !!customContentEl.checked;
      if (replicateEl) S.replicateToOtherClass = !!replicateEl.checked;
      if (revisaEnabledEl) S.revisaEnabled = !!revisaEnabledEl.checked;

      if (S.generatedPlansContext) {
        sessionStorage.setItem(K.GENERATED_PLANS_CONTEXT, JSON.stringify(S.generatedPlansContext));
      } else {
        sessionStorage.removeItem(K.GENERATED_PLANS_CONTEXT);
      }

      sessionStorage.setItem(K.ENABLE_CUSTOM_CONTENT, S.enableCustomContent ? '1' : '0');
      sessionStorage.setItem(K.REPLICATE_TO_OTHER_CLASS, S.replicateToOtherClass ? '1' : '0');
      if (K.REVISA_ENABLED) sessionStorage.setItem(K.REVISA_ENABLED, S.revisaEnabled ? '1' : '0');
      if (K.REVISA_SELECTION) {
        if (S.revisaSelection && typeof S.revisaSelection === 'object') {
          sessionStorage.setItem(K.REVISA_SELECTION, JSON.stringify(S.revisaSelection));
        } else {
          sessionStorage.removeItem(K.REVISA_SELECTION);
        }
      }

      if (qtdEl) sessionStorage.setItem(K.QTD, qtdEl.value || '1');
      if (contentEl) sessionStorage.setItem(K.PASTED_TEXT, contentEl.value || '');
      if (apiKeyEl) localStorage.setItem(K.API_KEY, apiKeyEl.value || '');
    } catch (e) {
      console.warn('Falha ao salvar estado:', e);
    }
  }

  function loadState() {
    try {
      const plans = JSON.parse(sessionStorage.getItem(K.GENERATED_PLANS) || '[]');
      S.generatedPlans = Array.isArray(plans) ? plans : [];
      S.currentPlanIndex = parseInt(sessionStorage.getItem(K.CURRENT_PLAN_INDEX) || '0', 10);
      S.uploadedText = sessionStorage.getItem(K.UPLOADED_TEXT) || '';
      S.enableCustomContent = parseBool(sessionStorage.getItem(K.ENABLE_CUSTOM_CONTENT) || '0');
      S.replicateToOtherClass = parseBool(sessionStorage.getItem(K.REPLICATE_TO_OTHER_CLASS) || '0');
      S.revisaEnabled = parseBool(sessionStorage.getItem(K.REVISA_ENABLED) || '0');
      const revisaSelectionRaw = K.REVISA_SELECTION ? sessionStorage.getItem(K.REVISA_SELECTION) : '';
      S.revisaSelection = revisaSelectionRaw ? JSON.parse(revisaSelectionRaw) : null;
      S.revisaCatalog = null;
      S.savedPlanMatch = null;

      const ctxRaw = sessionStorage.getItem(K.GENERATED_PLANS_CONTEXT);
      S.generatedPlansContext = ctxRaw ? JSON.parse(ctxRaw) : null;
    } catch (e) {
      console.warn('Falha ao carregar estado, resetando:', e);
      S.generatedPlans = [];
      S.currentPlanIndex = 0;
      S.uploadedText = '';
      S.generatedPlansContext = null;
      S.enableCustomContent = false;
      S.replicateToOtherClass = false;
      S.revisaEnabled = false;
      S.revisaSelection = null;
      S.revisaCatalog = null;
      S.savedPlanMatch = null;
    }
  }

  function isAutoMode() {
    return sessionStorage.getItem(K.AUTO_MODE) === '1';
  }

  function setAutoMode(enabled) {
    enabled ? sessionStorage.setItem(K.AUTO_MODE, '1') : sessionStorage.removeItem(K.AUTO_MODE);
  }

  function setRunning(running) {
    S.isRunning = running;
    running ? sessionStorage.setItem(K.RUNNING, '1') : sessionStorage.removeItem(K.RUNNING);
  }

  function clearPlanExecutionState() {
    sessionStorage.removeItem(K.GENERATED_PLANS);
    sessionStorage.removeItem(K.CURRENT_PLAN_INDEX);
    sessionStorage.removeItem(K.AUTO_MODE);
    sessionStorage.removeItem(K.RUNNING);
    sessionStorage.removeItem(K.GENERATED_PLANS_CONTEXT);
    if (K.SAVE_STRATEGY) sessionStorage.removeItem(K.SAVE_STRATEGY);
    sessionStorage.removeItem('tm_gpt_pending_previous_lesson');
    sessionStorage.removeItem('tm_gpt_pending_next_plan_index');
    sessionStorage.removeItem('tm_gpt_pending_next_auto_mode');
    S.generatedPlans = [];
    S.currentPlanIndex = 0;
    S.generatedPlansContext = null;
  }

  function getPlanLibrary() {
    try {
      const raw = JSON.parse(localStorage.getItem(K.PLAN_LIBRARY) || '[]');
      return Array.isArray(raw) ? raw : [];
    } catch (e) {
      console.warn('Falha ao ler biblioteca de aulas:', e);
      return [];
    }
  }

  function savePlanLibrary(library) {
    try {
      const safe = Array.isArray(library) ? library : [];
      localStorage.setItem(K.PLAN_LIBRARY, JSON.stringify(safe.slice(0, 40)));
      return true;
    } catch (e) {
      console.warn('Falha ao salvar biblioteca de aulas:', e);
      return false;
    }
  }

  function upsertPlanLibraryEntry(entry) {
    if (!entry || !Array.isArray(entry.plans) || !entry.plans.length) return null;

    const library = getPlanLibrary();
    const id = entry.id || `${normalizeKey(entry.disciplina)}__${entry.serieAno || ''}__${entry.numeroAulaInicial || 'sem_numero'}__${entry.turmaOrigem || ''}`;
    const enriched = {
      id,
      disciplina: String(entry.disciplina || '').trim(),
      disciplinaKey: normalizeKey(entry.disciplina || ''),
      serieAno: String(entry.serieAno || getSerieAnoFromTurma(entry.turmaOrigem || '')),
      turmaOrigem: String(entry.turmaOrigem || '').trim(),
      numeroAulaInicial: String(entry.numeroAulaInicial || '').trim(),
      numeroAulaFinal: String(entry.numeroAulaFinal || '').trim(),
      totalAulas: Array.isArray(entry.plans) ? entry.plans.length : Number(entry.totalAulas || 0),
      createdAt: entry.createdAt || new Date().toISOString(),
      generationOptions: entry.generationOptions || {},
      plans: entry.plans
    };

    const deduped = library.filter((item) => item && item.id !== id && !(
      normalizeKey(item.disciplina || '') === enriched.disciplinaKey &&
      String(item.serieAno || '') === enriched.serieAno &&
      String(item.numeroAulaInicial || '') === enriched.numeroAulaInicial &&
      String(item.turmaOrigem || '') === enriched.turmaOrigem
    ));

    deduped.unshift(enriched);
    savePlanLibrary(deduped);
    return enriched;
  }

  function getPlanLibraryEntryRange(entry) {
    const start = parseLessonNumber(entry?.numeroAulaInicial);
    const total = Array.isArray(entry?.plans) ? entry.plans.length : parseInt(entry?.totalAulas || '0', 10);
    if (!Number.isFinite(start) || !Number.isFinite(total) || total < 1) {
      return { start: null, end: null, total: Math.max(total || 0, 0) };
    }
    return { start, end: start + total - 1, total };
  }

  function calculatePlanOffset(entry, currentLessonNumber) {
    const current = parseLessonNumber(currentLessonNumber);
    const range = getPlanLibraryEntryRange(entry);
    if (!Number.isFinite(current) || !Number.isFinite(range.start) || !Number.isFinite(range.end)) {
      return 0;
    }
    if (current < range.start || current > range.end) {
      return 0;
    }
    return current - range.start;
  }

  function findMatchingPlanLibraryEntry(context = {}, currentLessonNumber = '') {
    const disciplinaKey = normalizeKey(context?.disciplina || '');
    const serieAno = String(context?.serieAno || getSerieAnoFromTurma(context?.turma || ''));
    const current = parseLessonNumber(currentLessonNumber);
    const library = getPlanLibrary();

    const candidates = library.filter((item) => {
      if (!item) return false;
      if (normalizeKey(item.disciplina || '') !== disciplinaKey) return false;
      if (String(item.serieAno || '') !== serieAno) return false;
      if (!Array.isArray(item.plans) || !item.plans.length) return false;
      return true;
    }).map((item) => {
      const range = getPlanLibraryEntryRange(item);
      const offset = calculatePlanOffset(item, currentLessonNumber);
      const exactStart = Number.isFinite(current) && Number.isFinite(range.start) && current === range.start;
      const inRange = Number.isFinite(current) && Number.isFinite(range.start) && Number.isFinite(range.end) && current >= range.start && current <= range.end;
      return { item, range, offset, exactStart, inRange };
    });

    if (!candidates.length) return null;

    candidates.sort((a, b) => {
      if (a.exactStart !== b.exactStart) return a.exactStart ? -1 : 1;
      if (a.inRange !== b.inRange) return a.inRange ? -1 : 1;
      return String(b.item.createdAt || '').localeCompare(String(a.item.createdAt || ''));
    });

    const best = candidates[0];
    return {
      entry: best.item,
      offset: best.inRange ? best.offset : 0,
      currentLessonNumber: String(currentLessonNumber || '').trim(),
      rangeStart: best.range.start,
      rangeEnd: best.range.end,
      exactStart: best.exactStart,
      inRange: best.inRange
    };
  }

  return {
    saveState,
    loadState,
    isAutoMode,
    setAutoMode,
    setRunning,
    clearPlanExecutionState,
    getPlanLibrary,
    savePlanLibrary,
    upsertPlanLibraryEntry,
    findMatchingPlanLibraryEntry,
    calculatePlanOffset,
    getPlanLibraryEntryRange,
    getSerieAnoFromTurma,
    parseLessonNumber,
    normalizeKey
  };
})();
