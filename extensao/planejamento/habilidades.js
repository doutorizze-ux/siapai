window.SIAPHabilidades = (() => {
  const C = window.SIAPConfig;
  const U = window.SIAPUtils;
  const M = window.SIAPMatcher;
  const L = window.SIAPLogger;
  const TREE_EVENT_TARGET = 'ctl00$ctl00$cphFuncionalidade$cphCampos$treeView';

  function normalize(value) {
    return U?.normalizeCompare
      ? U.normalizeCompare(String(value || ''))
      : String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function extractCodigo(texto) {
    const text = String(texto || '').replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
    const parenteses = text.match(/^\s*\(([^)]+)\)/u);
    if (parenteses) return normalize(parenteses[1]);

    const codigo = text.match(/\b((?:GO-)?EF[A-Z0-9-]+)\b/iu);
    return codigo ? normalize(codigo[1]) : '';
  }

  function extractSiapId(anchor) {
    const href = String(anchor?.getAttribute?.('href') || '');
    const ids = href.match(/\d{4,}/g) || [];
    return ids[ids.length - 1] || '';
  }

  function getHabilidadeLinks() {
    return Array.from(document.querySelectorAll(`${C.SELECTORS.TREE} a[href]`))
      .filter(anchor => {
        const href = String(anchor.getAttribute('href') || '');
        const text = String(anchor.innerText || anchor.textContent || '').trim();
        return text && /sHabilidades\\/i.test(href);
      });
  }

  function findHabilidadeLink(texto, siapId = '', options = {}) {
    const links = getHabilidadeLinks();
    const allowSimilar = options.allowSimilar !== false;
    const requestedId = String(siapId || '').trim();
    if (requestedId) {
      const byId = links.find(link => extractSiapId(link) === requestedId);
      if (byId) return byId;
    }

    const requestedCode = extractCodigo(texto);
    if (requestedCode) {
      const byCode = links.find(link => extractCodigo(link.innerText || link.textContent || '') === requestedCode);
      if (byCode) return byCode;
      if (!allowSimilar) return null;
    }

    const requestedText = normalize(texto);
    const exact = links.find(link => normalize(link.innerText || link.textContent || '') === requestedText);
    if (exact) return exact;

    if (!allowSimilar) return null;

    const best = M.bestTextMatchAdvanced(
      texto,
      links,
      element => U.normalizeText(element.innerText || element.textContent || '')
    );
    return best?.el && Number(best.score || 0) >= 92 ? best.el : null;
  }

  function habilidadeJaAdicionada(texto) {
    const rows = Array.from(
      document.querySelectorAll(`${C.SELECTORS.HABILIDADES_GRID} tr td:first-child, ${C.SELECTORS.HABILIDADES_GRID} td`)
    );
    const requestedCode = extractCodigo(texto);

    if (requestedCode) {
      return rows.some(element => extractCodigo(element.innerText || element.textContent || '') === requestedCode);
    }

    const requestedText = normalize(texto);
    if (rows.some(element => normalize(element.innerText || element.textContent || '') === requestedText)) {
      return true;
    }

    const best = M.bestTextMatchAdvanced(
      texto,
      rows,
      element => U.normalizeText(element.innerText || element.textContent || '')
    );
    return !!(best && Number(best.score || 0) >= 92);
  }

  async function waitForHabilidadeAdded(texto, timeout = 8000) {
    return U.waitUntil(() => habilidadeJaAdicionada(texto), timeout, 300);
  }

  async function waitForTreeReady(timeout = 12000) {
    return U.waitUntil(() => getHabilidadeLinks().length > 0, timeout, 300);
  }

  async function clickAndConfirm(texto, link) {
    if (!link) return false;

    const label = String(link.innerText || link.textContent || '').trim();
    L.log(`Habilidade pedida: ${texto}`);
    L.log(`Habilidade escolhida: ${label}`);

    try { link.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) {}
    await U.sleep(250);

    try {
      U.safeClick(link);
      await U.waitForAsyncPostBack(10000, 1300);
      // Quando o endRequest do ASP.NET termina, a grade ja foi atualizada.
      // Uma espera curta cobre apenas o repaint do navegador; esperar 6,5 s
      // aqui atrasava a aula mesmo quando o SIAP ja havia rejeitado o clique.
      await U.sleep(180);
      if (await waitForHabilidadeAdded(label || texto, 1400)) return true;
    } catch (err) {
      console.warn(err);
    }

    try {
      const refreshed = findHabilidadeLink(label || texto, extractSiapId(link));
      if (refreshed) {
        L.log('Clique normal não confirmou a habilidade; tentando postback manual...');
        U.runTreeNodePostbackInPage(refreshed);
        await U.waitForAsyncPostBack(10000, 1300);
        await U.sleep(180);
        if (await waitForHabilidadeAdded(label || texto, 1400)) return true;
      }
    } catch (err) {
      console.warn(err);
    }

    return false;
  }

  function getTreeEventTarget() {
    for (const link of getHabilidadeLinks()) {
      const postback = U.extractPostBackFromHref?.(link.getAttribute('href') || '');
      if (postback?.eventTarget) return String(postback.eventTarget);
    }
    return TREE_EVENT_TARGET;
  }

  function buildLocationLabel(texto, location = {}) {
    const codigo = String(location.codigo || '').trim();
    const descricao = String(location.descricao || '').trim();
    if (descricao && (!codigo || extractCodigo(descricao) === normalize(codigo))) return descricao;
    if (codigo && descricao) return `(${codigo}) ${descricao}`;
    return codigo || descricao || String(texto || '').trim();
  }

  async function addHabilidadeByDirectPostback(texto, siapId) {
    const id = String(siapId || '').trim();
    if (!/^\d+$/.test(id)) return false;
    if (habilidadeJaAdicionada(texto)) return true;

    const eventTarget = getTreeEventTarget();
    const eventArgument = `sHabilidades\\${id}`;

    try {
      L.log(`[Catálogo SIAP] Tentando adicionar a habilidade diretamente pelo ID ${id}...`);
      const dispatched = U.firePostBackInPage?.(eventTarget, eventArgument);
      if (!dispatched) return false;

      await U.waitForAsyncPostBack(10000, 1800);
      await U.sleep(180);
      if (await waitForHabilidadeAdded(texto, 1400)) {
        L.log('[Catálogo SIAP] Habilidade adicionada diretamente, sem trocar eixo ou bimestre.');
        return true;
      }
    } catch (err) {
      console.warn('[Catálogo SIAP] Postback direto da habilidade falhou:', err);
    }

    L.log('[Catálogo SIAP] O SIAP não confirmou o clique direto; usando o caminho salvo como alternativa.');
    return false;
  }

  function isSameLocation(context, location) {
    const sameBimestre = Number(context?.bimestre || 0) === Number(location?.bimestre || 0);
    const currentEixoId = String(context?.eixoSiapId || '').trim();
    const targetEixoId = String(location?.eixo_siap_id || '').trim();
    const sameEixo = currentEixoId && targetEixoId
      ? currentEixoId === targetEixoId
      : normalize(context?.eixo || '') === normalize(location?.eixo || '');
    return sameBimestre && sameEixo;
  }

  function orderLocationsByShortestRoute(locations, context) {
    const currentBimestre = Number(context?.bimestre || 0);
    const currentEixoId = String(context?.eixoSiapId || '').trim();
    const currentEixo = normalize(context?.eixo || '');

    return Array.from(locations || [])
      .map((location, index) => {
        const sameBimestre = currentBimestre === Number(location?.bimestre || 0);
        const targetEixoId = String(location?.eixo_siap_id || '').trim();
        const sameEixo = currentEixoId && targetEixoId
          ? currentEixoId === targetEixoId
          : currentEixo === normalize(location?.eixo || '');

        // 0: ja esta na arvore atual; 1: troca apenas o eixo;
        // 2: troca apenas o bimestre; 3: troca os dois.
        const cost = (sameBimestre ? 0 : 2) + (sameEixo ? 0 : 1);
        return { location, index, cost };
      })
      .sort((a, b) => a.cost - b.cost || a.index - b.index)
      .map(item => item.location);
  }

  async function switchToLocation(location) {
    if (!location) return false;

    const before = window.SIAPContext?.getCurrentContext?.() || {};
    const bimestre = Number(location.bimestre || 0);
    const precisaTrocarBimestre = Number(before?.bimestre || 0) !== bimestre;
    const bimestreOk = precisaTrocarBimestre
      ? await window.SIAPBimestre?.selectBimestre?.({
          value: String(bimestre),
          text: bimestre ? `${bimestre}º Bimestre` : ''
        }, { timeout: 14000, remember: true })
      : true;

    if (!bimestreOk) {
      L.log(`[Catálogo SIAP] Não foi possível selecionar o ${bimestre}º bimestre.`);
      return false;
    }

    const afterBimestre = window.SIAPContext?.getCurrentContext?.() || before;
    const currentEixoId = String(afterBimestre?.eixoSiapId || '').trim();
    const targetEixoId = String(location.eixo_siap_id || '').trim();
    const precisaTrocarEixo = currentEixoId && targetEixoId
      ? currentEixoId !== targetEixoId
      : normalize(afterBimestre?.eixo || '') !== normalize(location.eixo || '');

    const eixoOk = precisaTrocarEixo
      ? await window.SIAPEixo?.selectEixo?.({
          value: String(location.eixo_siap_id || ''),
          text: String(location.eixo || '')
        }, { timeout: 14000, remember: true })
      : true;

    if (!eixoOk) {
      L.log(`[Catálogo SIAP] Não foi possível selecionar o eixo ${location.eixo || '-'}.`);
      return false;
    }

    return waitForTreeReady(14000);
  }

  async function addHabilidadeFromCurrentTree(texto, siapId = '', options = {}) {
    if (habilidadeJaAdicionada(texto)) return true;

    await waitForTreeReady(3500);
    const link = findHabilidadeLink(texto, siapId, options);
    if (!link) return false;

    return clickAndConfirm(texto, link);
  }

  async function addHabilidadeByText(texto) {
    if (!texto) return false;
    if (habilidadeJaAdicionada(texto)) {
      L.log(`Habilidade já adicionada: ${texto}`);
      return true;
    }

    let added = await addHabilidadeFromCurrentTree(texto, '', { allowSimilar: false });
    if (added) {
      L.log('Habilidade adicionada com sucesso.');
      return true;
    }

    const api = window.SIAPApi;
    const contextBeforeLookup = window.SIAPContext?.getCurrentContext?.() || {};

    if (api?.syncCurrentCatalog) {
      await api.syncCurrentCatalog({ context: contextBeforeLookup, silent: true });
    }

    const foundLocations = api?.findHabilidadeLocations
      ? await api.findHabilidadeLocations(texto, contextBeforeLookup)
      : [];

    if (!foundLocations.length) {
      L.log(`Habilidade não encontrada na tela nem no catálogo: ${texto}`);
      const similar = await addHabilidadeFromCurrentTree(texto, '', { allowSimilar: true });
      if (similar) {
        L.log('Código ausente do catálogo; habilidade semelhante adicionada como alternativa.');
      }
      return similar;
    }

    const locations = orderLocationsByShortestRoute(foundLocations, contextBeforeLookup);
    const sameLocation = locations.find(location => isSameLocation(contextBeforeLookup, location));

    // O postback por ID so funciona quando o eixo/bimestre correspondente ja
    // esta carregado no servidor. O log da aula 192 mostrou que tentar um ID de
    // LEITURA enquanto a tela estava em ORALIDADE retornava HTTP 200, mas nao
    // adicionava nada e provocava uma espera falsa de 6,5 s.
    if (sameLocation) {
      const targetText = buildLocationLabel(texto, sameLocation);

      added = await addHabilidadeFromCurrentTree(
        targetText,
        sameLocation.siap_id || '',
        { allowSimilar: false }
      );
      if (added) {
        L.log('Habilidade adicionada pelo caminho exato da árvore atual.');
        return true;
      }

      if (/^\d+$/.test(String(sameLocation?.siap_id || '').trim())) {
        added = await addHabilidadeByDirectPostback(targetText, sameLocation.siap_id);
        if (added) return true;
      }
    }

    for (const location of locations) {
      let ready = true;
      const current = window.SIAPContext?.getCurrentContext?.() || {};

      if (sameLocation === location) continue;

      if (!isSameLocation(current, location)) {
        L.log(
          `[Catálogo SIAP] Habilidade localizada em ${location.eixo} / ${location.bimestre}º bimestre. ` +
          'Indo diretamente ao caminho salvo...'
        );
        ready = await switchToLocation(location);
      } else {
        await waitForTreeReady(5000);
      }

      if (!ready) continue;

      if (api?.syncCurrentCatalog) {
        await api.syncCurrentCatalog({ force: true, silent: true });
      }

      const targetText = buildLocationLabel(texto, location);
      added = await addHabilidadeFromCurrentTree(targetText, location.siap_id || '', { allowSimilar: false });
      if (added) {
        L.log('Habilidade adicionada com sucesso após localizar eixo e bimestre no catálogo.');
        return true;
      }
    }

    L.log(`Habilidade ainda não apareceu na grade após consultar o catálogo: ${texto}`);
    return false;
  }

  return {
    getHabilidadeLinks,
    habilidadeJaAdicionada,
    addHabilidadeByText,
    addHabilidadeByDirectPostback,
    waitForHabilidadeAdded,
    findHabilidadeLink
  };
})();
