window.SIAPBimestre = (() => {
  const STORAGE_KEY_VALUE = 'tm_gpt_ultimo_ddlBimestre_value';
  const STORAGE_KEY_TEXT = 'tm_gpt_ultimo_ddlBimestre_text';
  const STORAGE_KEY_AT = 'tm_gpt_ultimo_ddlBimestre_at';
  const SELECTOR = '#cphFuncionalidade_cphCampos_ddlBimestre, #ddlBimestre, select[id$="ddlBimestre"], select[name$="$ddlBimestre"]';

  function log(message, ...args) {
    try {
      if (window.SIAPLogger?.log) window.SIAPLogger.log(message);
      else console.log('[SIAP bimestre]', message, ...args);
    } catch (_) {}
  }

  function getSelect() {
    return document.querySelector(SELECTOR);
  }

  function getSelectedText(select) {
    if (!select || select.selectedIndex < 0) return '';
    return String(select.options[select.selectedIndex]?.textContent || '').trim();
  }

  function normalize(value) {
    const text = String(value || '').replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
    if (window.SIAPUtils?.normalizeCompare) return window.SIAPUtils.normalizeCompare(text);
    return text.toLowerCase();
  }

  function getSavedValue() {
    try {
      return String(localStorage.getItem(STORAGE_KEY_VALUE) || '').trim();
    } catch (_) {
      return '';
    }
  }

  function getSavedText() {
    try {
      return String(localStorage.getItem(STORAGE_KEY_TEXT) || '').trim();
    } catch (_) {
      return '';
    }
  }

  function saveValue(value, text) {
    const safeValue = String(value || '').trim();
    if (!safeValue) return false;

    try {
      localStorage.setItem(STORAGE_KEY_VALUE, safeValue);
      localStorage.setItem(STORAGE_KEY_TEXT, String(text || '').trim());
      localStorage.setItem(STORAGE_KEY_AT, new Date().toISOString());
      return true;
    } catch (_) {
      return false;
    }
  }

  function rememberCurrentBimestre() {
    const select = getSelect();
    if (!select || !select.value) return false;

    const text = getSelectedText(select);
    const ok = saveValue(select.value, text);
    if (ok) log(`[Bimestre] Último bimestre salvo: ${text || select.value}`);
    return ok;
  }

  function hasOptionValue(select, value) {
    return Array.from(select?.options || []).some((option) => String(option.value) === String(value));
  }

  function findOption(select, value, text) {
    const options = Array.from(select?.options || []);
    const safeValue = String(value || '').trim();
    if (safeValue) {
      const byValue = options.find(option => String(option.value) === safeValue);
      if (byValue) return byValue;
    }

    const safeText = normalize(text);
    return safeText
      ? (options.find(option => normalize(option.textContent || option.innerText || '') === safeText) || null)
      : null;
  }

  async function waitForAsyncPostBack(timeout = 7000) {
    if (window.SIAPUtils?.waitForAsyncPostBack) {
      await window.SIAPUtils.waitForAsyncPostBack(timeout, 700);
      return;
    }

    const prm = window.Sys?.WebForms?.PageRequestManager?.getInstance?.() || null;
    if (!prm || typeof prm.get_isInAsyncPostBack !== 'function') return;

    const start = Date.now();
    while (prm.get_isInAsyncPostBack()) {
      if (Date.now() - start > timeout) break;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  }

  async function restoreLastBimestre(options = {}) {
    const savedValue = getSavedValue();
    if (!savedValue) return false;

    const select = getSelect();
    if (!select) return false;

    if (!hasOptionValue(select, savedValue)) {
      const savedText = getSavedText();
      log(`[Bimestre] O último bimestre salvo${savedText ? ' (' + savedText + ')' : ''} não existe nesta tela. Mantendo o bimestre atual.`);
      return false;
    }

    return selectBimestre({ value: savedValue, text: getSavedText() }, options);
  }

  async function selectBimestre(target = {}, options = {}) {
    const value = typeof target === 'object' && target ? target.value : target;
    const text = typeof target === 'object' && target ? target.text : '';
    const select = getSelect();
    if (!select) return false;

    const option = findOption(select, value, text);
    if (!option) {
      log(`[Bimestre] Bimestre solicitado não existe nesta tela: ${text || value || '-'}`);
      return false;
    }

    const selectedValue = String(option.value || '');
    const selectedText = String(option.textContent || option.innerText || '').trim();

    if (String(select.value) === selectedValue) {
      if (options.remember !== false) saveValue(selectedValue, selectedText);
      return true;
    }

    const beforeText = getSelectedText(select);
    select.value = selectedValue;
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));

    if (options.remember !== false) saveValue(selectedValue, selectedText);
    log(`[Bimestre] Bimestre selecionado automaticamente: ${selectedText || selectedValue}${beforeText ? ' (antes: ' + beforeText + ')' : ''}`);

    await waitForAsyncPostBack(Number(options.timeout || 12000));

    if (window.SIAPUtils?.sleep) await window.SIAPUtils.sleep(900);
    else await new Promise(resolve => setTimeout(resolve, 900));

    const refreshed = getSelect();
    const refreshedOption = refreshed ? findOption(refreshed, selectedValue, selectedText) : null;
    const confirmed = !!(refreshed && refreshedOption && String(refreshed.value) === String(refreshedOption.value));
    if (confirmed && options.remember !== false) {
      saveValue(String(refreshedOption.value), getSelectedText(refreshed));
    }
    return confirmed;
  }

  function bindChangeWatcher() {
    if (window.__SIAP_BIMESTRE_WATCHER_BOUND__) return;
    window.__SIAP_BIMESTRE_WATCHER_BOUND__ = true;

    document.addEventListener('change', (event) => {
      const select = event.target;
      if (!select || !select.matches || !select.matches(SELECTOR)) return;
      if (window.__SIAP_CATALOG_SCAN_ACTIVE__) return;
      rememberCurrentBimestre();
    }, true);
  }

  function init() {
    bindChangeWatcher();
  }

  return {
    init,
    rememberCurrentBimestre,
    restoreLastBimestre,
    selectBimestre,
    getSavedValue,
    getSavedText
  };
})();
