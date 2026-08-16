window.SIAPConteudos = (() => {
  const C = window.SIAPConfig;
  const U = window.SIAPUtils;
  const M = window.SIAPMatcher;
  const L = window.SIAPLogger;

  const CONTEUDO_HEADER = 'Objetivos de Conhecimentos/ Conteúdos';

  const CONTAINER_CACHE_TTL_MS = 1200;
  const SELECTED_BOX_SELECTOR = '#cphFuncionalidade_cphCampos_upLstConteudos';
  const SELECTED_ITEM_SELECTOR = `${SELECTED_BOX_SELECTOR} [id^="cphFuncionalidade_cphCampos_lstConteudos_divConteudo_"]`;
  const SELECTED_REMOVE_SELECTOR = `${SELECTED_BOX_SELECTOR} input[id^="cphFuncionalidade_cphCampos_lstConteudos_btnRemover_"]`;
  const SELECTED_TEXTAREA_SELECTOR = `${SELECTED_BOX_SELECTOR} textarea[id^="cphFuncionalidade_cphCampos_lstConteudos_txtDescricaoConteudo_"]`;
  const FULL_POSTBACK_RETRY_KEY = 'tm_gpt_content_fullpostback_retry_v2';

  let conteudoContainerCache = { at: 0, containers: [] };
  let ultimoLogContainers = { count: null, at: 0 };


  function normalize(text) {
    return U.normalizeCompare(text || '');
  }

  function isConteudoHeaderText(texto) {
    return normalize(texto) === normalize(CONTEUDO_HEADER);
  }

  function isConteudoLeafAnchor(anchor) {
    if (!anchor) return false;
    const href = anchor.getAttribute('href') || '';
    return href.includes('sObjetivos de Conhecimentos/ Conteúdos\\');
  }

  function isHabilidadeLike(texto) {
    return /^\((ef|go-ef)/i.test(String(texto || '').trim());
  }

  function isConteudoText(texto) {
    const raw = String(texto || '').trim();
    const norm = normalize(raw);
    if (!norm) return false;
    if (isConteudoHeaderText(raw)) return false;
    if (isHabilidadeLike(raw)) return false;
    return true;
  }

  function findTreeRoot() {
    return (
      document.querySelector(C.SELECTORS.CONTEUDO_ROOT) ||
      document.querySelector(C.SELECTORS.TREE) ||
      document.querySelector('#cphFuncionalidade_cphCampos_treeView')
    );
  }

  function findConteudoBranchRoot() {
    const root = findTreeRoot();
    if (!root) return null;

    const header = Array.from(
      root.querySelectorAll('span[id^="cphFuncionalidade_cphCampos_treeViewt"]')
    ).find((el) => isConteudoHeaderText(el.textContent || el.innerText || ''));

    if (!header) return null;

    const table = header.closest('table');
    if (!table) return null;

    let next = table.nextElementSibling;
    while (next) {
      if (next.id && /treeViewn\d+Nodes$/i.test(next.id)) {
        return next;
      }
      next = next.nextElementSibling;
    }

    return null;
  }

  async function expandAllNodes(scopeRoot = null) {
    const base = scopeRoot || findTreeRoot() || document;
    L.log('[Conteúdos] Expandindo nós do ramo de conteúdos...');

    let expandCount = 0;
    for (let i = 0; i < 12; i++) {
      const expandLinks = Array.from(
        base.querySelectorAll('a[id^="cphFuncionalidade_cphCampos_treeViewn"]')
      ).filter((a) => {
        const img = a.querySelector('img');
        const alt = U.normalizeText(img?.alt || '');
        return alt.startsWith('expand');
      });

      if (!expandLinks.length) break;

      let clickedThisRound = 0;
      for (const link of expandLinks) {
        U.safeClick(link);
        expandCount++;
        clickedThisRound++;
        await U.sleep(250);
      }

      if (!clickedThisRound) break;
      await U.sleep(500);
    }

    L.log(`[Conteúdos] Expansão concluída. ${expandCount} nó(s) expandidos.`);
    return expandCount;
  }

  function getConteudoTextFromLink(el) {
    if (!el) return '';

    const wrapper = el.querySelector('.node-wrapper');
    const raw = wrapper
      ? (wrapper.innerText || wrapper.textContent || '')
      : (el.innerText || el.textContent || '');

    return String(raw || '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
  }

  function getExactContentLink(texto, links) {
    const target = normalize(texto);
    return links.find((link) => normalize(getConteudoTextFromLink(link)) === target) || null;
  }

  async function getAllContentLinks() {
    const branchRoot = findConteudoBranchRoot();

    if (!branchRoot) {
      L.log('[Conteúdos] Ramo "Objetivos de Conhecimentos/ Conteúdos" não encontrado.');
      return [];
    }

    await expandAllNodes(branchRoot);

    const links = Array.from(
      branchRoot.querySelectorAll('a[id^="cphFuncionalidade_cphCampos_treeViewt"]')
    ).filter((a) => isConteudoLeafAnchor(a) && isConteudoText(getConteudoTextFromLink(a)));

    L.log(`[Conteúdos] Total de links de conteúdo encontrados: ${links.length}`);
    return links;
  }

  function invalidateConteudoContainerCache() {
    conteudoContainerCache = { at: 0, containers: [] };
  }

  function getSelectedConteudoBox() {
    return document.querySelector(SELECTED_BOX_SELECTOR);
  }

  function getSelectedConteudoItems() {
    return Array.from(document.querySelectorAll(SELECTED_ITEM_SELECTOR))
      .filter((el) => el && el.isConnected);
  }

  function getSelectedConteudoCount() {
    const box = getSelectedConteudoBox();
    if (!box) return 0;

    const itemCount = getSelectedConteudoItems().length;
    const removeCount = box.querySelectorAll('input[id^="cphFuncionalidade_cphCampos_lstConteudos_btnRemover_"]').length;
    const textareaCount = box.querySelectorAll('textarea[id^="cphFuncionalidade_cphCampos_lstConteudos_txtDescricaoConteudo_"]').length;

    return Math.max(itemCount, removeCount, textareaCount);
  }

  function getSelectedConteudoTexts() {
    const texts = [];

    for (const item of getSelectedConteudoItems()) {
      const label = item.querySelector(
        '.cabecalhoConteudo span[title], .cabecalhoConteudo span, span[title]'
      );

      const raw = String(
        label?.getAttribute?.('title') ||
        label?.textContent ||
        ''
      ).replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();

      if (raw && isConteudoText(raw)) texts.push(raw);
    }

    return Array.from(new Set(texts));
  }

  function getConteudosContainers(force = false) {
    const now = Date.now();
    const cached = conteudoContainerCache.containers || [];

    if (
      !force &&
      cached.length &&
      (now - conteudoContainerCache.at) < CONTAINER_CACHE_TTL_MS &&
      cached.every((el) => el && el.isConnected)
    ) {
      return cached;
    }

    // A caixa real dos conteúdos selecionados é específica. Não usamos mais
    // [id*="Conteudos"] porque isso também capturava a árvore-fonte e fazia
    // a confirmação do clique consultar containers que não são itens salvos.
    const containers = [];
    const selectedBox = getSelectedConteudoBox();
    if (selectedBox) containers.push(selectedBox);

    const explicitFallbacks = [
      '#cphFuncionalidade_cphCampos_pnlConteudosSelecionados',
      '#cphFuncionalidade_cphCampos_pnlConteudos'
    ];
    for (const selector of explicitFallbacks) {
      const el = document.querySelector(selector);
      if (el && !containers.includes(el)) containers.push(el);
    }

    conteudoContainerCache = { at: now, containers };

    if (ultimoLogContainers.count !== containers.length || (now - ultimoLogContainers.at) > 10000) {
      if (containers.length) {
        L.log(`[Conteúdos] ${containers.length} caixa(s) de conteúdo selecionado identificada(s). Itens atuais: ${getSelectedConteudoCount()}.`);
      } else {
        L.log('[Conteúdos] Caixa de conteúdos selecionados ainda não existe nesta aula.');
      }
      ultimoLogContainers = { count: containers.length, at: now };
    }

    return containers;
  }

  function conteudoPresenteComSimilaridade(texto, threshold = 85) {
    const target = normalize(texto);
    if (!target) return false;

    // Primeiro verifica somente os registros efetivamente selecionados no SIAP.
    const selectedTexts = getSelectedConteudoTexts();
    for (const selectedText of selectedTexts) {
      const selectedNorm = normalize(selectedText);
      if (!selectedNorm) continue;
      if (selectedNorm === target || selectedNorm.includes(target) || target.includes(selectedNorm)) {
        return true;
      }

      const score = M.similarityScoreAdvanced(texto, selectedText);
      if (score >= threshold) return true;
    }

    // Fallback restrito à caixa de selecionados. Nunca usa a árvore de origem.
    const box = getSelectedConteudoBox();
    if (box && getSelectedConteudoCount() > 0) {
      const boxText = normalize(box.textContent || '');
      if (boxText && boxText.includes(target)) return true;
    }

    return false;
  }

  function conteudoJaAdicionado(texto) {
    return conteudoPresenteComSimilaridade(texto, 85);
  }

  async function waitForConteudoAdded(textos, timeout = 3500, beforeCount = null) {
    const candidatos = (Array.isArray(textos) ? textos : [textos]).filter(Boolean);
    const initialCount = beforeCount === null ? getSelectedConteudoCount() : Number(beforeCount || 0);

    return U.waitUntil(() => {
      invalidateConteudoContainerCache();
      if (candidatos.some((txt) => conteudoPresenteComSimilaridade(txt, 85))) return true;
      return getSelectedConteudoCount() > initialCount;
    }, timeout, 120);
  }

  function prepareTreeSelection(anchorEl) {
    if (!anchorEl) return false;
    try {
      if (typeof window.TreeView_SelectNode === 'function' && window.cphFuncionalidade_cphCampos_treeView_Data) {
        window.TreeView_SelectNode(
          window.cphFuncionalidade_cphCampos_treeView_Data,
          anchorEl,
          anchorEl.id
        );
        return true;
      }
    } catch (err) {
      L.log(`[Conteúdos] TreeView_SelectNode não pôde ser preparado: ${err?.message || err}`);
    }
    return false;
  }

  async function waitPostbackAndCheck(chosenLabel, beforeCount, timeout = 3200) {
    // O postback costuma começar imediatamente. Esperamos apenas a janela real
    // do ASP.NET e confirmamos pelo número/texto de itens selecionados.
    const sawAsync = await U.waitForAsyncPostBack(Math.max(2500, timeout), 900);
    if (sawAsync) await U.sleep(120);

    invalidateConteudoContainerCache();
    if (
      conteudoJaAdicionado(chosenLabel) ||
      getSelectedConteudoCount() > Number(beforeCount || 0)
    ) {
      return true;
    }

    return waitForConteudoAdded([chosenLabel], Math.min(2200, timeout), beforeCount);
  }

  function getFullPostbackRetrySignature(chosenLabel) {
    const current = window.SIAPContext?.getCurrentContext?.() || {};
    return [
      String(current.numeroAula || ''),
      String(current.eixo || ''),
      String(current.bimestre || ''),
      normalize(chosenLabel)
    ].join('|');
  }

  function getStoredFullPostbackSignature() {
    try {
      return sessionStorage.getItem(FULL_POSTBACK_RETRY_KEY) || '';
    } catch (_) {
      return '';
    }
  }

  function setStoredFullPostbackSignature(value) {
    try {
      if (value) sessionStorage.setItem(FULL_POSTBACK_RETRY_KEY, value);
      else sessionStorage.removeItem(FULL_POSTBACK_RETRY_KEY);
    } catch (_) {}
  }

  function forceFullFormPostBack(anchorEl, chosenLabel) {
    if (!anchorEl) return false;

    const href = String(anchorEl.getAttribute('href') || '');
    const pb = U.extractPostBackFromHref(href);
    if (!pb) return false;

    const signature = getFullPostbackRetrySignature(chosenLabel);
    if (getStoredFullPostbackSignature() === signature) {
      L.log('[Conteúdos] Reenvio completo já foi tentado para este conteúdo nesta aula; não repetindo.');
      return false;
    }

    const form =
      document.forms['FormularioPrincipal'] ||
      document.getElementById('FormularioPrincipal') ||
      document.forms[0];

    if (!form) return false;

    let eventTarget = pb.eventTarget;
    let eventArgument = pb.eventArgument;

    // extractPostBackFromHref lê a representação JavaScript do atributo. Para
    // submissão manual precisamos transformar \\ em \ e decodificar %xx.
    eventTarget = String(eventTarget || '').replace(/\\\\/g, '\\');
    eventArgument = String(eventArgument || '').replace(/\\\\/g, '\\');
    try { eventTarget = decodeURIComponent(eventTarget); } catch (_) {}
    try { eventArgument = decodeURIComponent(eventArgument); } catch (_) {}

    let evTarget = form.querySelector('input[name="__EVENTTARGET"], #__EVENTTARGET');
    let evArgument = form.querySelector('input[name="__EVENTARGUMENT"], #__EVENTARGUMENT');

    if (!evTarget) {
      evTarget = document.createElement('input');
      evTarget.type = 'hidden';
      evTarget.name = '__EVENTTARGET';
      evTarget.id = '__EVENTTARGET';
      form.appendChild(evTarget);
    }
    if (!evArgument) {
      evArgument = document.createElement('input');
      evArgument.type = 'hidden';
      evArgument.name = '__EVENTARGUMENT';
      evArgument.id = '__EVENTARGUMENT';
      form.appendChild(evArgument);
    }

    prepareTreeSelection(anchorEl);
    evTarget.value = eventTarget;
    evArgument.value = eventArgument;
    setStoredFullPostbackSignature(signature);

    L.log(`[Conteúdos] Fallback final: recarregando a própria aula por POST completo para adicionar "${chosenLabel}".`);
    HTMLFormElement.prototype.submit.call(form);
    return true;
  }

  async function tryAddUsingLink(linkEl, chosenLabel) {
    let beforeCount = getSelectedConteudoCount();
    const href = linkEl?.getAttribute('href') || '';
    const pb = U.extractPostBackFromHref(href);

    try {
      L.log(`[Conteúdos] Clique normal no SIAP... ${pb ? pb.eventArgument : href}`);
      U.safeClick(linkEl);
      const added = await waitPostbackAndCheck(chosenLabel, beforeCount, 3200);
      if (added) {
        setStoredFullPostbackSignature('');
        L.log(`[Conteúdos] Confirmado após clique. Total selecionado: ${getSelectedConteudoCount()}.`);
        return true;
      }
    } catch (err) {
      L.log(`[Conteúdos] Clique normal falhou: ${err?.message || err}`);
    }

    // Uma única segunda estratégia: seleciona o nó explicitamente e executa
    // o próprio href JavaScript do SIAP, preservando exatamente o argumento.
    try {
      const currentLink = document.getElementById(linkEl?.id || '') || linkEl;
      beforeCount = getSelectedConteudoCount();
      L.log('[Conteúdos] Segunda tentativa: TreeView_SelectNode + href original do SIAP...');
      prepareTreeSelection(currentLink);
      const ok = U.runJavascriptHref(currentLink);
      if (ok) {
        const added = await waitPostbackAndCheck(chosenLabel, beforeCount, 3600);
        if (added) {
          setStoredFullPostbackSignature('');
          L.log(`[Conteúdos] Confirmado na segunda tentativa. Total selecionado: ${getSelectedConteudoCount()}.`);
          return true;
        }
      }
    } catch (err) {
      L.log(`[Conteúdos] Segunda tentativa falhou: ${err?.message || err}`);
    }

    // Se o UpdatePanel ignorar a inclusão, fazemos uma única submissão completa.
    // O executor mantém o lote/índice em storage e retoma a mesma aula ao recarregar.
    const currentLink = document.getElementById(linkEl?.id || '') || linkEl;
    if (forceFullFormPostBack(currentLink, chosenLabel)) {
      await U.sleep(1500);
      return true;
    }

    const selectedTexts = getSelectedConteudoTexts();
    L.log(
      `[Conteúdos] Não confirmado. Itens selecionados=${getSelectedConteudoCount()} | ` +
      `textos=${selectedTexts.join(' | ') || '[nenhum]'}`
    );
    return false;
  }

  async function addConteudoByText(texto, tentativa = 1) {
    if (!texto) {
      L.log('[Conteúdos] Texto vazio, ignorando.');
      return false;
    }

    const textoOriginal = String(texto).trim();

    // Verifica somente a caixa real de conteúdos selecionados.
    if (conteudoJaAdicionado(textoOriginal)) {
      setStoredFullPostbackSignature('');
      L.log(`[Conteúdos] Já adicionado no SIAP: ${textoOriginal}`);
      return true;
    }

    L.log(`[Conteúdos] Tentativa ${tentativa} - Buscando: "${textoOriginal}"`);

    const links = await getAllContentLinks();
    if (!links.length) {
      L.log('[Conteúdos] Nenhum link de conteúdo encontrado no ramo correto.');
      return false;
    }

    const exact = getExactContentLink(textoOriginal, links);
    const bestMatch = exact ? null : M.bestTextMatchAdvanced(textoOriginal, links, getConteudoTextFromLink);
    const best = exact || bestMatch?.el || null;

    if (!best) {
      const samples = links.slice(0, 8).map((l) => getConteudoTextFromLink(l));
      L.log(`[Conteúdos] Nenhuma correspondência encontrada para: "${textoOriginal}"`);
      L.log(`[Conteúdos] Exemplos disponíveis: ${samples.join(' | ')}`);
      return false;
    }

    const chosenLabel = getConteudoTextFromLink(best);
    const score = exact ? 1000 : (bestMatch?.score || 0);
    L.log(`[Conteúdos] Selecionado: "${chosenLabel}" (score: ${Math.round(score)})`);

    try {
      best.scrollIntoView({ behavior: 'auto', block: 'center' });
    } catch (_) {}
    await U.sleep(120);

    const added = await tryAddUsingLink(best, chosenLabel);
    if (added) {
      L.log(`[Conteúdos] Sucesso: "${chosenLabel}" adicionado.`);
      return true;
    }

    if (tentativa < 2) {
      L.log(`[Conteúdos] Ainda não confirmado; fazendo última tentativa curta (${tentativa + 1}/2)...`);
      await U.sleep(500);
      return addConteudoByText(textoOriginal, tentativa + 1);
    }

    L.log(`[Conteúdos] Falha total para: "${textoOriginal}" após ${tentativa} tentativa(s).`);
    return false;
  }

  return {
    getAllContentLinks,
    getConteudoTextFromLink,
    conteudoJaAdicionado,
    waitForConteudoAdded,
    addConteudoByText,
    expandAllNodes,
    findConteudoBranchRoot,
    getConteudosContainers,
    getSelectedConteudoItems,
    getSelectedConteudoTexts,
    getSelectedConteudoCount,
    invalidateConteudoContainerCache,
    conteudoPresenteComSimilaridade
  };
})();