window.SIAPUtils = (() => {
  function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
  function normalizeText(text) {
    return (text || '').replace(/ /g, ' ').replace(/\s+/g, ' ').replace(/[“”"]/g, '"').replace(/[‘’']/g, "'").trim().toLowerCase();
  }
  function removeAccents(text) { return (text || '').normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function normalizeCompare(text) {
    return removeAccents(normalizeText(text)).replace(/[^\w\s\/()-]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function tokenize(text) { return normalizeCompare(text).split(/\s+/).filter(Boolean); }
  function escapeHtml(str) {
    return (str || '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  }
  function setTextareaValue(selector, value) {
    const el = document.querySelector(selector);
    if (!el) return false;
    el.focus();
    el.value = value || '';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.blur();
    return true;
  }
  function safeClick(el) {
    if (!el) return false;
    try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) {}

    try {
      if (typeof el.focus === 'function') el.focus();
    } catch (_) {}

    try {
      if (typeof el.click === 'function') {
        el.click();
        return true;
      }
    } catch (_) {}

    try {
      el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true, view: window }));
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      return true;
    } catch (_) {}

    return false;
  }
  function extractPostBackFromHref(href) {
    if (!href) return null;
    const m = href.match(/__doPostBack\('([^']+)','([^']+)'\)/);
    return m ? { eventTarget: m[1], eventArgument: m[2] } : null;
  }
  function runTreeNodePostback(anchorEl) {
    if (!anchorEl) return false;
    const href = anchorEl.getAttribute('href') || '';
    const pb = extractPostBackFromHref(href);
    try {
      if (typeof window.TreeView_SelectNode === 'function' && window.cphFuncionalidade_cphCampos_treeView_Data) {
        window.TreeView_SelectNode(window.cphFuncionalidade_cphCampos_treeView_Data, anchorEl, anchorEl.id);
      }
    } catch (err) { console.warn('Falha ao chamar TreeView_SelectNode:', err); }
    if (pb && typeof window.__doPostBack === 'function') {
      window.__doPostBack(pb.eventTarget, pb.eventArgument);
      return true;
    }
    return false;
  }
  function runJavascriptHref(anchorEl) {
    if (!anchorEl) return false;
    const href = String(anchorEl.getAttribute('href') || '').trim();
    if (!href || !href.toLowerCase().startsWith('javascript:')) return false;
    const code = href.replace(/^javascript\s*:/i, '');
    if (!code) return false;
    try {
      window.eval(code);
      return true;
    } catch (err) {
      console.warn('Falha ao executar href javascript:', err);
      return false;
    }
  }
  function runInPage(code) {
    try {
      const s = document.createElement('script');
      s.textContent = String(code || '');
      (document.head || document.documentElement).appendChild(s);
      s.remove();
      return true;
    } catch (err) {
      console.warn('Falha ao executar script in-page:', err);
      return false;
    }
  }
  function runJavascriptHrefInPage(anchorEl) {
    if (!anchorEl) return false;
    const href = String(anchorEl.getAttribute('href') || '').trim();
    if (!href || !href.toLowerCase().startsWith('javascript:')) return false;
    const code = href.replace(/^javascript\s*:/i, '');
    if (!code) return false;
    return runInPage(code);
  }
  function runTreeNodePostbackInPage(anchorEl) {
    if (!anchorEl) return false;
    const href = anchorEl.getAttribute('href') || '';
    const pb = extractPostBackFromHref(href);
    const anchorId = String(anchorEl.id || '');
    if (!pb) return false;
    const code = `(function(){try{var anchorId=${JSON.stringify('__ANCHOR_ID__')};var anchor=anchorId?document.getElementById(anchorId):null;try{if(anchor && typeof window.TreeView_SelectNode==='function' && window.cphFuncionalidade_cphCampos_treeView_Data){window.TreeView_SelectNode(window.cphFuncionalidade_cphCampos_treeView_Data, anchor, anchorId);}}catch(e){}if(typeof window.__doPostBack==='function'){window.__doPostBack(${JSON.stringify('__EVENT_TARGET__')}, ${JSON.stringify('__EVENT_ARGUMENT__')});return;}var form=document.forms['FormularioPrincipal']||document.getElementById('FormularioPrincipal')||document.forms[0];if(!form)return;var evTarget=form.querySelector('#__EVENTTARGET');var evArgument=form.querySelector('#__EVENTARGUMENT');if(evTarget)evTarget.value=${JSON.stringify('__EVENT_TARGET__')};if(evArgument)evArgument.value=${JSON.stringify('__EVENT_ARGUMENT__')};form.submit();}catch(err){console.error('SIAP postback in-page falhou:', err);}})();`;
    return runInPage(code
      .replaceAll(JSON.stringify('__ANCHOR_ID__'), JSON.stringify(anchorId))
      .replaceAll(JSON.stringify('__EVENT_TARGET__'), JSON.stringify(pb.eventTarget))
      .replaceAll(JSON.stringify('__EVENT_ARGUMENT__'), JSON.stringify(pb.eventArgument))
    );
  }
  function firePostBackInPage(eventTarget, eventArgument) {
    if (!eventTarget) return false;
    const code = `(function(){try{if(typeof window.__doPostBack==='function'){window.__doPostBack(${JSON.stringify('__EVENT_TARGET__')}, ${JSON.stringify('__EVENT_ARGUMENT__')});return;}var form=document.forms['FormularioPrincipal']||document.getElementById('FormularioPrincipal')||document.forms[0];if(!form)return;var evTarget=form.querySelector('#__EVENTTARGET');var evArgument=form.querySelector('#__EVENTARGUMENT');if(evTarget)evTarget.value=${JSON.stringify('__EVENT_TARGET__')};if(evArgument)evArgument.value=${JSON.stringify('__EVENT_ARGUMENT__')};form.submit();}catch(err){console.error('SIAP firePostBackInPage falhou:', err);}})();`;
    return runInPage(code
      .replaceAll(JSON.stringify('__EVENT_TARGET__'), JSON.stringify(String(eventTarget || '')))
      .replaceAll(JSON.stringify('__EVENT_ARGUMENT__'), JSON.stringify(String(eventArgument || '')))
    );
  }
  function getPageRequestManager() {
    try {
      return window.Sys?.WebForms?.PageRequestManager?.getInstance?.() || null;
    } catch (_) {
      return null;
    }
  }
  async function waitForAsyncPostBack(timeout = 3500, startWindow = 700) {
    const prm = getPageRequestManager();
    if (!prm || typeof prm.get_isInAsyncPostBack !== 'function') {
      return false;
    }

    const start = Date.now();
    let sawAsync = false;

    while (Date.now() - start < startWindow) {
      try {
        if (prm.get_isInAsyncPostBack()) {
          sawAsync = true;
          break;
        }
      } catch (_) {}
      await sleep(60);
    }

    if (!sawAsync) return false;

    while (Date.now() - start < timeout) {
      let inAsync = false;
      try {
        inAsync = !!prm.get_isInAsyncPostBack();
      } catch (_) {}

      if (!inAsync) return true;
      await sleep(90);
    }

    return true;
  }
  async function waitUntil(checkFn, timeout = window.SIAPConfig.WAIT_TIMEOUT_MS, interval = 400) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      try { if (checkFn()) return true; } catch (_) {}
      await sleep(interval);
    }
    return false;
  }
  return { sleep, normalizeText, removeAccents, normalizeCompare, tokenize, escapeHtml, setTextareaValue, safeClick, extractPostBackFromHref, runTreeNodePostback, runJavascriptHref, runInPage, runJavascriptHrefInPage, runTreeNodePostbackInPage, firePostBackInPage, getPageRequestManager, waitForAsyncPostBack, waitUntil };
})();
