window.SIAPMatrizSaeb = (() => {
  const U = window.SIAPUtils;
  const M = window.SIAPMatcher;
  const L = window.SIAPLogger;

  const HEADER = 'Matriz SAEB';
  const ROOT_SELECTOR = '#cphFuncionalidade_cphCampos_treeView';
  const BOX_SELECTORS = [
    '#conteudomatrizsaebs',
    '#cphFuncionalidade_cphCampos_upGrdConteudoMatrizSaebs',
    '[id*="ConteudoMatrizSaeb"]',
    '[id*="conteudomatrizsaeb"]'
  ];

  function normalize(text) {
    if (U && typeof U.normalizeCompare === 'function') return U.normalizeCompare(text || '');
    return String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
  }

  function normalizeText(text) {
    if (U && typeof U.normalizeText === 'function') return U.normalizeText(text || '');
    return String(text || '').replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function isVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden';
  }

  function getTreeRoot() {
    return document.querySelector(ROOT_SELECTOR) || document.querySelector('[id^="cphFuncionalidade_cphCampos_treeView"]');
  }

  function getHeaderNode(root = getTreeRoot()) {
    if (!root) return null;
    return Array.from(root.querySelectorAll('span[id^="cphFuncionalidade_cphCampos_treeViewt"]'))
      .find((el) => normalize(el.textContent || el.innerText || '') === normalize(HEADER)) || null;
  }

  function isAvailable() {
    const header = getHeaderNode();
    if (header) return true;
    const box = document.querySelector('#conteudomatrizsaebs');
    return !!(box && isVisible(box));
  }

  function findBranchRoot(root = getTreeRoot()) {
    const header = getHeaderNode(root);
    if (!header) return null;
    const table = header.closest('table');
    if (!table) return null;

    let next = table.nextElementSibling;
    while (next) {
      if (next.id && /treeViewn\d+Nodes$/i.test(next.id)) return next;
      next = next.nextElementSibling;
    }
    return null;
  }

  function isMatrizAnchor(anchor) {
    if (!anchor) return false;
    const href = anchor.getAttribute('href') || '';
    return /sMatriz SAEB\\/i.test(href) || /sMatriz\s+SAEB/i.test(href);
  }

  function extractSiapIds(anchor) {
    const href = String(anchor?.getAttribute?.('href') || '');
    return (href.match(/\d{4,}/g) || []).map(String);
  }

  function getGroupLabel(nodesContainer) {
    if (!nodesContainer || !nodesContainer.previousElementSibling) return '';

    const headerTable = nodesContainer.previousElementSibling;
    const label = headerTable.querySelector(
      'span[id^="cphFuncionalidade_cphCampos_treeViewt"] .node-wrapper, ' +
      'span[id^="cphFuncionalidade_cphCampos_treeViewt"]'
    );

    return normalizeText(label?.textContent || label?.innerText || '');
  }

  function getAncestorGroupLabels(anchor, branchRoot) {
    const labels = [];
    let current = anchor?.closest?.('table')?.parentElement || null;

    while (current && branchRoot && branchRoot.contains(current)) {
      if (/treeViewn\d+Nodes$/i.test(String(current.id || ''))) {
        const label = getGroupLabel(current);
        if (label && normalize(label) !== normalize(HEADER)) labels.unshift(label);
      }
      current = current.parentElement;
    }

    return labels;
  }

  function extractMatrizSaebCatalogo(branchRoot = findBranchRoot()) {
    if (!branchRoot) return [];

    const nodesBySiapId = new Map();
    let ordem = 0;

    function addNode(node) {
      const key = String(node?.siap_id || '');
      if (!key || !node?.texto) return;

      const existing = nodesBySiapId.get(key);
      if (!existing) {
        nodesBySiapId.set(key, node);
        return;
      }

      if (!existing.selecionavel && node.selecionavel) {
        nodesBySiapId.set(key, { ...existing, ...node, ordem: existing.ordem });
      }
    }

    const anchors = Array.from(branchRoot.querySelectorAll('a[href]')).filter(isMatrizAnchor);
    for (const anchor of anchors) {
      const ids = extractSiapIds(anchor);
      const textoFolha = getTextFromNode(anchor);
      if (!ids.length || !textoFolha) continue;

      const groupIds = ids.slice(0, -1);
      const labels = getAncestorGroupLabels(anchor, branchRoot).slice(-groupIds.length);
      const labelOffset = Math.max(0, groupIds.length - labels.length);

      labels.forEach((label, labelIndex) => {
        const idIndex = labelOffset + labelIndex;
        const siapId = groupIds[idIndex];
        if (!siapId || !label) return;

        const textoPath = labels.slice(0, labelIndex + 1);
        addNode({
          siap_id: siapId,
          pai_siap_id: idIndex > 0 ? groupIds[idIndex - 1] : null,
          texto: label,
          nivel: idIndex + 1,
          selecionavel: 0,
          caminho_siap: ids.slice(0, idIndex + 1).join('\\'),
          caminho_texto: [HEADER, ...textoPath].join(' > '),
          ordem: ordem++
        });
      });

      const leafIndex = ids.length - 1;
      addNode({
        siap_id: ids[leafIndex],
        pai_siap_id: leafIndex > 0 ? ids[leafIndex - 1] : null,
        texto: textoFolha,
        nivel: leafIndex + 1,
        selecionavel: 1,
        caminho_siap: ids.join('\\'),
        caminho_texto: [HEADER, ...labels, textoFolha].join(' > '),
        ordem: ordem++
      });
    }

    return Array.from(nodesBySiapId.values()).sort((a, b) => {
      const nivel = Number(a.nivel || 0) - Number(b.nivel || 0);
      return nivel || Number(a.ordem || 0) - Number(b.ordem || 0);
    });
  }

  function getTextFromNode(el) {
    if (!el) return '';
    const wrapper = el.querySelector?.('.node-wrapper');
    return normalizeText(wrapper ? (wrapper.innerText || wrapper.textContent || '') : (el.innerText || el.textContent || ''));
  }

  async function expandAllNodes(scopeRoot = null) {
    const base = scopeRoot || findBranchRoot() || getTreeRoot() || document;
    let expandCount = 0;

    for (let i = 0; i < 12; i++) {
      const expandLinks = Array.from(base.querySelectorAll('a[id^="cphFuncionalidade_cphCampos_treeViewn"]'))
        .filter((a) => {
          const img = a.querySelector('img');
          const alt = normalizeText(img?.alt || '').toLowerCase();
          return alt.startsWith('expand');
        });

      if (!expandLinks.length) break;

      for (const link of expandLinks) {
        try { U.safeClick(link); } catch (_) { link.click(); }
        expandCount++;
        await U.sleep(180);
      }
      await U.sleep(250);
    }

    if (L) L.log(`[Matriz SAEB] Expansão concluída. ${expandCount} nó(s) expandidos.`);
    return expandCount;
  }

  async function getAllMatrizLinks() {
    await U.waitForAsyncPostBack(3000, 700);
    await U.sleep(150);

    const branchRoot = findBranchRoot();
    if (!branchRoot) {
      if (L) L.log('[Matriz SAEB] Ramo "Matriz SAEB" não encontrado.');
      return [];
    }

    await expandAllNodes(branchRoot);

    const links = Array.from(branchRoot.querySelectorAll('a[id^="cphFuncionalidade_cphCampos_treeViewt"]'))
      .filter((a) => isMatrizAnchor(a) && getTextFromNode(a));

    if (L) L.log(`[Matriz SAEB] Total de links encontrados: ${links.length}`);
    return links;
  }

  function extractMatrizSaebContext() {
    const root = getTreeRoot();
    const branchRoot = findBranchRoot(root);
    const disponivel = !!(getHeaderNode(root) || document.querySelector('#conteudomatrizsaebs'));

    if (!disponivel) {
      return { disponivel: false, encontrado: false, texto: '', itens: [], grupos: [], folhas: [], catalogo: [] };
    }

    const base = branchRoot || root;
    const nodes = Array.from(base.querySelectorAll('.node-wrapper, a[id^="cphFuncionalidade_cphCampos_treeViewt"], span[id^="cphFuncionalidade_cphCampos_treeViewt"]'));
    const seen = new Set();
    const itens = [];

    for (const node of nodes) {
      const anchor = node.closest?.('a');
      const texto = getTextFromNode(anchor || node);
      if (!texto || normalize(texto) === normalize(HEADER)) continue;

      const tipo = anchor && isMatrizAnchor(anchor) ? 'folha' : 'grupo';
      const key = `${tipo}::${normalize(texto)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      itens.push({ tipo, texto, id: anchor?.id || node.id || '' });
    }

    const grupos = itens.filter((i) => i.tipo === 'grupo').map((i) => i.texto);
    const folhas = itens.filter((i) => i.tipo === 'folha').map((i) => i.texto);
    const catalogo = extractMatrizSaebCatalogo(branchRoot);

    return {
      disponivel: true,
      encontrado: true,
      texto: folhas.length ? folhas.join('\n') : grupos.join('\n'),
      itens,
      grupos,
      folhas,
      catalogo
    };
  }

  function getSelectedContainers() {
    return BOX_SELECTORS.map((selector) => document.querySelector(selector)).filter(Boolean)
      .filter((el, idx, arr) => arr.indexOf(el) === idx);
  }

  function getSelectedTexts() {
    const out = [];
    for (const container of getSelectedContainers()) {
      const nodes = container.querySelectorAll('li, tr, td, span, div');
      for (const node of nodes) {
        const raw = normalizeText(node.innerText || node.textContent || '');
        if (!raw || normalize(raw) === normalize(HEADER) || raw.length < 4) continue;
        out.push(raw);
      }
    }
    return [...new Set(out)];
  }

  function isSelected(texto, threshold = 92) {
    const target = normalize(texto);
    if (!target) return false;
    const selected = getSelectedTexts();
    if (selected.some((item) => normalize(item) === target)) return true;

    if (M && typeof M.bestTextMatchAdvanced === 'function') {
      const best = M.bestTextMatchAdvanced(texto, selected, (item) => item);
      return !!(best && best.score >= threshold);
    }
    return selected.some((item) => normalize(item).includes(target) || target.includes(normalize(item)));
  }

  function fireDirectPostBack(anchorEl) {
    if (!anchorEl) return false;
    const href = anchorEl.getAttribute('href') || '';
    const pb = U.extractPostBackFromHref?.(href);
    if (!pb) return false;
    return !!U.firePostBackInPage?.(pb.eventTarget, pb.eventArgument);
  }

  async function waitAdded(texto, timeout = 4500) {
    return U.waitUntil(() => isSelected(texto, 92), timeout, 150);
  }

  async function tryAddUsingLink(linkEl, chosenLabel) {
    try {
      U.safeClick(linkEl);
      if (await waitAdded(chosenLabel, 5000)) return true;
    } catch (err) {
      if (L) L.log(`[Matriz SAEB] Clique nativo falhou: ${err.message || err}`);
    }

    try {
      if (U.runJavascriptHrefInPage?.(linkEl) && await waitAdded(chosenLabel, 7000)) return true;
    } catch (err) {
      if (L) L.log(`[Matriz SAEB] href javascript falhou: ${err.message || err}`);
    }

    try {
      if (U.runTreeNodePostbackInPage?.(linkEl) && await waitAdded(chosenLabel, 8000)) return true;
    } catch (err) {
      if (L) L.log(`[Matriz SAEB] TreeView_SelectNode falhou: ${err.message || err}`);
    }

    try {
      if (fireDirectPostBack(linkEl) && await waitAdded(chosenLabel, 8000)) return true;
    } catch (err) {
      if (L) L.log(`[Matriz SAEB] __doPostBack direto falhou: ${err.message || err}`);
    }

    return false;
  }

  async function addMatrizSaebByText(texto, tentativa = 1) {
    if (!isAvailable()) return true;
    await U.waitForAsyncPostBack(3000, 700);
    await U.sleep(180);

    const textoOriginal = normalizeText(texto);
    if (!textoOriginal) return false;
    if (isSelected(textoOriginal, 92)) {
      if (L) L.log(`[Matriz SAEB] Já adicionada: ${textoOriginal}`);
      return true;
    }

    if (L) L.log(`[Matriz SAEB] Tentativa ${tentativa} - Buscando: "${textoOriginal}"`);
    const links = await getAllMatrizLinks();
    if (!links.length) return false;

    const exact = links.find((link) => normalize(getTextFromNode(link)) === normalize(textoOriginal));
    const bestMatch = exact ? null : M.bestTextMatchAdvanced(textoOriginal, links, getTextFromNode);
    const best = exact || bestMatch?.el || null;

    if (!best) {
      if (L) L.log(`[Matriz SAEB] Nenhuma correspondência para: "${textoOriginal}"`);
      return false;
    }

    const chosenLabel = getTextFromNode(best);
    if (L) L.log(`[Matriz SAEB] Selecionada: "${chosenLabel}"`);

    try { best.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) {}
    await U.sleep(180);

    const added = await tryAddUsingLink(best, chosenLabel);
    if (added) return true;

    if (tentativa < 2) {
      await U.sleep(350);
      return addMatrizSaebByText(textoOriginal, tentativa + 1);
    }

    if (L) L.log(`[Matriz SAEB] Falha total para: "${textoOriginal}".`);
    return false;
  }

  return {
    isAvailable,
    extractMatrizSaebContext,
    extractMatrizSaebCatalogo,
    getAllMatrizLinks,
    getTextFromNode,
    addMatrizSaebByText,
    getSelectedTexts,
    isSelected,
    expandAllNodes,
    findBranchRoot
  };
})();
