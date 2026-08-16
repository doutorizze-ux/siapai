window.SIAPContext = (() => {
  const C = window.SIAPConfig;
  let watcherId = null;
  let lastContextKey = '';
  const CONTEUDO_HEADER = 'Objetivos de Conhecimentos/ Conteúdos';
  const HABILIDADES_HEADER = 'Habilidades';
  const SERIE_SELECTOR = '#cphFuncionalidade_cphCampos_txtSerie, #txtSerie, input[id$="txtSerie"]';
  const EIXO_SELECTOR = '#ddlEixo, select[id$="ddlEixo"], select[name$="$ddlEixo"]';
  const BIMESTRE_SELECTOR = '#cphFuncionalidade_cphCampos_ddlBimestre, #ddlBimestre, select[id$="ddlBimestre"], select[name$="$ddlBimestre"]';

  function safeNormalize(text) {
    const raw = String(text || '').trim();
    if (window.SIAPUtils && typeof window.SIAPUtils.normalizeCompare === 'function') {
      return window.SIAPUtils.normalizeCompare(raw);
    }
    return raw.toLowerCase();
  }

  function normalizeText(text) {
    return String(text || '')
      .replace(/\u00A0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function getSerieAnoFromTurma(turma) {
    const raw = normalizeText(turma).toUpperCase();
    const match = raw.match(/^(\d{1,2})/);
    return match ? match[1] : raw;
  }

  function readField(selector) {
    const el = document.querySelector(selector);
    if (!el) return '';
    return normalizeText(el.value || el.textContent || '');
  }

  function readSelect(selector) {
    const select = document.querySelector(selector);
    if (!select) return { value: '', text: '' };

    const option = select.selectedIndex >= 0 ? select.options[select.selectedIndex] : null;
    return {
      value: normalizeText(select.value || ''),
      text: normalizeText(option?.textContent || option?.innerText || '')
    };
  }

  function buildContextKey(context) {
    const disciplina = safeNormalize(context?.disciplina || '');
    const turma = safeNormalize(context?.turma || '');
    return `${disciplina}__${turma}`;
  }

  function isVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden';
  }

  function findTreeRoot() {
    const fixedSelector = C?.SELECTORS?.TREE;
    if (fixedSelector) {
      const exactRoot = document.querySelector(fixedSelector);
      if (exactRoot) return exactRoot;
    }

    const exactById = document.getElementById('cphFuncionalidade_cphCampos_treeView');
    if (exactById) return exactById;

    const candidates = Array.from(
      document.querySelectorAll('[id^="cphFuncionalidade_cphCampos_treeView"]')
    ).filter((el) => {
      if (!isVisible(el)) return false;
      if (el.querySelector && el.querySelector('.node-wrapper')) return true;
      return el.classList && el.classList.contains('node-wrapper');
    });

    if (!candidates.length) return null;

    candidates.sort((a, b) => {
      const countA = a.querySelectorAll ? a.querySelectorAll('.node-wrapper').length : 0;
      const countB = b.querySelectorAll ? b.querySelectorAll('.node-wrapper').length : 0;
      return countB - countA;
    });

    return candidates[0] || null;
  }

  function dedupeItems(items) {
    const seen = new Set();
    return items.filter((item) => {
      const key = `${item.tipo}::${item.categoria}::${item.texto}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function getConteudoHeaderNode(root) {
    if (!root) return null;

    return Array.from(
      root.querySelectorAll('span[id^="cphFuncionalidade_cphCampos_treeViewt"]')
    ).find((el) => safeNormalize(el.textContent || '') === safeNormalize(CONTEUDO_HEADER)) || null;
  }

  function findConteudoBranchRoot(root) {
    const header = getConteudoHeaderNode(root);
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

  function getNodeText(node) {
    return normalizeText(node?.textContent || node?.innerText || '');
  }

  function isHabilidadeAnchor(anchor) {
    if (!anchor) return false;
    const href = anchor.getAttribute('href') || '';
    return /sHabilidades\\/i.test(href);
  }

  function isConteudoAnchor(anchor) {
    if (!anchor) return false;
    const href = anchor.getAttribute('href') || '';
    return /sObjetivos de Conhecimentos\/ Conteúdos\\/i.test(href);
  }

  function extractSiapIds(anchor) {
    const href = String(anchor?.getAttribute?.('href') || '');
    return (href.match(/\d{4,}/g) || []).map(String);
  }

  function extractHabilidadeCode(texto) {
    const text = normalizeText(texto);
    const parenteses = text.match(/^\s*\(([^)]+)\)/u);
    if (parenteses) return normalizeText(parenteses[1]);

    const codigo = text.match(/\b((?:GO-)?EF[A-Z0-9-]+)\b/iu);
    return codigo ? normalizeText(codigo[1]) : '';
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

  function getAncestorGroupLabels(anchor, root) {
    const labels = [];
    let current = anchor?.closest?.('table')?.parentElement || null;

    while (current && root && root.contains(current)) {
      if (/treeViewn\d+Nodes$/i.test(String(current.id || ''))) {
        const label = getGroupLabel(current);
        const normalized = safeNormalize(label);
        if (
          label &&
          normalized !== safeNormalize(CONTEUDO_HEADER) &&
          normalized !== safeNormalize(HABILIDADES_HEADER)
        ) {
          labels.unshift(label);
        }
      }
      current = current.parentElement;
    }

    return labels;
  }

  function extractHabilidadesCatalogo(root) {
    if (!root) return [];

    const seen = new Map();
    let ordem = 0;

    for (const anchor of Array.from(root.querySelectorAll('a[href]'))) {
      if (!isHabilidadeAnchor(anchor)) continue;

      const ids = extractSiapIds(anchor);
      const siapId = ids[ids.length - 1] || '';
      const descricao = normalizeText(anchor.textContent || anchor.innerText || '');
      if (!siapId || !descricao) continue;

      seen.set(siapId, {
        siap_id: siapId,
        codigo: extractHabilidadeCode(descricao),
        descricao,
        ordem: ordem++
      });
    }

    return Array.from(seen.values());
  }

  function extractConteudosCatalogo(root) {
    if (!root) return [];

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

    for (const anchor of Array.from(root.querySelectorAll('a[href]'))) {
      if (!isConteudoAnchor(anchor)) continue;

      const ids = extractSiapIds(anchor);
      const textoFolha = normalizeText(anchor.textContent || anchor.innerText || '');
      if (!ids.length || !textoFolha) continue;

      const groupIds = ids.slice(0, -1);
      const labels = getAncestorGroupLabels(anchor, root).slice(-groupIds.length);
      const labelOffset = Math.max(0, groupIds.length - labels.length);

      labels.forEach((label, labelIndex) => {
        const idIndex = labelOffset + labelIndex;
        const siapId = groupIds[idIndex];
        if (!siapId || !label) return;

        addNode({
          siap_id: siapId,
          pai_siap_id: idIndex > 0 ? groupIds[idIndex - 1] : null,
          texto: label,
          nivel: idIndex + 1,
          selecionavel: 0,
          caminho_siap: ids.slice(0, idIndex + 1).join('\\'),
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
        ordem: ordem++
      });
    }

    return Array.from(nodesBySiapId.values()).sort((a, b) => {
      const nivel = Number(a.nivel || 0) - Number(b.nivel || 0);
      return nivel || Number(a.ordem || 0) - Number(b.ordem || 0);
    });
  }

  function extractTreeViewContext() {
    const root = findTreeRoot();

    if (!root) {
      return {
        encontrado: false,
        texto: '',
        grupos: [],
        folhas: [],
        itens: [],
        habilidadesDisponiveis: [],
        conteudosDisponiveis: [],
        habilidadesCatalogo: [],
        conteudosCatalogo: [],
        totalGrupos: 0,
        totalFolhas: 0
      };
    }

    const conteudoBranch = findConteudoBranchRoot(root);
    const wrappers = Array.from(root.querySelectorAll('.node-wrapper'));

    const rawItems = wrappers
      .map((node) => {
        const texto = getNodeText(node);
        if (!texto) return null;

        const anchor = node.closest('a');
        const containerWithId = node.closest('[id]');
        const dentroConteudo = !!(conteudoBranch && conteudoBranch.contains(node));

        let categoria = 'outro';
        if (anchor && isConteudoAnchor(anchor)) categoria = 'conteudo';
        else if (anchor && isHabilidadeAnchor(anchor)) categoria = 'habilidade';
        else if (dentroConteudo) categoria = 'grupo_conteudo';

        return {
          tipo: anchor ? 'folha' : 'grupo',
          categoria,
          texto,
          id: (anchor && anchor.id) || (containerWithId && containerWithId.id) || ''
        };
      })
      .filter(Boolean);

    const items = dedupeItems(rawItems);
    const grupos = items.filter((item) => item.tipo === 'grupo').map((item) => item.texto);
    const folhas = items.filter((item) => item.tipo === 'folha').map((item) => item.texto);

    const habilidadesDisponiveis = items
      .filter((item) => item.categoria === 'habilidade' && item.tipo === 'folha')
      .map((item) => item.texto);

    const conteudosDisponiveis = items
      .filter((item) => item.categoria === 'conteudo' && item.tipo === 'folha')
      .map((item) => item.texto);

    const gruposConteudo = items
      .filter((item) => item.categoria === 'grupo_conteudo' && item.tipo === 'grupo')
      .map((item) => item.texto);

    const habilidadesCatalogo = extractHabilidadesCatalogo(root);
    const conteudosCatalogo = extractConteudosCatalogo(root);

    const texto = [
      habilidadesDisponiveis.length ? `HABILIDADES:\n${habilidadesDisponiveis.join('\n')}` : '',
      conteudosDisponiveis.length ? `CONTEÚDOS:\n${conteudosDisponiveis.join('\n')}` : '',
      gruposConteudo.length ? `GRUPOS DE CONTEÚDO:\n${gruposConteudo.join('\n')}` : ''
    ]
      .filter(Boolean)
      .join('\n\n');

    return {
      encontrado: true,
      texto,
      grupos,
      folhas,
      itens: items,
      habilidadesDisponiveis,
      conteudosDisponiveis,
      habilidadesCatalogo,
      conteudosCatalogo,
      totalGrupos: grupos.length,
      totalFolhas: folhas.length
    };
  }

  function getCurrentContext() {
    const disciplina = readField(C.SELECTORS.DISCIPLINA);
    const turma = readField(C.SELECTORS.TURMA);
    const serie = readField(C.SELECTORS.SERIE || SERIE_SELECTOR);
    const numeroAula = readField(C.SELECTORS.LESSON_NUMBER);
    const eixoSelecionado = readSelect(C.SELECTORS.EIXO || EIXO_SELECTOR);
    const bimestreSelecionado = readSelect(C.SELECTORS.BIMESTRE || BIMESTRE_SELECTOR);
    const arvoreObjetivosConteudos = extractTreeViewContext();
    const matrizSaeb = window.SIAPMatrizSaeb?.extractMatrizSaebContext?.() || { disponivel: false, encontrado: false, texto: '', itens: [], grupos: [], folhas: [] };
    const serieAno = getSerieAnoFromTurma(turma);

    return {
      disciplina,
      turma,
      serie: serie || turma,
      serieAno,
      numeroAula,
      eixo: eixoSelecionado.text,
      eixoSiapId: eixoSelecionado.value,
      bimestre: Number.parseInt(bimestreSelecionado.value, 10) || 0,
      bimestreTexto: bimestreSelecionado.text,
      chave: buildContextKey({ disciplina, turma }),
      arvoreObjetivosConteudos,
      matrizSaeb,
      habilidadesDisponiveis: arvoreObjetivosConteudos.habilidadesDisponiveis || [],
      conteudosDisponiveis: arvoreObjetivosConteudos.conteudosDisponiveis || [],
      habilidadesCatalogo: arvoreObjetivosConteudos.habilidadesCatalogo || [],
      conteudosCatalogo: arvoreObjetivosConteudos.conteudosCatalogo || []
    };
  }

  function isValidContext(context) {
    return !!(context && context.disciplina && context.turma);
  }

  function isSameContext(a, b) {
    if (!isValidContext(a) || !isValidContext(b)) return false;
    return buildContextKey(a) === buildContextKey(b);
  }

  function getContextLabel(context) {
    if (!isValidContext(context)) return 'Disciplina/turma não identificadas';
    return `${context.disciplina} • ${context.turma}`;
  }

  function startWatcher(onChange, intervalMs = C.CONTEXT_WATCH_INTERVAL_MS || 1000) {
    if (watcherId) clearInterval(watcherId);

    const initial = getCurrentContext();
    lastContextKey = initial.chave || '';

    watcherId = window.setInterval(() => {
      const current = getCurrentContext();
      const currentKey = current.chave || '';
      if (!currentKey || currentKey === lastContextKey) return;

      const previous = {
        chave: lastContextKey
      };

      lastContextKey = currentKey;

      if (typeof onChange === 'function') {
        try {
          onChange(current, previous);
        } catch (err) {
          console.error('[SIAP Context] erro no watcher:', err);
        }
      }
    }, intervalMs);

    return watcherId;
  }

  function stopWatcher() {
    if (watcherId) clearInterval(watcherId);
    watcherId = null;
  }

  return {
    readField,
    readSelect,
    buildContextKey,
    getCurrentContext,
    isValidContext,
    isSameContext,
    getContextLabel,
    getSerieAnoFromTurma,
    getTreeViewContext: extractTreeViewContext,
    findTreeRoot,
    findConteudoBranchRoot,
    startWatcher,
    stopWatcher
  };
})();
