// ==UserScript==
// @name         SIAP - Frequência Automática Compacta
// @namespace    https://hdsites.net.br/
// @version      6.2
// @description  Executor de frequência compacto, com meses automáticos, status animado, minimizar, validação do dia e pulo automático quando houver falta/ausência lançada.
// @match        https://siap.educacao.go.gov.br/FrequenciaAlunoEdicao.aspx*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const KEY = {
    ACTIVE: 'siap_freq_v51_active',
    BLOCKED: 'siap_freq_v51_blocked',
    LAST_DAY: 'siap_freq_v51_last_day',
    CURRENT_DAY: 'siap_freq_v51_current_day',
    LOGS: 'siap_freq_v51_logs',
    PHASE: 'siap_freq_v51_phase', // click_day | save_day | change_month
    TARGET_MONTH: 'siap_freq_v51_target_month',
    DONE_MONTHS: 'siap_freq_v51_done_months',
    SKIPPED_ABSENCE_DAYS: 'siap_freq_v51_skipped_absence_days'
  };

  const LOCAL = {
    SELECTED_MONTHS: 'siap_freq_v51_selected_months'
  };

  const TIME = {
    INITIAL: 1200,
    BEFORE_CLICK_DAY: 700,
    BEFORE_SAVE: 1200,
    AFTER_MONTH_CHANGE: 1800,
    LOOP_DELAY: 900,
    LOADING_CHECK: 600,
    LOADING_STABLE: 700
  };

  const START_FLAG = '__SIAP_FREQ_V51_STARTED__';

  const MONTHS = {
    janeiro: 0,
    fevereiro: 1,
    marco: 2,
    abril: 3,
    maio: 4,
    junho: 5,
    julho: 6,
    agosto: 7,
    setembro: 8,
    outubro: 9,
    novembro: 10,
    dezembro: 11
  };

  const MONTH_LABELS = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  let running = false;
  let ui = {};
  let lastTabNotice = '';

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
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

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, m => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[m]));
  }

  function formatCanonicalToBR(value) {
    if (!value) return '';
    const parts = String(value).split('/');
    if (parts.length !== 3) return '';
    const [year, month, day] = parts;
    return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
  }

  function monthIndexToLabel(idx) {
    return MONTH_LABELS[idx] || `Mês ${idx}`;
  }

  function formatMonthList(arr) {
    const normalized = normalizeMonthArray(arr);
    return normalized.length ? normalized.map(monthIndexToLabel).join(', ') : 'Nenhum';
  }

  function normalizeMonthArray(arr) {
    return [...new Set(
      (Array.isArray(arr) ? arr : [])
        .map(v => parseInt(v, 10))
        .filter(v => Number.isInteger(v) && v >= 0 && v <= 11)
    )].sort((a, b) => a - b);
  }

  function loadLogs() {
    try {
      return JSON.parse(sessionStorage.getItem(KEY.LOGS) || '[]');
    } catch {
      return [];
    }
  }

  function saveLogs(logs) {
    sessionStorage.setItem(KEY.LOGS, JSON.stringify(logs.slice(-150)));
  }

  function log(message) {
    const line = `[${new Date().toLocaleTimeString('pt-BR')}] ${message}`;
    console.log('[SIAP FREQ V51]', message);

    const logs = loadLogs();
    logs.push(line);
    saveLogs(logs);

    if (ui.logs) {
      if (ui.logs) ui.logs.innerHTML = logs.map(item => `<div class="tm-freq-log-line">${escapeHtml(item)}</div>`).join('');
      ui.logs.scrollTop = ui.logs.scrollHeight;
    }

    if (ui.statusText) {
      ui.statusText.textContent = message;
    }
  }

  function setActive(value) {
    if (value) {
      sessionStorage.setItem(KEY.ACTIVE, '1');
      sessionStorage.removeItem(KEY.BLOCKED);
    } else {
      sessionStorage.removeItem(KEY.ACTIVE);
    }
  }

  function isActive() {
    return sessionStorage.getItem(KEY.ACTIVE) === '1';
  }

  function setBlocked(value) {
    if (value) sessionStorage.setItem(KEY.BLOCKED, '1');
    else sessionStorage.removeItem(KEY.BLOCKED);
  }

  function isBlocked() {
    return sessionStorage.getItem(KEY.BLOCKED) === '1';
  }

  function setPhase(value) {
    sessionStorage.setItem(KEY.PHASE, value);
  }

  function getPhase() {
    return sessionStorage.getItem(KEY.PHASE) || 'click_day';
  }

  function setTargetMonth(idx) {
    if (Number.isInteger(idx)) sessionStorage.setItem(KEY.TARGET_MONTH, String(idx));
    else sessionStorage.removeItem(KEY.TARGET_MONTH);
  }

  function getTargetMonth() {
    const raw = sessionStorage.getItem(KEY.TARGET_MONTH);
    const parsed = parseInt(raw || '', 10);
    return Number.isInteger(parsed) ? parsed : null;
  }

  function clearTargetMonth() {
    sessionStorage.removeItem(KEY.TARGET_MONTH);
  }

  function setDoneMonths(arr) {
    sessionStorage.setItem(KEY.DONE_MONTHS, JSON.stringify(normalizeMonthArray(arr)));
  }

  function getDoneMonths() {
    try {
      return normalizeMonthArray(JSON.parse(sessionStorage.getItem(KEY.DONE_MONTHS) || '[]'));
    } catch {
      return [];
    }
  }

  function clearDoneMonths() {
    sessionStorage.removeItem(KEY.DONE_MONTHS);
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
    setDoneMonths(getDoneMonths().filter(m => m !== idx));
  }

  function getSavedSelectedMonths() {
    try {
      const parsed = JSON.parse(localStorage.getItem(LOCAL.SELECTED_MONTHS) || 'null');
      const normalized = normalizeMonthArray(parsed);
      if (normalized.length) return normalized;
    } catch (_) {}

    const current = getSelectedMonthIndex();
    const fallback = Number.isInteger(current) ? [current] : [new Date().getMonth()];
    localStorage.setItem(LOCAL.SELECTED_MONTHS, JSON.stringify(fallback));
    return fallback;
  }

  function saveSelectedMonths(arr) {
    const normalized = normalizeMonthArray(arr);
    localStorage.setItem(LOCAL.SELECTED_MONTHS, JSON.stringify(normalized));
    return normalized;
  }

  function getMonthCheckboxes() {
    return Array.from(document.querySelectorAll('.tm-freq-month-checkbox'));
  }

  function readMonthSelectionFromUI() {
    return normalizeMonthArray(
      getMonthCheckboxes()
        .filter(el => el.checked)
        .map(el => parseInt(el.value, 10))
    );
  }

  function writeMonthSelectionToUI(arr) {
    const selected = normalizeMonthArray(arr);
    getMonthCheckboxes().forEach(el => {
      el.checked = selected.includes(parseInt(el.value, 10));
    });
  }

  function buildMonthSelectorHtml() {
    return MONTH_LABELS.map((label, idx) => `
      <label class="tm-freq-month-item">
        <input type="checkbox" class="tm-freq-month-checkbox" value="${idx}">
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

  function hardStop() {
    setActive(false);
    setBlocked(true);
    clearCurrentDayCanonical();
    running = false;
    log('Automação parada totalmente.');
    updatePanel();
  }

  function getYesterday() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - 1);
    return d;
  }

  function isFrequencyPage() {
    return /FrequenciaAlunoEdicao\.aspx/i.test(String(window.location.href || ''));
  }

  function isElementVisible(el) {
    if (!el) return false;

    try {
      const style = window.getComputedStyle(el);
      if (!style || style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
        return false;
      }

      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 && rect.height <= 0) return false;

      return true;
    } catch (_) {
      return false;
    }
  }

  function isSiapLoadingVisible() {
    const candidates = Array.from(document.querySelectorAll('.loadingDiv, #loadImage'));

    return candidates.some(el => {
      if (!isElementVisible(el)) return false;

      const box = el.closest('.loadingDiv') || el;
      const text = normalizeText(box.textContent || el.textContent || '');

      if (text.includes('aguarde um momento')) return true;
      if (el.id === 'loadImage') return true;

      const img = box.querySelector ? box.querySelector('#loadImage') : null;
      return !!img && isElementVisible(img);
    });
  }

  async function waitForSiapReady(reason = '') {
    let warned = false;

    while (isActive() && !isBlocked()) {
      if (!isSiapLoadingVisible()) {
        await sleep(TIME.LOADING_STABLE);

        if (!isSiapLoadingVisible()) {
          if (warned) {
            log(`Carregamento do SIAP finalizado. Continuando${reason ? `: ${reason}` : ''}.`);
          }
          return true;
        }
      }

      if (!warned) {
        log(`SIAP exibiu "Aguarde um momento...". Esperando sumir para continuar${reason ? `: ${reason}` : ''}.`);
        warned = true;
      }

      await sleep(TIME.LOADING_CHECK);
    }

    return false;
  }

  function setPanelVisibility() {
    const panel = document.querySelector('#tm-gpt-panel-frequencia-v51');
    if (!panel) return;
    panel.style.display = (isFrequencyPage() && isFrequenciaTabActive()) ? '' : 'none';
  }

  function isFrequenciaTabActive() {
    if (!isFrequencyPage()) return false;

    const navs = Array.from(document.querySelectorAll('ul.nav.nav-tabs'));
    if (!navs.length) return false;

    const targetNav = navs.find(nav => {
      const text = normalizeText(nav.textContent || '');
      return text.includes('frequencia') || text.includes('frequência');
    });

    if (!targetNav) return false;

    const candidates = Array.from(targetNav.querySelectorAll('a[href="#home"], a[data-toggle], a'));
    const link = candidates.find(a => normalizeText(a.textContent || '') === 'frequencia' || normalizeText(a.textContent || '') === 'frequência');

    if (!link) return false;

    const li = link.closest('li');
    if (li && li.classList.contains('active')) return true;
    if (link.classList.contains('active')) return true;
    if (link.getAttribute('aria-selected') === 'true') return true;

    const homePane = document.querySelector('#home');
    if (homePane && (homePane.classList.contains('active') || homePane.classList.contains('show'))) {
      return true;
    }

    return false;
  }

  function getSelectedMonthText() {
    const select = document.querySelector('#selectMesCalendarioMensal');
    if (!select) return '';
    const opt = select.options[select.selectedIndex];
    return opt ? String(opt.textContent || '').trim() : '';
  }

  function getSelectedMonthIndex() {
    const normalized = normalizeText(getSelectedMonthText());
    return Object.prototype.hasOwnProperty.call(MONTHS, normalized) ? MONTHS[normalized] : null;
  }

  function getPainelMensagemText() {
    const panel = document.querySelector('#painelMensagem');
    if (!panel) return '';
    return normalizeText(panel.textContent || '');
  }

  function hasAbsenceRegisteredMessage() {
    const text = getPainelMensagemText();
    if (!text) return false;

    const patterns = [
      'existe ausencia cadastrada para a data selecionada',
      'ausencia cadastrada para a data selecionada',
      'existe falta cadastrada para a data selecionada',
      'falta cadastrada para a data selecionada',
      'existe falta lancada para a data selecionada',
      'falta lancada para a data selecionada',
      'existe falta registrada para a data selecionada',
      'falta registrada para a data selecionada',
      'ja existe falta',
      'falta lancada',
      'faltas lancadas',
      'ausencia cadastrada'
    ];

    return patterns.some(pattern => text.includes(pattern));
  }

  function readSkippedAbsenceDays() {
    try {
      const raw = sessionStorage.getItem(KEY.SKIPPED_ABSENCE_DAYS);
      const parsed = JSON.parse(raw || '[]');
      return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
    } catch (_) {
      return [];
    }
  }

  function writeSkippedAbsenceDays(list) {
    try {
      sessionStorage.setItem(KEY.SKIPPED_ABSENCE_DAYS, JSON.stringify(Array.from(new Set(list.map(String).filter(Boolean)))));
    } catch (_) {}
  }

  function isSkippedAbsenceDay(canonical) {
    return !!canonical && readSkippedAbsenceDays().includes(String(canonical));
  }

  function markSkippedAbsenceDay(canonical) {
    if (!canonical) return false;
    const list = readSkippedAbsenceDays();
    if (!list.includes(String(canonical))) {
      list.push(String(canonical));
      writeSkippedAbsenceDays(list);
    }
    return true;
  }

  function canonicalFromBR(dateBR) {
    const m = String(dateBR || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return '';
    return `${m[3]}/${m[2].padStart(2, '0')}/${m[1].padStart(2, '0')}`;
  }

  function getCurrentDayCanonical() {
    return sessionStorage.getItem(KEY.CURRENT_DAY) || '';
  }

  function setCurrentDayCanonical(canonical) {
    if (canonical) sessionStorage.setItem(KEY.CURRENT_DAY, String(canonical));
    else sessionStorage.removeItem(KEY.CURRENT_DAY);
  }

  function clearCurrentDayCanonical() {
    sessionStorage.removeItem(KEY.CURRENT_DAY);
  }

  function skipSelectedDayByAbsenceMessage() {
    if (!hasAbsenceRegisteredMessage()) return false;

    const selected = getSelectedDateText();
    const selectedCanonical = canonicalFromBR(selected);
    const currentCanonical = getCurrentDayCanonical();
    const currentBR = currentCanonical ? formatCanonicalToBR(currentCanonical) : '';

    // Mesma proteção usada no executor de conteúdo:
    // só pula quando a mensagem pertence ao dia que a automação acabou de abrir.
    // Isso evita que uma mensagem antiga do SIAP faça o robô ignorar o dia errado.
    if (currentCanonical && selected && currentBR && selected !== currentBR) {
      return false;
    }

    let canonical = currentCanonical || selectedCanonical;

    if (!canonical) {
      const last = sessionStorage.getItem(KEY.LAST_DAY) || '';
      canonical = canonicalFromBR(last);
    }

    if (!canonical) return false;

    markSkippedAbsenceDay(canonical);
    clearCurrentDayCanonical();
    log(`Falta/ausência já lançada para ${formatCanonicalToBR(canonical) || selected || canonical}. Ignorando este dia e passando para o próximo.`);
    setPhase('click_day');
    updatePanel();
    return true;
  }

  function changeSiteMonth(monthIdx) {
    const select = document.querySelector('#selectMesCalendarioMensal');
    if (!select) return false;

    if (select.selectedIndex === monthIdx) return true;

    try { select.focus(); } catch (_) {}
    select.selectedIndex = monthIdx;

    try { select.dispatchEvent(new Event('input', { bubbles: true })); } catch (_) {}
    try { select.dispatchEvent(new Event('change', { bubbles: true })); } catch (_) {}

    try {
      if (typeof select.onchange === 'function') {
        select.onchange();
      }
    } catch (_) {}

    return true;
  }

  function parseCanonicalDate(value) {
    if (!value) return null;
    const parts = String(value).split('/');
    if (parts.length !== 3) return null;

    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);

    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
      return null;
    }

    const d = new Date(year, month, day);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function getDayNumberFromCell(td) {
    const text = (td.querySelector('div')?.textContent || td.textContent || '').trim();
    const match = text.match(/\d{1,2}/);
    return match ? parseInt(match[0], 10) : NaN;
  }

  function getCellDate(td) {
    const canonical = td.getAttribute('data-canonica') || '';
    const fromCanonical = parseCanonicalDate(canonical);
    if (fromCanonical) return fromCanonical;

    const monthIndex = getSelectedMonthIndex();
    const year = parseInt(td.getAttribute('anocorrente') || String(new Date().getFullYear()), 10);
    const day = getDayNumberFromCell(td);

    if (monthIndex === null || !Number.isFinite(year) || !Number.isFinite(day)) {
      return null;
    }

    const d = new Date(year, monthIndex, day);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function isEligibleUntilYesterday(td) {
    const d = getCellDate(td);
    if (!d) return false;
    return d.getTime() <= getYesterday().getTime();
  }

  function isAbsenceCell(td) {
    if (!td) return false;

    const attrs = [
      td.getAttribute('data-ausencia'),
      td.getAttribute('data-ausencia-frequencia'),
      td.getAttribute('data-falta'),
      td.getAttribute('data-falta-lancada')
    ].map(v => String(v || '').trim().toLowerCase());

    if (attrs.some(v => v === 'true' || v === '1')) return true;

    const title = normalizeText(td.getAttribute('title') || '');
    const text = normalizeText(`${td.getAttribute('data') || ''} ${td.textContent || ''}`);
    const combined = `${title} ${text}`;

    return combined.includes('falta lancada') ||
      combined.includes('faltas lancadas') ||
      combined.includes('ausencia cadastrada') ||
      combined.includes('ausencia lancada');
  }

  function getPendingCellsRaw() {
    return Array.from(
      document.querySelectorAll(
        'td.dialog.letivo[data-lancamento-frequencia="True"][data-executado="False"], td.dialog.letivo[data-executado="False"]'
      )
    )
      .filter(td => (td.getAttribute('data-executado') || '') === 'False')
      .filter(td => !isAbsenceCell(td));
  }

  function getPendingDays() {
    return getPendingCellsRaw()
      .filter(isEligibleUntilYesterday)
      .filter(td => !isSkippedAbsenceDay(td.getAttribute('data-canonica') || ''))
      .map(td => ({
        el: td,
        canonical: td.getAttribute('data-canonica') || '',
        dateBR: formatCanonicalToBR(td.getAttribute('data-canonica') || ''),
        text: (td.getAttribute('data') || '').trim(),
        dateObj: getCellDate(td)
      }))
      .sort((a, b) => {
        const av = a.dateObj ? a.dateObj.getTime() : 0;
        const bv = b.dateObj ? b.dateObj.getTime() : 0;
        return av - bv;
      });
  }

  function countFuturePendingDays() {
    return getPendingCellsRaw().filter(td => !isEligibleUntilYesterday(td)).length;
  }

  function getSelectedDateText() {
    const field = document.querySelector('#cphFuncionalidade_cphCampos_txtDataSelecionada');
    return field ? String(field.value || '').trim() : '';
  }

  function getSaveButton() {
    return document.querySelector('#cphFuncionalidade_btnAlterar');
  }

  function getMainForm() {
    return document.forms['FormularioPrincipal'] || document.querySelector('form');
  }

  function safeClick(el) {
    if (!el) return false;

    try {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (_) {}

    try { el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); } catch (_) {}
    try { el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 })); } catch (_) {}
    try { el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0 })); } catch (_) {}
    try { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); } catch (_) {}

    try {
      if (typeof el.click === 'function') el.click();
    } catch (_) {}

    return true;
  }

  function triggerSave(btn) {
    if (!btn) return false;

    const form = btn.form || getMainForm();
    if (!form) return false;

    try { btn.focus(); } catch (_) {}

    try {
      btn.click();
      return true;
    } catch (_) {}

    try {
      if (typeof form.requestSubmit === 'function') {
        form.requestSubmit(btn);
        return true;
      }
    } catch (_) {}

    try {
      const hidden = document.createElement('input');
      hidden.type = 'hidden';
      hidden.name = btn.name || btn.id || 'submitFallback';
      hidden.value = btn.value || 'Salvar';
      form.appendChild(hidden);
      form.submit();
      return true;
    } catch (_) {}

    return false;
  }

  function hasSelectedDayReadyToSave() {
    const selected = getSelectedDateText();
    const btn = getSaveButton();
    return !!selected && !!btn && !btn.disabled;
  }

  function updatePanel() {
    const pending = getPendingDays();
    const future = countFuturePendingDays();
    const selected = getSelectedDateText();
    const lastDay = sessionStorage.getItem(KEY.LAST_DAY) || '-';
    const month = getSelectedMonthText() || '-';
    const limit = getYesterday().toLocaleDateString('pt-BR');
    const phase = getPhase();
    const activeNow = isActive() && !isBlocked();
    const validatingDay = selected || lastDay || pending[0]?.dateBR || pending[0]?.text || '-';

    if (ui.status) {
      ui.status.innerHTML = activeNow
        ? '<span class="tm-freq-dot"></span><span>Ativo</span>'
        : '<span class="tm-freq-dot stopped"></span><span>Parado</span>';
      ui.status.style.color = activeNow ? '#208a46' : '#c44949';
    }

    if (ui.statusText) {
      ui.statusText.textContent = activeNow
        ? `Validando: ${validatingDay}`
        : `Aguardando ação... Último dia: ${lastDay}`;
    }

    if (ui.phase) ui.phase.textContent = phase;
    if (ui.month) ui.month.textContent = month;
    if (ui.limit) ui.limit.textContent = limit;
    if (ui.pending) ui.pending.textContent = String(pending.length);
    if (ui.future) ui.future.textContent = String(future);
    if (ui.selected) ui.selected.textContent = selected || '-';
    if (ui.next) ui.next.textContent = pending[0]?.dateBR || pending[0]?.text || '-';
    if (ui.last) ui.last.textContent = lastDay;
    if (ui.activeMonths) ui.activeMonths.textContent = formatMonthList(getSavedSelectedMonths());
    if (ui.doneMonths) ui.doneMonths.textContent = formatMonthList(getDoneMonths());
  }

  function startMonthChange(nextMonth, reason) {
    if (!Number.isInteger(nextMonth)) return false;

    setTargetMonth(nextMonth);
    setPhase('change_month');
    log(`${reason} Trocando para ${monthIndexToLabel(nextMonth)}.`);
    changeSiteMonth(nextMonth);
    return true;
  }

  async function clickNextPendingDay() {
    const selectedMonths = getSavedSelectedMonths();
    const currentMonth = getSelectedMonthIndex();

    if (Number.isInteger(currentMonth) && selectedMonths.length && !selectedMonths.includes(currentMonth)) {
      const nextMonth = findNextSelectedMonth(currentMonth, selectedMonths, getDoneMonths());

      if (nextMonth === null) {
        log('Nenhum mês selecionado restante para processar.');
        setActive(false);
        setPhase('click_day');
        updatePanel();
        return false;
      }

      return startMonthChange(nextMonth, `O mês atual (${monthIndexToLabel(currentMonth)}) não está na seleção.`);
    }

    const pending = getPendingDays();

    if (!pending.length) {
      const future = countFuturePendingDays();

      if (Number.isInteger(currentMonth)) {
        markMonthAsDone(currentMonth);
      }

      const nextMonth = findNextSelectedMonth(currentMonth, selectedMonths, getDoneMonths());
      if (nextMonth !== null) {
        return startMonthChange(nextMonth, 'Sem dias elegíveis neste mês.');
      }

      if (future > 0) {
        log(`Sem dias elegíveis até ontem. Existem ${future} dia(s) futuro(s) pendente(s).`);
      } else {
        log('Nenhum dia pendente encontrado nos meses selecionados.');
      }

      setActive(false);
      setPhase('click_day');
      updatePanel();
      return false;
    }

    if (Number.isInteger(currentMonth)) {
      unmarkMonthAsDone(currentMonth);
    }

    const next = pending[0];
    sessionStorage.setItem(KEY.LAST_DAY, next.dateBR || next.text || '-');
    setCurrentDayCanonical(next.canonical || canonicalFromBR(next.dateBR || ''));

    log(`Clicando no dia: ${next.dateBR || next.text}`);
    updatePanel();

    await sleep(TIME.BEFORE_CLICK_DAY);

    const readyToClick = await waitForSiapReady('clicar no próximo dia');
    if (!readyToClick || !isActive() || isBlocked()) return false;

    setPhase('save_day');
    safeClick(next.el.querySelector('div') || next.el);

    return true;
  }

  async function saveSelectedDay() {
    const btn = getSaveButton();
    const selected = getSelectedDateText();

    if (!btn || btn.disabled || !selected) {
      log('Dia ainda não ficou pronto para salvar. Vou tentar novamente.');
      return false;
    }

    log(`Salvando o dia selecionado: ${selected}`);
    updatePanel();

    await sleep(TIME.BEFORE_SAVE);

    const readyToSave = await waitForSiapReady('salvar o dia selecionado');
    if (!readyToSave || !isActive() || isBlocked()) return false;

    setPhase('click_day');
    const ok = triggerSave(btn);

    if (!ok) {
      log('Falha ao acionar o botão Salvar.');
      return false;
    }

    clearCurrentDayCanonical();
    return true;
  }

  async function processCycle() {
    if (!isFrequencyPage()) return;
    if (running || !isActive() || isBlocked()) return;
    if (!isFrequenciaTabActive()) {
      const msg = 'Aguardando a aba "Frequência" ficar ativa...';
      if (lastTabNotice !== msg) {
        lastTabNotice = msg;
        log(msg);
      }
      return;
    }

    lastTabNotice = '';
    running = true;

    try {
      const readyToProcess = await waitForSiapReady('processar a frequência');
      if (!readyToProcess) return;

      updatePanel();

      if (skipSelectedDayByAbsenceMessage()) {
        await sleep(TIME.LOOP_DELAY);
        if (isActive() && !isBlocked()) {
          running = false;
          return processCycle();
        }
        return;
      }

      const phase = getPhase();

      if (phase === 'change_month') {
        const target = getTargetMonth();
        const current = getSelectedMonthIndex();

        if (target === null) {
          setPhase('click_day');
          await sleep(TIME.LOOP_DELAY);
          return;
        }

        if (current === target) {
          log(`Mês carregado: ${monthIndexToLabel(target)}`);
          clearTargetMonth();
          setPhase('click_day');
          await sleep(TIME.LOOP_DELAY);
          if (isActive() && !isBlocked()) {
            running = false;
            return processCycle();
          }
          return;
        }

        changeSiteMonth(target);
        await waitForSiapReady('trocar o mês');
        await sleep(TIME.AFTER_MONTH_CHANGE);
        if (isActive() && !isBlocked()) {
          running = false;
          return processCycle();
        }
        return;
      }

      if (phase === 'save_day') {
        if (hasSelectedDayReadyToSave()) {
          const saved = await saveSelectedDay();
          if (!saved) {
            await sleep(TIME.LOOP_DELAY);
            if (isActive() && !isBlocked()) {
              running = false;
              return processCycle();
            }
          }
          return;
        } else {
          log('Aguardando a página carregar o dia selecionado para salvar...');
          await sleep(TIME.LOOP_DELAY);
          if (isActive() && !isBlocked()) {
            running = false;
            return processCycle();
          }
          return;
        }
      }

      await clickNextPendingDay();
    } catch (err) {
      console.error(err);
      log(`Erro: ${err.message || err}`);
    } finally {
      running = false;
      updatePanel();
    }
  }

  function renderPanel() {
    if (window.__SIAP_SAAS_HEADLESS__) return;
    if (!isFrequencyPage() || !isFrequenciaTabActive()) return;
    if (document.querySelector('#tm-gpt-panel-frequencia-v51')) return;

    const panel = document.createElement('div');
    panel.id = 'tm-gpt-panel-frequencia-v51';
    panel.innerHTML = `
      <div id="tm-gpt-header-frequencia-v51">
        <span>Frequência Automática</span>
        <button id="freq-btn-minimize-v51" type="button" title="Minimizar">−</button>
      </div>

      <div id="tm-freq-body-v51">
        <div class="tm-gpt-freq-row tm-gpt-freq-status-line"><strong>Status:</strong> <span id="freq-status-v51">-</span></div>
        <div id="freq-status-text-v51" class="tm-gpt-status-box">Aguardando ação...</div>

        <div class="tm-gpt-freq-month-box">
          <div class="tm-gpt-section-title">Meses para executar</div>
          <div class="tm-gpt-freq-month-grid">
            ${buildMonthSelectorHtml()}
          </div>
          <div class="tm-gpt-buttons tm-gpt-buttons-mini">
            <button id="freq-btn-months-all-v51" type="button">Todos</button>
            <button id="freq-btn-months-none-v51" type="button">Limpar</button>
            <button id="freq-btn-months-save-v51" type="button">Salvar</button>
          </div>
          <div class="tm-gpt-freq-row compact"><strong>Ativos:</strong> <span id="freq-active-months-v51">-</span></div>
          <div class="tm-gpt-freq-row compact"><strong>Concluídos:</strong> <span id="freq-done-months-v51">-</span></div>
        </div>

        <div class="tm-gpt-buttons">
          <button id="freq-btn-start-v51">Iniciar</button>
          <button id="freq-btn-stop-v51">Parar</button>
        </div>
      </div>

      <div class="tm-hidden-freq-data" style="display:none">
        <span id="freq-phase-v51"></span>
        <span id="freq-month-v51"></span>
        <span id="freq-limit-v51"></span>
        <span id="freq-pending-v51"></span>
        <span id="freq-future-v51"></span>
        <span id="freq-selected-v51"></span>
        <span id="freq-next-v51"></span>
        <span id="freq-last-v51"></span>
        <div id="freq-logs-v51"></div>
      </div>
    `;

    if (!document.querySelector('#tm-gpt-freq-style-v51')) {
      const style = document.createElement('style');
      style.id = 'tm-gpt-freq-style-v51';
      style.textContent = `
        #tm-gpt-panel-frequencia-v51 {
          position: fixed;
          bottom: 20px;
          right: 20px;
          width: 340px;
          max-height: 78vh;
          overflow: auto;
          z-index: 999999;
          background: #fff;
          border: 1px solid #d8dde7;
          border-radius: 14px;
          box-shadow: 0 10px 30px rgba(0,0,0,.18);
          padding: 10px;
          font-family: Arial, sans-serif;
          color: #222;
        }
        #tm-gpt-header-frequencia-v51 {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          font-size: 16px;
          font-weight: bold;
          margin-bottom: 8px;
          color: #1f3b5b;
          cursor: move;
        }
        #freq-btn-minimize-v51 {
          width: 30px;
          height: 28px;
          border: none;
          border-radius: 8px;
          background: #eef3fb;
          color: #1f3b5b;
          font-size: 18px;
          font-weight: bold;
          cursor: pointer;
          line-height: 1;
        }
        #tm-gpt-panel-frequencia-v51.tm-minimized #tm-freq-body-v51 { display: none; }
        #tm-gpt-panel-frequencia-v51.tm-minimized {
          width: 260px;
          overflow: hidden;
        }
        .tm-gpt-freq-row {
          margin-bottom: 5px;
          font-size: 12px;
        }
        .tm-gpt-freq-row.compact {
          margin-bottom: 3px;
          line-height: 1.25;
        }
        .tm-gpt-freq-status-line {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-bottom: 6px;
        }
        #freq-status-v51 {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-weight: bold;
        }
        .tm-freq-dot {
          width: 10px;
          height: 10px;
          border-radius: 999px;
          background: #28b925;
          display: inline-block;
          animation: tmFreqPulse 1s infinite ease-in-out;
        }
        .tm-freq-dot.stopped {
          background: #c44949;
          animation: none;
        }
        @keyframes tmFreqPulse {
          0%, 100% { transform: scale(.85); opacity: .45; }
          50% { transform: scale(1.25); opacity: 1; }
        }
        .tm-gpt-buttons {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
          margin-top: 8px;
        }
        .tm-gpt-buttons button {
          flex: 1;
          min-width: 72px;
          border: none;
          border-radius: 8px;
          color: #fff;
          padding: 8px 9px;
          cursor: pointer;
          font-weight: bold;
          font-size: 12px;
          background: #2d6cdf;
        }
        .tm-gpt-buttons-mini button {
          min-width: 58px;
          padding: 7px 8px;
        }
        #freq-btn-start-v51 { background: #28b925; }
        #freq-btn-stop-v51 { background: #c44949; }
        #freq-btn-months-save-v51 { background: #2d6cdf; }
        .tm-gpt-section-title {
          margin-top: 6px;
          margin-bottom: 5px;
          font-weight: bold;
          font-size: 12px;
        }
        .tm-gpt-freq-month-box {
          margin-top: 8px;
          margin-bottom: 8px;
          padding: 8px;
          border-radius: 10px;
          background: #f7f9fc;
          border: 1px solid #e3e7ef;
        }
        .tm-gpt-freq-month-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 4px 7px;
          margin-top: 5px;
          margin-bottom: 6px;
        }
        .tm-freq-month-item {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 11px;
          cursor: pointer;
          user-select: none;
        }
        .tm-freq-month-item input { cursor: pointer; margin: 0; }
        .tm-gpt-status-box {
          margin-top: 6px;
          padding: 7px;
          background: #f3f6fa;
          border-radius: 8px;
          font-size: 12px;
          line-height: 1.25;
        }
        #freq-logs-v51 { display:none; }
      `;
      document.head.appendChild(style);
    }

    document.body.appendChild(panel);

    ui = {
      logs: document.getElementById('freq-logs-v51'),
      status: document.getElementById('freq-status-v51'),
      phase: document.getElementById('freq-phase-v51'),
      month: document.getElementById('freq-month-v51'),
      limit: document.getElementById('freq-limit-v51'),
      pending: document.getElementById('freq-pending-v51'),
      future: document.getElementById('freq-future-v51'),
      selected: document.getElementById('freq-selected-v51'),
      next: document.getElementById('freq-next-v51'),
      last: document.getElementById('freq-last-v51'),
      activeMonths: document.getElementById('freq-active-months-v51'),
      doneMonths: document.getElementById('freq-done-months-v51'),
      statusText: document.getElementById('freq-status-text-v51'),
      startBtn: document.getElementById('freq-btn-start-v51'),
      stopBtn: document.getElementById('freq-btn-stop-v51'),
      monthsAllBtn: document.getElementById('freq-btn-months-all-v51'),
      monthsNoneBtn: document.getElementById('freq-btn-months-none-v51'),
      monthsSaveBtn: document.getElementById('freq-btn-months-save-v51'),
      minimizeBtn: document.getElementById('freq-btn-minimize-v51')
    };

    const logs = loadLogs();
    if (ui.logs) ui.logs.innerHTML = logs.map(item => `<div class="tm-freq-log-line">${escapeHtml(item)}</div>`).join('');

    writeMonthSelectionToUI(getSavedSelectedMonths());

    const autoSaveMonthsFromUI = () => {
      const selected = readMonthSelectionFromUI();
      if (!selected.length) return;
      const saved = saveSelectedMonths(selected);
      clearDoneMonths();
      clearTargetMonth();
      setPhase('click_day');
      updatePanel();
      return saved;
    };

    document.querySelectorAll('.tm-freq-month-checkbox').forEach(el => {
      el.addEventListener('change', autoSaveMonthsFromUI);
    });

    ui.minimizeBtn?.addEventListener('click', () => {
      const minimized = panel.classList.toggle('tm-minimized');
      ui.minimizeBtn.textContent = minimized ? '+' : '−';
      ui.minimizeBtn.title = minimized ? 'Expandir' : 'Minimizar';
    });

    ui.monthsAllBtn.addEventListener('click', () => {
      writeMonthSelectionToUI(MONTH_LABELS.map((_, idx) => idx));
      autoSaveMonthsFromUI();
    });

    ui.monthsNoneBtn.addEventListener('click', () => {
      writeMonthSelectionToUI([]);
      updatePanel();
    });

    ui.monthsSaveBtn.addEventListener('click', () => {
      const selected = readMonthSelectionFromUI();
      if (!selected.length) {
        alert('Marque pelo menos um mês antes de salvar.');
        return;
      }

      const saved = saveSelectedMonths(selected);
      clearDoneMonths();
      clearTargetMonth();
      setPhase('click_day');

      log(`Meses salvos: ${formatMonthList(saved)}.`);
      updatePanel();
    });

    ui.startBtn.addEventListener('click', () => {
      if (!isFrequenciaTabActive()) {
        log('Ative a aba "Frequência" antes de iniciar.');
        return;
      }

      const selectedMonths = getSavedSelectedMonths();
      if (!selectedMonths.length) {
        alert('Nenhum mês salvo. Marque os meses e clique em "Salvar meses".');
        return;
      }

      setBlocked(false);
      setActive(true);
      setPhase('click_day');
      clearDoneMonths();
      clearTargetMonth();
      clearCurrentDayCanonical();

      log(`Automação iniciada manualmente. Meses ativos: ${formatMonthList(selectedMonths)}.`);
      updatePanel();
      processCycle().catch(err => log(`Erro: ${err.message || err}`));
    });

    ui.stopBtn.addEventListener('click', () => {
      hardStop();
    });

    updatePanel();
    setPanelVisibility();
  }

  async function boot() {
    if (!isFrequencyPage()) return;

    if (isFrequenciaTabActive()) {
      renderPanel();
      setPanelVisibility();
      await sleep(TIME.INITIAL);

      if (isActive() && !isBlocked()) {
        log(`Retomando automação após recarregamento. Fase atual: ${getPhase()}`);
        updatePanel();
        processCycle().catch(err => log(`Erro: ${err.message || err}`));
        return;
      }

      log('Automação pronta. Clique em Iniciar.');
      updatePanel();
    }
  }

  function start() {
    if (!isFrequencyPage()) return;
    if (window[START_FLAG]) return;
    window[START_FLAG] = true;
    boot();

    setInterval(() => {
      if (!isFrequencyPage()) return;

      if (isFrequenciaTabActive()) {
        if (!document.querySelector('#tm-gpt-panel-frequencia-v51')) {
          renderPanel();
          if (document.querySelector('#tm-gpt-panel-frequencia-v51')) {
            log('Painel de frequência carregado.');
          }
        }
        setPanelVisibility();
        if (document.querySelector('#tm-gpt-panel-frequencia-v51')) {
          updatePanel();
        }

        if (isActive() && !isBlocked() && !running) {
          processCycle().catch(err => log(`Erro: ${err.message || err}`));
        }
      } else {
        setPanelVisibility();
      }
    }, 1000);
  }

  if (document.readyState === 'loading') {
    window.addEventListener('load', start, { once: true });
  } else {
    start();
  }

  window.SIAPFrequenciaV51 = {
    init: start,
    start: processCycle,
    stop: hardStop
  };

  window.SIAPFrequencia = {
    init: start,
    start: processCycle,
    stop: hardStop
  };
})();
