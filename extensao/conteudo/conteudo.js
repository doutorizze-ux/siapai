// ==UserScript==
// @name         Conteúdo 2 aulas
// @namespace    https://hdsites.net.br/
// @version      1.6
// @description  Abre o dia pendente, executa o conteúdo planejado, executa os materiais marcados e salva automaticamente, com detecção automática de múltiplas aulas, meses com salvamento automático e descrição livre para material Outros
// @match        https://siap.educacao.go.gov.br/ConteudoProgramaticoEdicao.aspx*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const STORAGE_KEY = 'tm_executor_conteudo_state_v13';
  const START_FLAG = '__SIAP_EXECUTOR_CONTEUDO_STARTED__';

  const LOCAL = {
    SELECTED_MONTHS: 'tm_executor_conteudo_selected_months_v13',
    DOUBLE_LESSON: 'tm_executor_conteudo_double_lesson_v13',
    OTHER_MATERIAL_TEXT: 'tm_executor_conteudo_other_material_text_v13'
  };

  const SELECTORS = {
    DAY_CELLS: 'td.dialog.letivo',
    SELECTED_DATE: '#cphFuncionalidade_cphCampos_txtDataSelecionada',

    CONTENT_GRID: '#cphFuncionalidade_cphCampos_grdPlanejado',
    CONTENT_DONE_GRID: '#cphFuncionalidade_cphCampos_GrdConteudoRealizado',

    MATERIAL_GRID: '#cphFuncionalidade_cphCampos_GrdMaterialApoio',
    MATERIAL_DONE_GRID: '#cphFuncionalidade_cphCampos_GrdMaterialApoioRealizado',

    SAVE_BUTTON: '#cphFuncionalidade_btnAlterar',
    MONTH_SELECT: '#selectMesCalendarioMensal',
    LESSON_SELECT: '#cphFuncionalidade_cphCampos_LstAulasDiaSelecionado',
    OTHER_MATERIAL_TEXTAREA: '#cphFuncionalidade_cphCampos_TxtConteudoLivreMaterialApoioExecutado'
  };

  const DELAY = {
    afterOpenDay: 2800,
    afterLessonChange: 2200,
    afterClickContent: 2200,
    afterClickMaterial: 2200,
    afterSave: 3500,
    afterMonthChange: 2200,
    retry: 1500
  };

  const MONTH_LABELS = [
    'Janeiro',
    'Fevereiro',
    'Março',
    'Abril',
    'Maio',
    'Junho',
    'Julho',
    'Agosto',
    'Setembro',
    'Outubro',
    'Novembro',
    'Dezembro'
  ];

  const DEFAULT_STATE = {
    autoMode: false,
    stage: 'idle', // idle | change_month | open_day | select_lesson | execute_content | execute_materials | save
    currentDay: '',
    targetMonth: null,
    currentLesson: 1,
    deferredDay: '',
    forceNextDay: '',
    revisitingDeferred: false,
    doneMonths: [],
    skippedAbsenceDays: [],
    selectedMaterials: [],
    logs: []
  };

  let state = loadState();
  let started = false;
  let running = false;
  let timer = null;
  let busyNoticeShown = false;

  function loadState() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...DEFAULT_STATE };

      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_STATE,
        ...parsed,
        targetMonth: Number.isInteger(parsed?.targetMonth) ? parsed.targetMonth : null,
        currentLesson: Number.isInteger(parsed?.currentLesson) && parsed.currentLesson > 0 ? parsed.currentLesson : 1,
        deferredDay: String(parsed?.deferredDay || ''),
        forceNextDay: String(parsed?.forceNextDay || ''),
        revisitingDeferred: !!parsed?.revisitingDeferred,
        doneMonths: normalizeMonthArray(parsed?.doneMonths),
        skippedAbsenceDays: Array.isArray(parsed?.skippedAbsenceDays) ? parsed.skippedAbsenceDays.map(String).filter(Boolean) : [],
        selectedMaterials: Array.isArray(parsed?.selectedMaterials) ? parsed.selectedMaterials : [],
        logs: Array.isArray(parsed?.logs) ? parsed.logs : []
      };
    } catch (err) {
      console.warn('[SIAP Executor] Falha ao carregar estado:', err);
      return { ...DEFAULT_STATE };
    }
  }

  function saveState() {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      console.warn('[SIAP Executor] Falha ao salvar estado:', err);
    }
  }

  function normalizeText(text) {
    return String(text || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\u00A0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function normalizeMonthArray(arr) {
    return [...new Set(
      (Array.isArray(arr) ? arr : [])
        .map(v => parseInt(v, 10))
        .filter(v => Number.isInteger(v) && v >= 0 && v <= 11)
    )].sort((a, b) => a - b);
  }

  function monthIndexToLabel(idx) {
    return MONTH_LABELS[idx] || `Mês ${idx}`;
  }

  function formatMonthList(arr) {
    if (!arr || !arr.length) return 'Nenhum';
    return arr.map(monthIndexToLabel).join(', ');
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function formatCanonicalToBR(value) {
    if (!value) return '';
    const parts = String(value).split('/');
    if (parts.length !== 3) return '';
    const [year, month, day] = parts;
    return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
  }

  function parseCanonicalDate(value) {
    const parts = String(value || '').split('/').map(v => parseInt(v, 10));
    if (parts.length !== 3) return null;

    const [year, month, day] = parts;
    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;

    return new Date(year, month - 1, day, 0, 0, 0, 0);
  }

  function getTodayStart() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  }

  function isFutureCanonicalDay(value) {
    const dayDate = parseCanonicalDate(value);
    if (!dayDate) return false;
    return dayDate.getTime() > getTodayStart().getTime();
  }

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, m => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[m]));
  }

  function addStyle(css) {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
  }

  function safeClick(el) {
    if (!el) return false;

    try {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (_) {}

    try {
      el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    } catch (_) {}

    try {
      if (typeof el.click === 'function') el.click();
      return true;
    } catch (err) {
      console.warn('[SIAP Executor] Falha ao clicar:', err);
      return false;
    }
  }

  function log(message) {
    const text = String(message || '');
    console.log('[SIAP Executor]', text);

    state.logs.unshift(`[${new Date().toLocaleTimeString('pt-BR')}] ${text}`);
    state.logs = state.logs.slice(0, 120);
    saveState();

    const status = document.querySelector('#tm-exec-status');
    if (status) status.textContent = text;

    renderLogs();
    updatePanelInfo();
  }

  function isConteudoProgramaticoPage() {
    const href = String(window.location.href || '');
    return /ConteudoProgramaticoEdicao\.aspx/i.test(href);
  }

  function isExecutorPage() {
    if (!isConteudoProgramaticoPage()) return false;

    return !!(
      document.querySelector(SELECTORS.DAY_CELLS) ||
      document.querySelector(SELECTORS.CONTENT_GRID) ||
      document.querySelector(SELECTORS.MATERIAL_GRID) ||
      document.querySelector(SELECTORS.SAVE_BUTTON)
    );
  }

  function isConteudosTabActive() {
    const navs = Array.from(document.querySelectorAll('ul.nav.nav-tabs'));
    if (!navs.length) return false;

    const targetNav = navs.find(nav => {
      return !!(
        nav.querySelector('#cphFuncionalidade_cphCampos_BtnFrequencia') ||
        nav.querySelector('#cphFuncionalidade_cphCampos_BtnNotas') ||
        nav.querySelector('#cphFuncionalidade_cphCampos_BtnAcessoRemotoOnline')
      );
    });

    if (!targetNav) return false;

    const conteudosLink = Array.from(targetNav.querySelectorAll('a[href="#home"]'))
      .find(a => normalizeText(a.textContent || '') === 'conteudos');

    if (!conteudosLink) return false;

    const parentLi = conteudosLink.closest('li');
    if (parentLi && parentLi.classList.contains('active')) return true;

    if (conteudosLink.classList.contains('active')) return true;
    if (conteudosLink.getAttribute('aria-selected') === 'true') return true;

    return false;
  }

  function getSelectedDateBR() {
    const field = document.querySelector(SELECTORS.SELECTED_DATE);
    return field ? String(field.value || '').trim() : '';
  }

  function getCurrentMonthIndex() {
    const select = document.querySelector(SELECTORS.MONTH_SELECT);
    return select ? select.selectedIndex : null;
  }

  function getSavedSelectedMonths() {
    try {
      const parsed = JSON.parse(localStorage.getItem(LOCAL.SELECTED_MONTHS) || 'null');
      const normalized = normalizeMonthArray(parsed);
      if (normalized.length) return normalized;
    } catch (_) {}

    const current = getCurrentMonthIndex();
    const fallback = Number.isInteger(current) ? [current] : [new Date().getMonth()];
    localStorage.setItem(LOCAL.SELECTED_MONTHS, JSON.stringify(fallback));
    return fallback;
  }

  function saveSelectedMonths(arr) {
    const normalized = normalizeMonthArray(arr);
    localStorage.setItem(LOCAL.SELECTED_MONTHS, JSON.stringify(normalized));
    return normalized;
  }

  function isDoubleLessonEnabled() {
    try {
      return localStorage.getItem(LOCAL.DOUBLE_LESSON) === '1';
    } catch (_) {
      return false;
    }
  }

  function saveDoubleLessonMode(enabled) {
    try {
      localStorage.setItem(LOCAL.DOUBLE_LESSON, enabled ? '1' : '0');
    } catch (_) {}
  }


  function getOtherMaterialText() {
    try {
      return String(localStorage.getItem(LOCAL.OTHER_MATERIAL_TEXT) || '').slice(0, 50);
    } catch (_) {
      return '';
    }
  }

  function saveOtherMaterialText(value) {
    const text = String(value || '').slice(0, 50);
    try {
      localStorage.setItem(LOCAL.OTHER_MATERIAL_TEXT, text);
    } catch (_) {}
    return text;
  }

  function isOtherMaterialLabel(label) {
    return normalizeText(label) === 'outros';
  }

  function isOtherMaterialSelected() {
    return getSelectedMaterials().some(isOtherMaterialLabel);
  }

  function fillOtherMaterialTextarea() {
    const text = getOtherMaterialText().trim();
    const textarea = document.querySelector(SELECTORS.OTHER_MATERIAL_TEXTAREA);

    if (!textarea || !text || !isOtherMaterialSelected()) return false;

    if (textarea.value === text) return true;

    try { textarea.focus(); } catch (_) {}
    textarea.value = text;

    try { textarea.dispatchEvent(new Event('input', { bubbles: true })); } catch (_) {}
    try { textarea.dispatchEvent(new Event('change', { bubbles: true })); } catch (_) {}
    try { textarea.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true })); } catch (_) {}

    log(`Texto livre do material "Outros" preenchido: ${text}`);
    return true;
  }

  function getMonthCheckboxes() {
    return Array.from(document.querySelectorAll('.tm-exec-month-checkbox'));
  }

  function readMonthSelectionFromUI() {
    return normalizeMonthArray(
      getMonthCheckboxes()
        .filter(el => el.checked)
        .map(el => parseInt(el.value, 10))
    );
  }

  function writeMonthSelectionToUI(arr) {
    const saved = normalizeMonthArray(arr);
    getMonthCheckboxes().forEach(el => {
      el.checked = saved.includes(parseInt(el.value, 10));
    });
  }

  function writeDoubleLessonToUI(enabled) {
    const el = document.querySelector('#tm-exec-double-lesson');
    if (el) el.checked = !!enabled;
  }

  function getDoneMonths() {
    return normalizeMonthArray(state.doneMonths);
  }

  function setDoneMonths(arr) {
    state.doneMonths = normalizeMonthArray(arr);
    saveState();
  }

  function clearDoneMonths() {
    state.doneMonths = [];
    saveState();
  }

  function markMonthAsDone(idx) {
    if (!Number.isInteger(idx)) return;
    const done = getDoneMonths();
    if (!done.includes(idx)) {
      done.push(idx);
      setDoneMonths(done);
    }
  }

  function unmarkMonthAsDone(idx) {
    if (!Number.isInteger(idx)) return;
    const done = getDoneMonths().filter(m => m !== idx);
    setDoneMonths(done);
  }

  function setTargetMonth(idx) {
    state.targetMonth = Number.isInteger(idx) ? idx : null;
    saveState();
  }

  function getTargetMonth() {
    return Number.isInteger(state.targetMonth) ? state.targetMonth : null;
  }

  function clearTargetMonth() {
    state.targetMonth = null;
    saveState();
  }

  function buildMonthSelectorHtml() {
    return MONTH_LABELS.map((label, idx) => `
      <label class="tm-exec-month-item">
        <input type="checkbox" class="tm-exec-month-checkbox" value="${idx}">
        <span>${label}</span>
      </label>
    `).join('');
  }

  function findNextSelectedMonth(currentIdx, selectedMonths, doneMonths) {
    const selected = normalizeMonthArray(selectedMonths);
    const done = normalizeMonthArray(doneMonths);

    if (!selected.length) return null;

    const base = Number.isInteger(currentIdx) ? currentIdx : -1;

    for (let step = 1; step <= 12; step++) {
      const idx = (base + step + 12) % 12;
      if (selected.includes(idx) && !done.includes(idx)) {
        return idx;
      }
    }

    return null;
  }

  function changeSiteMonth(monthIdx) {
    const select = document.querySelector(SELECTORS.MONTH_SELECT);
    if (!select) return false;

    if (select.selectedIndex === monthIdx) return true;

    try { select.focus(); } catch (_) {}
    select.selectedIndex = monthIdx;

    try { select.dispatchEvent(new Event('input', { bubbles: true })); } catch (_) {}
    try { select.dispatchEvent(new Event('change', { bubbles: true })); } catch (_) {}

    return true;
  }

  function isAspNetBusy() {
    try {
      const prm = window.Sys?.WebForms?.PageRequestManager?.getInstance?.();
      if (prm && typeof prm.get_isInAsyncPostBack === 'function') {
        return prm.get_isInAsyncPostBack();
      }
    } catch (_) {}
    return false;
  }

  function isVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  }

  function isBusyOverlayVisible() {
    const candidates = [
      '#UpdateProgress1',
      '#updateProgress',
      '.updateProgress',
      '.modalAguarde',
      '.aguarde',
      '.loading',
      '.modal-loading',
      '#divAguarde'
    ];

    for (const sel of candidates) {
      const el = document.querySelector(sel);
      if (el && isVisible(el)) return true;
    }

    return false;
  }

  function isSiteBusy() {
    return isAspNetBusy() || isBusyOverlayVisible();
  }

  function getPainelMensagemText() {
    const panel = document.querySelector('#painelMensagem');
    if (!panel) return '';
    return normalizeText(panel.textContent || '');
  }

  function hasAbsenceRegisteredMessage() {
    const text = getPainelMensagemText();
    return text.includes('existe ausencia cadastrada para a data selecionada');
  }

  function getSkippedAbsenceDays() {
    return Array.isArray(state?.skippedAbsenceDays) ? state.skippedAbsenceDays : [];
  }

  function isSkippedAbsenceDay(canonical) {
    return !!canonical && getSkippedAbsenceDays().includes(String(canonical));
  }

  function markSkippedAbsenceDay(canonical) {
    if (!canonical) return false;
    const value = String(canonical);
    const list = getSkippedAbsenceDays();
    if (!list.includes(value)) {
      list.push(value);
    }
    state.skippedAbsenceDays = list;
    return true;
  }

  function skipCurrentDayByAbsenceMessage() {
    if (!hasAbsenceRegisteredMessage()) return false;

    const selected = getSelectedDateBR();
    const current = state.currentDay || '';
    const currentBR = current ? formatCanonicalToBR(current) : '';

    // Só pula quando a mensagem pertence ao dia que a automação acabou de abrir.
    if (current && selected && currentBR && selected !== currentBR) {
      return false;
    }

    const canonical = current || '';
    if (!canonical) return false;

    markSkippedAbsenceDay(canonical);

    if (state.deferredDay === canonical) state.deferredDay = '';
    if (state.forceNextDay === canonical) state.forceNextDay = '';

    log(`Existe ausência cadastrada para ${formatCanonicalToBR(canonical)}. Ignorando este dia e passando para o próximo.`);
    state.stage = 'open_day';
    state.currentDay = '';
    state.currentLesson = 1;
    state.revisitingDeferred = false;
    saveState();
    return true;
  }

  function getDoneLabels(gridSelector) {
    const grid = document.querySelector(gridSelector);
    if (!grid) return [];

    return Array.from(grid.querySelectorAll('.descricao-item-grade'))
      .map(el => (el.textContent || '').trim())
      .filter(Boolean);
  }

  function hasDoneLabel(gridSelector, label) {
    const wanted = normalizeText(label);
    if (!wanted) return false;

    return getDoneLabels(gridSelector).some(item => normalizeText(item) === wanted);
  }

  function isContentDone(label) {
    return hasDoneLabel(SELECTORS.CONTENT_DONE_GRID, label);
  }

  function isMaterialDone(label) {
    return hasDoneLabel(SELECTORS.MATERIAL_DONE_GRID, label);
  }

  function isIgnoredDay(td) {
    if (!td) return true;

    const planned = td.getAttribute('data-planejado') === 'True';
    const executed = td.getAttribute('data-executado') === 'True';
    const absence = td.getAttribute('data-ausencia') === 'True';
    const title = normalizeText(td.getAttribute('title') || '');
    const idEvento = td.getAttribute('id_evento');

    // Se o dia já está planejado e ainda não foi executado, ele precisa entrar
    // mesmo quando o calendário marcar um evento especial, como Blocos de Avaliações.
    if (planned && !executed && !absence) return false;

    // Dias sem planejamento continuam fora do processamento automático.
    if (!planned) return true;

    // Ausência nunca deve entrar no fluxo automático.
    if (absence) return true;

    // Mantido apenas como informação de debug; não bloqueia sozinho.
    if (idEvento || title.includes('blocos de avaliacao')) return false;

    return false;
  }

  function isPendingDay(td) {
    if (!td || isIgnoredDay(td)) return false;

    const canonical = td.getAttribute('data-canonica') || '';
    const planned = td.getAttribute('data-planejado') === 'True';
    const executed = td.getAttribute('data-executado') === 'True';
    const absence = td.getAttribute('data-ausencia') === 'True';
    const future = isFutureCanonicalDay(canonical);

    return planned && !executed && !absence && !future;
  }

  function getPendingDays() {
    return Array.from(document.querySelectorAll(SELECTORS.DAY_CELLS))
      .filter(isPendingDay)
      .filter(td => !isSkippedAbsenceDay(getCanonicalDay(td)))
      .sort((a, b) => {
        const da = a.getAttribute('data-canonica') || '';
        const db = b.getAttribute('data-canonica') || '';
        return da.localeCompare(db);
      });
  }

  function getDayCellByCanonical(canonical) {
    if (!canonical) return null;
    return Array.from(document.querySelectorAll(SELECTORS.DAY_CELLS))
      .find(td => (td.getAttribute('data-canonica') || '') === canonical) || null;
  }

  function getDayLabel(td) {
    return td?.getAttribute('data') || td?.getAttribute('data-canonica') || '(dia)';
  }

  function getCanonicalDay(td) {
    return td?.getAttribute('data-canonica') || '';
  }

  function isCurrentDayLoaded() {
    if (!state.currentDay) return true;
    return getSelectedDateBR() === formatCanonicalToBR(state.currentDay);
  }

  function getPlannedContentRows() {
    const grid = document.querySelector(SELECTORS.CONTENT_GRID);
    if (!grid) return [];

    return Array.from(grid.querySelectorAll('tr'))
      .map(row => {
        const labelEl = row.querySelector('.descricao-item-grade');
        const btn = row.querySelector('input[type="submit"], button');
        if (!labelEl || !btn) return null;

        const label = (labelEl.textContent || '').trim();
        if (!label) return null;

        return { row, label, btn };
      })
      .filter(Boolean);
  }

  function getMaterialRows() {
    const grid = document.querySelector(SELECTORS.MATERIAL_GRID);
    if (!grid) return [];

    return Array.from(grid.querySelectorAll('tr'))
      .map(row => {
        const labelEl = row.querySelector('.descricao-item-grade');
        const btn = row.querySelector('input[type="submit"], button');
        if (!labelEl || !btn) return null;

        const label = (labelEl.textContent || '').trim();
        if (!label) return null;

        return { row, label, btn };
      })
      .filter(Boolean);
  }

  function getMaterialOptions() {
    const optionsFromGrid = getMaterialRows().map(item => item.label);
    const forcedOptions = ['Nenhum material de apoio utilizado'];
    return Array.from(new Set([...optionsFromGrid, ...forcedOptions]));
  }

  function getSelectedMaterials() {
    return Array.isArray(state.selectedMaterials) ? state.selectedMaterials.slice() : [];
  }

  function saveSelectedFromPanel() {
    const selected = Array.from(document.querySelectorAll('.tm-exec-material:checked'))
      .map(el => el.getAttribute('data-label') || '')
      .map(v => v.trim())
      .filter(Boolean);

    state.selectedMaterials = selected;
    saveState();
    updatePanelInfo();
  }

  function findMaterialRowByLabel(label) {
    const wanted = normalizeText(label);
    return getMaterialRows().find(item => normalizeText(item.label) === wanted) || null;
  }

  function extractLessonNumber(text) {
    const match = String(text || '').match(/(\d+)/);
    if (!match) return null;
    const num = parseInt(match[1], 10);
    return Number.isInteger(num) ? num : null;
  }

  function getLessonSelect() {
    return document.querySelector(SELECTORS.LESSON_SELECT);
  }

  function getLessonOptions() {
    const select = getLessonSelect();
    if (!select) return [];

    return Array.from(select.options).map((opt, index) => ({
      index,
      value: String(opt.value || '').trim(),
      text: String(opt.textContent || opt.innerText || '').trim(),
      lessonNumber: extractLessonNumber(opt.value || opt.textContent || '')
    }));
  }

  function hasLessonOption(lessonNumber) {
    return getLessonOptions().some(opt => opt.lessonNumber === lessonNumber);
  }

  function getCurrentLessonNumber() {
    const select = getLessonSelect();
    if (!select) return 1;

    const opt = select.options[select.selectedIndex];
    if (!opt) return 1;

    return extractLessonNumber(opt.value || opt.textContent || '') || 1;
  }

  function selectLesson(lessonNumber) {
    const select = getLessonSelect();
    if (!select) return false;

    const options = getLessonOptions();
    const found = options.find(opt => opt.lessonNumber === lessonNumber);
    if (!found) return false;

    if (select.selectedIndex === found.index) return true;

    try { select.focus(); } catch (_) {}
    select.selectedIndex = found.index;

    try { select.dispatchEvent(new Event('input', { bubbles: true })); } catch (_) {}
    try { select.dispatchEvent(new Event('change', { bubbles: true })); } catch (_) {}

    try {
      if (typeof select.onchange === 'function') {
        select.onchange();
      }
    } catch (_) {}

    return true;
  }

  function getDesiredLessonNumber() {
    return Number.isInteger(state.currentLesson) && state.currentLesson > 0 ? state.currentLesson : 1;
  }

  function renderLogs() {
    const box = document.querySelector('#tm-exec-log');
    if (!box) return;

    box.innerHTML = state.logs
      .map(line => `<div class="tm-exec-log-line">${escapeHtml(line)}</div>`)
      .join('');
  }

  function isTypingOtherMaterialText() {
    const active = document.activeElement;
    return !!active && active.id === 'tm-exec-other-material-text';
  }

  function renderMaterials() {
    const box = document.querySelector('#tm-exec-materials');
    if (!box) return;

    // Evita redesenhar a lista enquanto o usuário está digitando.
    // Isso mantém o foco/cursor dentro do campo e permite digitar normalmente.
    if (isTypingOtherMaterialText()) return;

    const options = getMaterialOptions();
    const selectedSet = new Set(getSelectedMaterials().map(normalizeText));

    box.innerHTML = options.length
      ? options.map(label => {
          const normalized = normalizeText(label);
          const checked = selectedSet.has(normalized);
          const isOther = isOtherMaterialLabel(label);

          return `
            <div class="tm-exec-material-wrap">
              <label class="tm-exec-item">
                <input
                  type="checkbox"
                  class="tm-exec-material"
                  data-label="${escapeHtml(label)}"
                  ${checked ? 'checked' : ''}
                >
                <span>${escapeHtml(label)}</span>
              </label>
              ${isOther ? `
                <div class="tm-exec-other-box" style="display:${checked ? 'block' : 'none'}">
                  <label for="tm-exec-other-material-text">Digite o material utilizado em Outros:</label>
                  <textarea
                    id="tm-exec-other-material-text"
                    maxlength="50"
                    rows="2"
                    placeholder="Ex.: Vídeo, slides, atividade impressa..."
                  >${escapeHtml(getOtherMaterialText())}</textarea>
                  <div class="tm-exec-other-counter"><span id="tm-exec-other-count">${getOtherMaterialText().length}</span>/50 caracteres</div>
                </div>
              ` : ''}
            </div>
          `;
        }).join('')
      : '<em>Nenhum material executável encontrado na página.</em>';

    box.querySelectorAll('.tm-exec-material').forEach(el => {
      el.addEventListener('change', () => {
        saveSelectedFromPanel();
        const wrap = el.closest('.tm-exec-material-wrap');
        const otherBox = wrap?.querySelector('.tm-exec-other-box');
        if (otherBox) otherBox.style.display = el.checked ? 'block' : 'none';
      });
    });

    const otherText = box.querySelector('#tm-exec-other-material-text');
    const otherCount = box.querySelector('#tm-exec-other-count');
    if (otherText) {
      otherText.addEventListener('input', () => {
        const value = saveOtherMaterialText(otherText.value);
        if (otherText.value !== value) otherText.value = value;
        if (otherCount) otherCount.textContent = String(value.length);
      });
    }
  }

  function stageLabel(stage) {
    switch (stage) {
      case 'change_month': return 'Trocando mês';
      case 'open_day': return 'Abrindo dia';
      case 'select_lesson': return 'Selecionando aula';
      case 'execute_content': return 'Executando conteúdo';
      case 'execute_materials': return 'Executando materiais';
      case 'save': return 'Salvando';
      default: return 'Parado';
    }
  }

  function lessonModeLabel() {
    const total = getLessonNumbers().length;
    return total > 1 ? `${total} aulas detectadas` : 'Aula única';
  }

  function lessonLabel(n) {
    return `${n}ª Aula`;
  }

  function getLessonNumbers() {
    return getLessonOptions()
      .map(opt => opt.lessonNumber)
      .filter(n => Number.isInteger(n) && n > 0)
      .filter((n, idx, arr) => arr.indexOf(n) === idx)
      .sort((a, b) => a - b);
  }

  function getNextLessonNumber(current) {
    return getLessonNumbers().find(n => n > current) || null;
  }

  function updatePanelInfo() {
    const statusMode = document.querySelector('#tm-exec-mode');
    const statusDay = document.querySelector('#tm-exec-current-day');
    const statusText = document.querySelector('#tm-exec-status');

    if (statusMode) {
      statusMode.innerHTML = state.autoMode
        ? '<span class="tm-exec-active-dot"></span> Ativo'
        : 'Parado';
      statusMode.style.color = state.autoMode ? '#208a46' : '#c44949';
    }

    if (statusDay) {
      const dayBR = state.currentDay ? formatCanonicalToBR(state.currentDay) : (getSelectedDateBR() || '-');
      const lesson = state.autoMode ? ` — ${lessonLabel(state.currentLesson || 1)}` : '';
      statusDay.textContent = dayBR && dayBR !== '-' ? `${dayBR}${lesson}` : '-';
    }

    if (statusText && !state.autoMode && !statusText.textContent.trim()) {
      statusText.textContent = 'Aguardando ação...';
    }
  }

  function renderPanel() {
    if (document.querySelector('#tm-exec-panel')) return;

    const panel = document.createElement('div');
    panel.id = 'tm-exec-panel';
    panel.innerHTML = `
      <div id="tm-exec-header">
        <span>Executor de Conteúdo</span>
        <button id="tm-exec-minimize" type="button" title="Minimizar">−</button>
      </div>

      <div class="tm-exec-status-line">
        <strong>Status:</strong> <span id="tm-exec-mode">-</span>
        <span class="tm-exec-sep">|</span>
        <strong>Dia:</strong> <span id="tm-exec-current-day">-</span>
      </div>

      <div id="tm-exec-status">Aguardando ação...</div>

      <div class="tm-exec-month-box">
        <div class="tm-exec-section-title">Meses para executar</div>
        <div class="tm-exec-month-grid">
          ${buildMonthSelectorHtml()}
        </div>
        <div class="tm-exec-buttons tm-exec-buttons-compact">
          <button id="tm-exec-months-all" type="button">Todos</button>
          <button id="tm-exec-months-none" type="button">Limpar</button>
        </div>
      </div>

      <div class="tm-exec-section-title">Materiais</div>
      <div id="tm-exec-materials"></div>

      <div class="tm-exec-buttons tm-exec-buttons-compact">
        <button id="tm-exec-refresh" type="button">Atualizar</button>
        <button id="tm-exec-all" type="button">Todos</button>
        <button id="tm-exec-none" type="button">Limpar</button>
      </div>

      <div class="tm-exec-buttons tm-exec-buttons-main">
        <button id="tm-exec-start" type="button">Iniciar</button>
        <button id="tm-exec-stop" type="button">Parar</button>
      </div>
    `;

    document.body.appendChild(panel);

    addStyle(`
      #tm-exec-panel{
        position:fixed;
        top:70px;
        right:20px;
        width:360px;
        max-height:85vh;
        overflow:auto;
        z-index:999999;
        background:#fff;
        border:1px solid #cfcfcf;
        border-radius:12px;
        box-shadow:0 10px 30px rgba(0,0,0,.18);
        padding:10px;
        font-family:Arial,sans-serif;
        color:#222;
      }
      #tm-exec-header{
        font-size:16px;
        font-weight:bold;
        margin-bottom:5px;
        color:#1f3b5b;
        cursor:move;
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:8px;
      }
      #tm-exec-minimize{
        width:28px;
        height:26px;
        border:none;
        border-radius:7px;
        background:#eef3fb;
        color:#1f3b5b;
        font-size:18px;
        line-height:1;
        font-weight:bold;
        cursor:pointer;
        padding:0;
      }
      #tm-exec-minimize:hover{
        background:#dfe9f8;
      }
      #tm-exec-panel.tm-exec-collapsed{
        width:300px;
        overflow:hidden;
      }
      #tm-exec-panel.tm-exec-collapsed .tm-exec-status-line,
      #tm-exec-panel.tm-exec-collapsed #tm-exec-status,
      #tm-exec-panel.tm-exec-collapsed .tm-exec-month-box,
      #tm-exec-panel.tm-exec-collapsed .tm-exec-section-title,
      #tm-exec-panel.tm-exec-collapsed #tm-exec-materials,
      #tm-exec-panel.tm-exec-collapsed .tm-exec-buttons{
        display:none !important;
      }
      .tm-exec-status-line{
        margin-bottom:6px;
        font-size:13px;
        display:flex;
        align-items:center;
        gap:5px;
        flex-wrap:wrap;
      }
      .tm-exec-sep{
        color:#c8c8c8;
      }
      .tm-exec-active-dot{
        display:inline-block;
        width:9px;
        height:9px;
        margin-right:5px;
        border-radius:50%;
        background:#208a46;
        animation:tmExecPulse 1s infinite ease-in-out;
      }
      @keyframes tmExecPulse{
        0%{ transform:scale(.75); opacity:.35; }
        50%{ transform:scale(1.35); opacity:1; }
        100%{ transform:scale(.75); opacity:.35; }
      }
      .tm-exec-section-title{
        display:block;
        margin-top:8px;
        margin-bottom:4px;
        font-weight:bold;
        font-size:13px;
      }
      .tm-exec-month-box{
        margin-top:8px;
        margin-bottom:5px;
        padding:8px;
        border-radius:10px;
        background:#f7f9fc;
        border:1px solid #e3e7ef;
      }
      .tm-exec-month-grid{
        display:grid;
        grid-template-columns:repeat(3, 1fr);
        gap:4px 8px;
        margin-top:6px;
        margin-bottom:6px;
      }
      .tm-exec-month-item{
        display:flex;
        align-items:center;
        gap:6px;
        font-size:12px;
        cursor:pointer;
        user-select:none;
      }
      .tm-exec-month-item input{
        cursor:pointer;
      }
      #tm-exec-materials{
        border:1px solid #e5e5e5;
        background:#fafafa;
        border-radius:8px;
        padding:6px;
        max-height:180px;
        overflow:auto;
      }
      .tm-exec-item{
        display:flex;
        align-items:flex-start;
        gap:8px;
        margin-bottom:5px;
        font-size:12px;
        line-height:1.25;
      }
      .tm-exec-material-wrap{
        margin-bottom:5px;
      }
      .tm-exec-other-box{
        margin:2px 0 10px 25px;
        padding:8px;
        border-radius:8px;
        border:1px solid #dce3ef;
        background:#fff;
      }
      .tm-exec-other-box label{
        display:block;
        font-size:12px;
        font-weight:bold;
        margin-bottom:5px;
        color:#1f3b5b;
      }
      #tm-exec-other-material-text{
        width:100%;
        resize:vertical;
        min-height:42px;
        border:1px solid #cfd7e6;
        border-radius:7px;
        padding:7px;
        font-size:12px;
        font-family:Arial,sans-serif;
        box-sizing:border-box;
      }
      .tm-exec-other-counter{
        text-align:right;
        font-size:11px;
        color:#667085;
        margin-top:3px;
      }
      .tm-exec-buttons{
        display:flex;
        gap:8px;
        flex-wrap:wrap;
        margin-top:6px;
      }
      .tm-exec-buttons button{
        flex:1;
        min-width:74px;
        border:none;
        border-radius:8px;
        background:#2d6cdf;
        color:white;
        padding:7px 9px;
        cursor:pointer;
        font-weight:bold;
      }
      #tm-exec-start{ background:#1e8e3e; }
      #tm-exec-stop{ background:#c44949; }
      #tm-exec-status{
        margin-top:6px;
        padding:8px;
        background:#f3f6fa;
        border-radius:8px;
        font-size:12px;
      }
    `);

    bindPanelEvents();
    makePanelDraggable(panel, document.querySelector('#tm-exec-header'));
    writeMonthSelectionToUI(getSavedSelectedMonths());
    renderMaterials();
    renderLogs();
    updatePanelInfo();
  }

  function makePanelDraggable(panel, handle) {
    if (!panel || !handle) return;

    let offsetX = 0;
    let offsetY = 0;

    handle.addEventListener('mousedown', (e) => {
      offsetX = e.clientX - panel.getBoundingClientRect().left;
      offsetY = e.clientY - panel.getBoundingClientRect().top;

      function onMove(ev) {
        panel.style.left = `${ev.clientX - offsetX}px`;
        panel.style.top = `${ev.clientY - offsetY}px`;
        panel.style.right = 'auto';
      }

      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      }

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      e.preventDefault();
    });
  }

  function bindPanelEvents() {
    document.querySelector('#tm-exec-minimize')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const panel = document.querySelector('#tm-exec-panel');
      const btn = document.querySelector('#tm-exec-minimize');
      if (!panel || !btn) return;
      const collapsed = panel.classList.toggle('tm-exec-collapsed');
      btn.textContent = collapsed ? '+' : '−';
      btn.title = collapsed ? 'Expandir' : 'Minimizar';
    });

    document.querySelector('#tm-exec-refresh')?.addEventListener('click', () => {
      renderMaterials();
      updatePanelInfo();
      log('Lista de materiais atualizada.');
    });

    document.querySelector('#tm-exec-all')?.addEventListener('click', () => {
      document.querySelectorAll('.tm-exec-material').forEach(el => {
        el.checked = true;
        const wrap = el.closest('.tm-exec-material-wrap');
        const otherBox = wrap?.querySelector('.tm-exec-other-box');
        if (otherBox) otherBox.style.display = 'block';
      });
      saveSelectedFromPanel();
      log('Todos os materiais foram marcados.');
    });

    document.querySelector('#tm-exec-none')?.addEventListener('click', () => {
      document.querySelectorAll('.tm-exec-material').forEach(el => {
        el.checked = false;
        const wrap = el.closest('.tm-exec-material-wrap');
        const otherBox = wrap?.querySelector('.tm-exec-other-box');
        if (otherBox) otherBox.style.display = 'none';
      });
      saveSelectedFromPanel();
      log('Todos os materiais foram desmarcados.');
    });

    function autoSaveMonthsFromUI() {
      const selected = readMonthSelectionFromUI();
      const saved = saveSelectedMonths(selected);
      clearDoneMonths();
      clearTargetMonth();
      state.stage = 'open_day';
      state.currentDay = '';
      state.currentLesson = 1;
      state.deferredDay = '';
      state.forceNextDay = '';
      state.revisitingDeferred = false;
      saveState();
      log(selected.length ? `Meses salvos automaticamente: ${formatMonthList(saved)}.` : 'Nenhum mês selecionado.');
      updatePanelInfo();
    }

    document.querySelector('#tm-exec-months-all')?.addEventListener('click', () => {
      writeMonthSelectionToUI(MONTH_LABELS.map((_, idx) => idx));
      autoSaveMonthsFromUI();
    });

    document.querySelector('#tm-exec-months-none')?.addEventListener('click', () => {
      writeMonthSelectionToUI([]);
      autoSaveMonthsFromUI();
    });

    getMonthCheckboxes().forEach(el => {
      el.addEventListener('change', autoSaveMonthsFromUI);
    });

    document.querySelector('#tm-exec-start')?.addEventListener('click', () => {
      saveSelectedFromPanel();

      const selectedMonths = getSavedSelectedMonths();
      if (!selectedMonths.length) {
        alert('Marque pelo menos um mês antes de iniciar.');
        return;
      }

      state.autoMode = true;
      state.stage = 'open_day';
      state.currentDay = '';
      state.targetMonth = null;
      state.currentLesson = 1;
      state.deferredDay = '';
      state.forceNextDay = '';
      state.revisitingDeferred = false;
      state.doneMonths = [];
      saveState();

      log(`Execução iniciada. Meses ativos: ${formatMonthList(selectedMonths)}. ${lessonModeLabel()}.`);
      scheduleNext(600);
    });

    document.querySelector('#tm-exec-stop')?.addEventListener('click', () => {
      stop();
    });
  }

  function finish(message) {
    state.autoMode = false;
    state.stage = 'idle';
    state.currentDay = '';
    state.targetMonth = null;
    state.currentLesson = 1;
    state.deferredDay = '';
    state.forceNextDay = '';
    state.revisitingDeferred = false;
    saveState();

    if (timer) {
      clearTimeout(timer);
      timer = null;
    }

    log(message);
  }

  function stop() {
    state.autoMode = false;
    state.stage = 'idle';
    state.currentDay = '';
    state.targetMonth = null;
    state.currentLesson = 1;
    state.deferredDay = '';
    state.forceNextDay = '';
    state.revisitingDeferred = false;
    saveState();

    if (timer) {
      clearTimeout(timer);
      timer = null;
    }

    log('Processamento parado.');
  }

  function scheduleNext(delay = 2000) {
    if (!state.autoMode) return;

    if (timer) {
      clearTimeout(timer);
      timer = null;
    }

    timer = setTimeout(() => {
      run().catch(err => {
        console.error(err);
        log(`Erro no executor: ${err.message || err}`);
      });
    }, delay);
  }

  function startMonthChange(nextMonth, reason) {
    if (!Number.isInteger(nextMonth)) return false;

    state.targetMonth = nextMonth;
    state.stage = 'change_month';
    state.currentDay = '';
    state.currentLesson = 1;
    saveState();

    log(`${reason} Trocando para ${monthIndexToLabel(nextMonth)}.`);
    changeSiteMonth(nextMonth);
    return true;
  }

  function openPendingDay() {
    const selectedMonths = getSavedSelectedMonths();
    const currentMonth = getCurrentMonthIndex();

    if (Number.isInteger(currentMonth) && selectedMonths.length && !selectedMonths.includes(currentMonth)) {
      const nextMonth = findNextSelectedMonth(currentMonth, selectedMonths, getDoneMonths());

      if (nextMonth === null) {
        finish('Todos os meses selecionados já foram concluídos.');
        return 'none';
      }

      startMonthChange(nextMonth, `O mês atual (${monthIndexToLabel(currentMonth)}) não está na seleção.`);
      return 'changing';
    }

    const pending = getPendingDays();

    if (!pending.length) {
      if (Number.isInteger(currentMonth)) {
        markMonthAsDone(currentMonth);

        const nextMonth = findNextSelectedMonth(currentMonth, selectedMonths, getDoneMonths());
        if (nextMonth !== null) {
          startMonthChange(nextMonth, 'Sem dias pendentes neste mês.');
          return 'changing';
        }
      }

      finish('Todos os dias pendentes dos meses selecionados foram processados.');
      return 'none';
    }

    const selectedDate = getSelectedDateBR();

    let day = null;
    const forcedDay = state.forceNextDay
      ? pending.find(td => getCanonicalDay(td) === state.forceNextDay)
      : null;

    if (forcedDay) {
      day = forcedDay;
      state.revisitingDeferred = true;
      log(`Voltando ao dia anterior para conferir/salvar novamente: ${getDayLabel(day)}`);
    }

    if (!day && state.deferredDay) {
      const differentDay = pending.find(td => getCanonicalDay(td) !== state.deferredDay);
      if (differentDay) {
        day = differentDay;
        log(`O dia anterior ainda aparece pendente. Vou executar outro dia e depois volto nele.`);
      } else {
        day = pending[0];
        state.revisitingDeferred = true;
        log(`Só restou o dia anterior pendente. Vou tentar novamente: ${getDayLabel(day)}`);
      }
    }

    if (!day) {
      day = pending[0];
    }

    if (state.currentDay && !state.forceNextDay && !state.deferredDay) {
      const sameDayPending = pending.find(td => getCanonicalDay(td) === state.currentDay);
      if (sameDayPending) {
        day = sameDayPending;
      }
    }

    if (formatCanonicalToBR(getCanonicalDay(day)) === selectedDate) {
      state.currentDay = getCanonicalDay(day);
      state.stage = 'select_lesson';
      if (Number.isInteger(currentMonth)) unmarkMonthAsDone(currentMonth);
      saveState();
      log(`Dia já selecionado: ${getDayLabel(day)}`);
      return 'ready';
    }

    state.currentDay = getCanonicalDay(day);
    state.stage = 'select_lesson';
    if (Number.isInteger(currentMonth)) unmarkMonthAsDone(currentMonth);
    saveState();

    log(`Abrindo dia: ${getDayLabel(day)}`);
    safeClick(day.querySelector('div') || day);
    return 'clicked';
  }

  function clickNextContent() {
    const rows = getPlannedContentRows();

    for (const item of rows) {
      if (isContentDone(item.label)) {
        continue;
      }

      const btnText = normalizeText(item.btn.value || item.btn.textContent || '');
      if (item.btn.disabled || !btnText.includes('executar')) {
        continue;
      }

      log(`Executando conteúdo (${lessonLabel(getDesiredLessonNumber())}): ${item.label}`);
      safeClick(item.btn);
      return 'clicked';
    }

    state.stage = 'execute_materials';
    saveState();
    return 'done';
  }

  function clickNextMaterial() {
    const selected = getSelectedMaterials();

    if (!selected.length) {
      log('Nenhum material marcado. Indo para salvar.');
      state.stage = 'save';
      saveState();
      return 'done';
    }

    for (const wanted of selected) {
      if (isMaterialDone(wanted)) {
        continue;
      }

      const found = findMaterialRowByLabel(wanted);
      if (!found) {
        log(`Material não encontrado na grade: ${wanted}`);
        continue;
      }

      const btnText = normalizeText(found.btn.value || found.btn.textContent || '');
      if (found.btn.disabled || !btnText.includes('executar')) {
        log(`Material indisponível: ${wanted}`);
        continue;
      }

      log(`Executando material (${lessonLabel(getDesiredLessonNumber())}): ${wanted}`);
      safeClick(found.btn);
      return 'clicked';
    }

    state.stage = 'save';
    saveState();
    return 'done';
  }

  function allContentHandled() {
    const rows = getPlannedContentRows();
    return rows.every(item => {
      const btnText = normalizeText(item.btn.value || item.btn.textContent || '');
      return isContentDone(item.label) || item.btn.disabled || !btnText.includes('executar');
    });
  }

  function allSelectedMaterialsHandled() {
    const selected = getSelectedMaterials();

    return selected.every(label => {
      if (isMaterialDone(label)) return true;

      const row = findMaterialRowByLabel(label);
      if (!row) return true;

      const btnText = normalizeText(row.btn.value || row.btn.textContent || '');
      return row.btn.disabled || !btnText.includes('executar');
    });
  }

  function clickSave() {
    const button = document.querySelector(SELECTORS.SAVE_BUTTON);
    if (!button) {
      log('Botão Salvar não encontrado.');
      return false;
    }

    if (!allContentHandled()) {
      log('Ainda há conteúdo pendente antes de salvar.');
      return false;
    }

    if (!allSelectedMaterialsHandled()) {
      log('Ainda há material marcado pendente antes de salvar.');
      return false;
    }

    fillOtherMaterialTextarea();

    const savedDay = state.currentDay;
    const currentLesson = getDesiredLessonNumber();
    const nextLesson = getNextLessonNumber(currentLesson);

    if (nextLesson !== null) {
      state.stage = 'select_lesson';
      state.currentLesson = nextLesson;
      saveState();
      log(`Salvando ${lessonLabel(currentLesson)}. Depois vou executar ${lessonLabel(nextLesson)} no mesmo dia...`);
    } else {
      const wasRevisitingDeferred = !!state.revisitingDeferred;

      if (wasRevisitingDeferred) {
        state.deferredDay = '';
        state.forceNextDay = '';
        state.revisitingDeferred = false;
      } else if (state.deferredDay && savedDay && savedDay !== state.deferredDay) {
        state.forceNextDay = state.deferredDay;
        state.deferredDay = '';
        state.revisitingDeferred = false;
      } else if (savedDay) {
        state.deferredDay = savedDay;
        state.forceNextDay = '';
        state.revisitingDeferred = false;
      }

      state.stage = 'open_day';
      state.currentDay = '';
      state.currentLesson = 1;
      saveState();
      log('Clicando em Salvar...');
    }

    safeClick(button);
    return true;
  }

  async function run() {
    state = loadState();

    if (!state.autoMode) return false;
    if (running) return false;

    if (!isConteudosTabActive()) {
      log('Aguardando a aba "Conteúdos" ficar ativa...');
      scheduleNext(DELAY.retry);
      return false;
    }

    running = true;

    try {
      renderMaterials();
      renderLogs();
      updatePanelInfo();

      if (isSiteBusy()) {
        if (!busyNoticeShown) {
          busyNoticeShown = true;
          log('O site pediu aguarde. Vou esperar liberar a tela.');
        }
        scheduleNext(DELAY.retry);
        return false;
      } else {
        busyNoticeShown = false;
      }

      if (skipCurrentDayByAbsenceMessage()) {
        scheduleNext(700);
        return true;
      }

      if (state.stage === 'idle') {
        state.stage = 'open_day';
        state.currentLesson = 1;
        saveState();
      }

      if (state.stage === 'change_month') {
        const target = getTargetMonth();
        const current = getCurrentMonthIndex();

        if (target === null) {
          state.stage = 'open_day';
          state.currentLesson = 1;
          saveState();
          scheduleNext(500);
          return false;
        }

        if (current === target) {
          log(`Mês carregado: ${monthIndexToLabel(target)}`);
          clearTargetMonth();
          state.stage = 'open_day';
          state.currentLesson = 1;
          saveState();
          scheduleNext(800);
          return true;
        }

        changeSiteMonth(target);
        scheduleNext(DELAY.afterMonthChange);
        return false;
      }

      if (state.stage === 'open_day') {
        const result = openPendingDay();

        if (result === 'clicked') {
          scheduleNext(DELAY.afterOpenDay);
          return true;
        }

        if (result === 'ready') {
          scheduleNext(700);
          return true;
        }

        if (result === 'changing') {
          scheduleNext(DELAY.afterMonthChange);
          return true;
        }

        return false;
      }

      if (state.stage === 'select_lesson') {
        const desiredLesson = getDesiredLessonNumber();

        if (state.currentDay && !isCurrentDayLoaded()) {
          const dayCell = getDayCellByCanonical(state.currentDay);

          if (dayCell) {
            log(`Reabrindo dia ${getDayLabel(dayCell)} para ${lessonLabel(desiredLesson)}.`);
            safeClick(dayCell.querySelector('div') || dayCell);
            scheduleNext(DELAY.afterOpenDay);
            return true;
          }

          log('Aguardando o dia reaparecer no calendário...');
          scheduleNext(DELAY.retry);
          return false;
        }

        const lessonSelect = getLessonSelect();

        if (!lessonSelect) {
          state.stage = 'execute_content';
          saveState();
          scheduleNext(500);
          return true;
        }

        if (!hasLessonOption(desiredLesson)) {
          log(`Este dia não possui ${lessonLabel(desiredLesson)}. Vou seguir para o próximo dia.`);
          state.stage = 'open_day';
          state.currentDay = '';
          state.currentLesson = 1;
          saveState();
          scheduleNext(700);
          return true;
        }

        const currentLesson = getCurrentLessonNumber();
        if (currentLesson === desiredLesson) {
          log(`Aula selecionada: ${lessonLabel(desiredLesson)}.`);
          state.stage = 'execute_content';
          saveState();
          scheduleNext(500);
          return true;
        }

        log(`Selecionando ${lessonLabel(desiredLesson)}...`);
        const ok = selectLesson(desiredLesson);

        if (!ok) {
          log(`Não foi possível selecionar ${lessonLabel(desiredLesson)}.`);
          scheduleNext(DELAY.retry);
          return false;
        }

        scheduleNext(DELAY.afterLessonChange);
        return true;
      }

      if (state.stage === 'execute_content') {
        if (!isCurrentDayLoaded()) {
          log('Aguardando carregar o dia selecionado...');
          scheduleNext(DELAY.retry);
          return false;
        }

        if (!document.querySelector(SELECTORS.CONTENT_GRID)) {
          log('Aguardando a grade de Conteúdo Planejado...');
          scheduleNext(DELAY.retry);
          return false;
        }

        const result = clickNextContent();

        if (result === 'clicked') {
          scheduleNext(DELAY.afterClickContent);
          return true;
        }

        scheduleNext(900);
        return true;
      }

      if (state.stage === 'execute_materials') {
        if (!isCurrentDayLoaded()) {
          log('Aguardando manter o dia carregado...');
          scheduleNext(DELAY.retry);
          return false;
        }

        if (!document.querySelector(SELECTORS.MATERIAL_GRID)) {
          log('Aguardando a grade de Material de Apoio...');
          scheduleNext(DELAY.retry);
          return false;
        }

        const result = clickNextMaterial();

        if (result === 'clicked') {
          scheduleNext(DELAY.afterClickMaterial);
          return true;
        }

        if (result === 'done') {
          const ok = clickSave();
          if (ok) scheduleNext(DELAY.afterSave);
          else scheduleNext(DELAY.retry);
          return ok;
        }
      }

      if (state.stage === 'save') {
        const ok = clickSave();
        if (ok) scheduleNext(DELAY.afterSave);
        else scheduleNext(DELAY.retry);
        return ok;
      }

      await sleep(500);
      return false;
    } finally {
      running = false;
      updatePanelInfo();
    }
  }

  function bindAspNetEndRequest() {
    try {
      const prm = window.Sys?.WebForms?.PageRequestManager?.getInstance?.();
      if (!prm || window.__SIAP_EXECUTOR_PRM_BOUND__) return;

      window.__SIAP_EXECUTOR_PRM_BOUND__ = true;
      prm.add_endRequest(() => {
        renderMaterials();
        renderLogs();
        updatePanelInfo();
      });
    } catch (_) {}
  }

  function init() {
    if (started) return;
    if (!isConteudoProgramaticoPage()) return;
    if (!isExecutorPage()) return;

    started = true;
    state = loadState();

    renderPanel();
    writeMonthSelectionToUI(getSavedSelectedMonths());
    renderMaterials();
    renderLogs();
    updatePanelInfo();
    bindAspNetEndRequest();

    if (state.autoMode) {
      if (isConteudosTabActive()) {
        log(`Retomando execução automática. Etapa atual: ${stageLabel(state.stage)}.`);
        scheduleNext(1000);
      } else {
        log('Execução pausada. Ative a aba "Conteúdos" para continuar.');
      }
    } else {
      log('Módulo de executor de conteúdo carregado.');
    }
  }

  function start() {
    if (!isConteudoProgramaticoPage()) return;
    if (window[START_FLAG]) return;
    window[START_FLAG] = true;
    init();

    setInterval(() => {
      renderMaterials();
      updatePanelInfo();

      if (state.autoMode && !running && isConteudosTabActive()) {
        scheduleNext(300);
      }
    }, 1500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }

  window.SIAPExecutorConteudo = {
    init,
    run,
    stop,
    fillOtherMaterialTextarea
  };
})();