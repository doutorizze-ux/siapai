window.SIAPApi = (() => {
  const C = window.SIAPConfig;

  function getStorageValue(name) {
    try {
      const value = localStorage.getItem(name);
      if (value !== null && value !== undefined && value !== '') return value;
    } catch {}

    try {
      const value = sessionStorage.getItem(name);
      if (value !== null && value !== undefined && value !== '') return value;
    } catch {}

    try {
      const el = document.getElementById('siap-runtime-' + String(name).toLowerCase());
      if (el) {
        const value = el.getAttribute('content') || '';
        if (value) return value;
      }
    } catch {}

    return undefined;
  }

  function getSharedGlobal(name) {
    try {
      if (typeof unsafeWindow !== 'undefined' && unsafeWindow && unsafeWindow[name] !== undefined) {
        return unsafeWindow[name];
      }
    } catch {}

    try {
      if (window[name] !== undefined) return window[name];
    } catch {}

    try {
      if (globalThis[name] !== undefined) return globalThis[name];
    } catch {}

    return getStorageValue(name);
  }

  // O Revisa é um serviço próprio do SiapAI. Não use configurações residuais
  // da extensão-fonte, pois elas podem apontar para um serviço legado sem catálogo.
  const SIAPAI_API_BASE = 'https://siapai.online/api';

  function getServerApiBase() {
    return SIAPAI_API_BASE;
  }

  function getServerToken() {
    return String(getSharedGlobal('SIAP_SAAS_TOKEN') || '').trim();
  }

  function requestThroughExtension(path, method, payload, token, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
      const requestId = `siap_revisa_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
      const timeout = setTimeout(() => {
        window.removeEventListener('message', onMessage);
        reject(new Error('Tempo esgotado na comunicação segura do Revisa.'));
      }, Math.max(5000, Number(timeoutMs) || 30000));

      function onMessage(event) {
        if (event.source !== window) return;
        const data = event?.data;
        if (!data || data.source !== 'SIAP_SAAS_PAGE_PROXY_RESPONSE' || data.requestId !== requestId) return;
        clearTimeout(timeout);
        window.removeEventListener('message', onMessage);
        if (data.ok) {
          resolve(data.payload || {});
        } else {
          reject(new Error(data.message || 'Falha de comunicação com o Revisa.'));
        }
      }

      window.addEventListener('message', onMessage);
      window.postMessage({
        source: 'SIAP_SAAS_PAGE_PROXY_REQUEST',
        requestId,
        path: String(path || ''),
        method: String(method || 'POST').toUpperCase(),
        payload: payload === undefined ? null : payload,
        token: String(token || '')
      }, window.location.origin);
    });
  }

  const CATALOG_VERSION = '3.2.27';
  const BIMESTRE_SELECTOR = '#cphFuncionalidade_cphCampos_ddlBimestre, #ddlBimestre, select[id$="ddlBimestre"], select[name$="$ddlBimestre"]';
  const EIXO_SELECTOR = '#ddlEixo, select[id$="ddlEixo"], select[name$="$ddlEixo"]';
  const FULL_SCAN_STATE_KEY = 'siap_catalog_full_scan_v5';

  let catalogSyncTimer = null;
  let catalogSyncInFlight = null;
  let catalogSyncPending = false;
  let catalogWatcherStarted = false;
  let catalogFullScanInProgress = false;
  let catalogFullScanPromise = null;
  let lastCatalogSignature = '';

  function normalizeCatalogText(value) {
    return String(value || '').replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
  }

  // Chave canônica usada quando o SIAP apresenta o mesmo eixo mais de uma vez
  // com IDs diferentes. O banco possui uma única combinação por
  // série + disciplina + eixo (nome) + bimestre; portanto a varredura deve
  // deduplicar pelo mesmo critério para não terminar com, por exemplo,
  // 24 combinações "visitadas" e apenas 20 efetivamente gravadas.
  function normalizeCatalogKey(value) {
    return normalizeCatalogText(value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('pt-BR')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function normalizeRevisaDiscipline(value) {
    const original = normalizeCatalogText(value);
    if (!original) return '';

    const comparison = original
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleUpperCase('pt-BR');

    // O Revisa de Língua Portuguesa também deve aparecer em componentes como
    // "Estudo Orientado - Língua Portuguesa". A palavra PORTUGUESA é a regra
    // definida para esta família, independentemente do restante do nome.
    if (comparison.includes('PORTUGUES')) {
      return 'LÍNGUA PORTUGUESA';
    }

    return original;
  }

  function extractHabilidadeCode(texto) {
    const text = normalizeCatalogText(texto);
    const parenteses = text.match(/^\s*\(([^)]+)\)/u);
    if (parenteses) return normalizeCatalogText(parenteses[1]);

    const codigo = text.match(/\b((?:GO-)?EF[A-Z0-9-]+)\b/iu);
    return codigo ? normalizeCatalogText(codigo[1]) : '';
  }

  function getCatalogBaseContext(context = null) {
    const current = context || window.SIAPContext?.getCurrentContext?.() || {};
    const serie = normalizeCatalogText(current.serie || current.serieAno || current.turma || '');

    return {
      serie,
      disciplina: normalizeCatalogText(current.disciplina || '')
    };
  }

  function buildHabilidadePath(contexto, item) {
    const identificador = normalizeCatalogText(item?.codigo || extractHabilidadeCode(item?.descricao || '') || `ID ${item?.siap_id || ''}`);
    const serie = normalizeCatalogText(contexto.serie);
    return [
      serie,
      contexto.disciplina,
      contexto.bimestre ? `${contexto.bimestre}º Bimestre` : '',
      contexto.eixo,
      identificador
    ].filter(Boolean).join(' > ');
  }

  function buildMatrizSaebTextPath(contexto, item) {
    const serie = normalizeCatalogText(contexto.serie);
    const itemPath = normalizeCatalogText(item?.caminho_texto || item?.texto || '');

    return [
      serie,
      contexto.disciplina,
      contexto.bimestre ? `${contexto.bimestre}º Bimestre` : '',
      contexto.eixo,
      itemPath || 'Matriz SAEB'
    ].filter(Boolean).join(' > ');
  }

  function buildCatalogPayload(context = null, options = {}) {
    const current = context || window.SIAPContext?.getCurrentContext?.() || {};
    const tree = current.arvoreObjetivosConteudos || {};
    const rawHabilidades = Array.isArray(current.habilidadesCatalogo)
      ? current.habilidadesCatalogo
      : (Array.isArray(tree.habilidadesCatalogo) ? tree.habilidadesCatalogo : []);
    const conteudos = Array.isArray(current.conteudosCatalogo)
      ? current.conteudosCatalogo
      : (Array.isArray(tree.conteudosCatalogo) ? tree.conteudosCatalogo : []);
    const rawMatrizSaeb = Array.isArray(current?.matrizSaeb?.catalogo)
      ? current.matrizSaeb.catalogo
      : [];
    const base = getCatalogBaseContext(current);
    const contexto = {
      ...base,
      eixo: normalizeCatalogText(current.eixo || ''),
      eixo_siap_id: normalizeCatalogText(current.eixoSiapId || ''),
      bimestre: Number(current.bimestre || 0)
    };
    const habilidades = rawHabilidades.map(item => ({
      ...item,
      caminho_siap: buildHabilidadePath(contexto, item)
    }));
    const matrizSaeb = rawMatrizSaeb.map(item => ({
      ...item,
      caminho_texto: buildMatrizSaebTextPath(contexto, item)
    }));

    return {
      action: 'sync',
      versao_extensao: CATALOG_VERSION,
      varredura_completa: !!options.fullScan,
      contexto,
      habilidades,
      conteudos,
      matriz_saeb: matrizSaeb
    };
  }

  function getCatalogSignature(payload) {
    const contexto = payload?.contexto || {};
    const habilidades = Array.isArray(payload?.habilidades) ? payload.habilidades : [];
    const conteudos = Array.isArray(payload?.conteudos) ? payload.conteudos : [];
    const matrizSaeb = Array.isArray(payload?.matriz_saeb) ? payload.matriz_saeb : [];

    return JSON.stringify({
      serie: contexto.serie,
      disciplina: contexto.disciplina,
      eixo: contexto.eixo,
      eixo_siap_id: contexto.eixo_siap_id,
      bimestre: contexto.bimestre,
      habilidades: habilidades.map(item => String(item?.siap_id || '')).sort(),
      conteudos: conteudos.map(item => String(item?.siap_id || '')).sort(),
      matriz_saeb: matrizSaeb.map(item => String(item?.siap_id || '')).sort()
    });
  }

  function getCatalogCacheKey(payload) {
    const contexto = payload?.contexto || {};
    const raw = [
      contexto.serie,
      contexto.disciplina,
      contexto.eixo_siap_id || contexto.eixo,
      contexto.bimestre
    ].map(normalizeCatalogText).join('|');
    let hash = 5381;
    for (let index = 0; index < raw.length; index++) {
      hash = ((hash << 5) + hash) ^ raw.charCodeAt(index);
    }
    return `siap_catalog_sync_v4_${(hash >>> 0).toString(16)}`;
  }

  function readCatalogCache(payload) {
    try {
      const raw = localStorage.getItem(getCatalogCacheKey(payload));
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (_) {
      return null;
    }
  }

  function writeCatalogCache(payload, signature) {
    try {
      localStorage.setItem(getCatalogCacheKey(payload), JSON.stringify({
        signature,
        syncedAt: Date.now()
      }));
    } catch (_) {}
  }

  async function callCatalogEndpoint(payload) {
    const token = getServerToken();
    if (!token) throw new Error('Token da licença não encontrado para acessar o catálogo.');
    const json = await requestThroughExtension('/catalogo-siap.php', 'POST', payload, token, 30000);
    if (!json?.ok) throw new Error(json?.error || json?.message || 'Catálogo indisponível.');
    return json;
  }

  function buildRevisaContextPayload(context = null) {
    const current = context || window.SIAPContext?.getCurrentContext?.() || {};
    const bimestreMatch = String(current.bimestre || '').match(/\d+/);
    return {
      serie: normalizeCatalogText(current.serie || current.serieAno || current.turma || ''),
      serie_ano: normalizeCatalogText(current.serieAno || ''),
      turma: normalizeCatalogText(current.turma || current.serie || ''),
      disciplina: normalizeRevisaDiscipline(current.disciplina || ''),
      bimestre: bimestreMatch ? Number(bimestreMatch[0]) : 0
    };
  }

  async function callRevisaEndpoint(payload, options = {}) {
    const token = getServerToken();
    if (!token) throw new Error('Token da licença não encontrado para acessar o Revisa.');
    try {
      const json = await requestThroughExtension(
        '/revisa.php',
        'POST',
        payload,
        token,
        Math.max(5000, Number(options.timeout || 30000))
      );
      if (!json?.ok) throw new Error(json?.error || json?.message || 'Revisa indisponível.');
      return json;
    } catch (err) {
      throw err;
    }
  }

  function getRevisaTargetYear(payload = {}) {
    const direct = String(payload.serie_ano || '').match(/\d+/)?.[0];
    if (direct) return Number(direct);
    const fromSerie = String(payload.serie || '').match(/\d+/)?.[0];
    return fromSerie ? Number(fromSerie) : 0;
  }

  function isRevisaMaterialCompatible(entry, payload = {}) {
    if (!entry || typeof entry !== 'object') return false;

    const targetYear = getRevisaTargetYear(payload);
    const targetDisciplina = normalizeCatalogKey(normalizeRevisaDiscipline(payload.disciplina || ''));

    const materialYear = Number(entry?.material?.serie_ano || 0);
    const materialDisciplina = normalizeCatalogKey(
      normalizeRevisaDiscipline(entry?.componente?.disciplina || '')
    );

    if (targetYear && materialYear && materialYear !== targetYear) return false;
    if (targetDisciplina && materialDisciplina && materialDisciplina !== targetDisciplina) return false;

    // O Revisa é compatível em qualquer bimestre. Série e disciplina continuam
    // obrigatórias para impedir que o material apareça na turma errada.
    if (targetYear && !materialYear) return false;
    if (targetDisciplina && !materialDisciplina) return false;

    return true;
  }

  async function loadRevisaCatalog(context = null) {
    const contexto = buildRevisaContextPayload(context);
    const response = await callRevisaEndpoint({
      action: 'catalogo',
      contexto
    });

    const data = response?.data && typeof response.data === 'object'
      ? response.data
      : { disponivel: false, materiais: [] };

    const materiaisOriginais = Array.isArray(data.materiais) ? data.materiais : [];
    const materiais = materiaisOriginais.filter((entry) => isRevisaMaterialCompatible(entry, contexto));

    if (materiaisOriginais.length && !materiais.length) {
      window.SIAPLogger?.log?.(
        `[Revisa] Retorno descartado por não corresponder à série/disciplina atuais. ` +
        `Recebidos=${materiaisOriginais.length}.`
      );
    }

    return {
      ...data,
      disponivel: materiais.length > 0,
      materiais
    };
  }

  async function prepareRevisaSelection(config = {}, context = null, qtdAulas = 1) {
    const response = await callRevisaEndpoint({
      action: 'trecho',
      contexto: buildRevisaContextPayload(context),
      material_id: Number(config.materialId || config.material_id || 0),
      componente_id: Number(config.componenteId || config.componente_id || 0),
      bloco_id: Number(config.blocoId || config.bloco_id || 0),
      sequencia_id: Number(config.sequenciaId || config.sequencia_id || 0),
      modo_selecao: String(config.modoSelecao || config.modo_selecao || 'sequencia'),
      atividade_inicial_ordem: Number(config.atividadeInicialOrdem || config.atividade_inicial_ordem || 1),
      atividade_final_ordem: Number(config.atividadeFinalOrdem || config.atividade_final_ordem || 1),
      pagina_inicial: Number(config.paginaInicial || config.pagina_inicial || 0),
      pagina_final: Number(config.paginaFinal || config.pagina_final || 0),
      continuar: !!config.continuar,
      qtd_aulas: Math.max(1, Number(qtdAulas) || 1)
    }, { timeout: 45000 });

    const data = response?.data || {};
    data.modo_uso = String(config.modoUso || config.modo_uso || 'principal');
    return data;
  }

  function getRevisaReferenceInstruction(revisa = null) {
    const activities = Array.isArray(revisa?.atividades) ? revisa.atividades : [];
    const required = [];

    for (const activity of activities) {
      const references = Array.isArray(activity?.referencias) ? activity.referencias : [];
      for (const reference of references) {
        if (!reference?.obrigatorio) continue;
        const value = normalizeCatalogText(reference.codigo || reference.texto || '');
        if (value) required.push(value);
      }
    }

    return [...new Set(required)].join('\n');
  }

  async function markRevisaProgress(plan = {}, context = null, lessonNumber = '') {
    const revisa = plan?.revisa;
    const activityIds = Array.isArray(revisa?.atividadeIds)
      ? revisa.atividadeIds.map(Number).filter(id => Number.isFinite(id) && id > 0)
      : [];

    if (!activityIds.length || !revisa?.materialId || !revisa?.componenteId) {
      return { ok: true, skipped: true, reason: 'sem_atividades_revisa' };
    }

    try {
      const response = await callRevisaEndpoint({
        action: 'registrar_progresso',
        contexto: buildRevisaContextPayload(context),
        material_id: Number(revisa.materialId),
        componente_id: Number(revisa.componenteId),
        bloco_id: Number(revisa.blocoId || 0),
        sequencia_id: Number(revisa.sequenciaId || 0),
        atividade_ids: activityIds,
        numero_aula: String(lessonNumber || '')
      });
      window.SIAPLogger?.log?.(
        `[Revisa] Progresso confirmado: ${Number(response?.data?.registradas || activityIds.length)} atividade(s) da aula ${lessonNumber || '-'}.`
      );
      return response;
    } catch (err) {
      // O planejamento já foi salvo no SIAP. Uma falha de rede ao registrar o
      // marcador não pode interromper a próxima aula; o endpoint é idempotente
      // e poderá ser chamado novamente após uma nova confirmação.
      window.SIAPLogger?.log?.(`[Revisa] Aula salva, mas o progresso não pôde ser atualizado agora: ${err?.message || err}`);
      return { ok: false, error: err?.message || String(err) };
    }
  }

  async function syncCurrentCatalog(options = {}) {
    const payload = buildCatalogPayload(options.context || null, options);
    const contexto = payload.contexto;

    if (!contexto.serie || !contexto.disciplina || !contexto.eixo || !contexto.bimestre) {
      return { ok: false, skipped: true, reason: 'contexto_incompleto' };
    }
    if (!payload.habilidades.length && !payload.conteudos.length && !payload.matriz_saeb.length && !options.fullScan) {
      return { ok: false, skipped: true, reason: 'arvore_vazia' };
    }

    const signature = getCatalogSignature(payload);
    if (!options.force && signature === lastCatalogSignature) {
      return { ok: true, skipped: true, reason: 'sem_alteracoes' };
    }

    const cached = readCatalogCache(payload);
    const cacheFresh = cached?.syncedAt && (Date.now() - Number(cached.syncedAt) < 24 * 60 * 60 * 1000);
    if (!options.force && cacheFresh && cached?.signature === signature) {
      lastCatalogSignature = signature;
      return { ok: true, skipped: true, reason: 'sincronizado_recentemente' };
    }

    if (catalogSyncInFlight) {
      catalogSyncPending = true;
      return catalogSyncInFlight;
    }

    catalogSyncInFlight = (async () => {
      try {
        const response = await callCatalogEndpoint(payload);
        lastCatalogSignature = signature;
        writeCatalogCache(payload, signature);
        const data = response?.data || {};
        window.SIAPLogger?.log?.(
          `[Catálogo SIAP] Sincronizado: ${contexto.serie} • ${contexto.disciplina} • ${contexto.eixo} • ${contexto.bimestre}º bimestre ` +
          `(${Number(data.habilidades || payload.habilidades.length)} habilidades; ` +
          `${Number(data.conteudos || payload.conteudos.length)} conteúdos; ` +
          `${Number(data.matriz_saeb || payload.matriz_saeb.length)} itens da Matriz SAEB).`
        );
        return response;
      } catch (err) {
        if (!options.silent) {
          window.SIAPLogger?.log?.(`[Catálogo SIAP] Não foi possível sincronizar agora: ${err?.message || err}`);
        }
        return { ok: false, error: err?.message || String(err) };
      } finally {
        catalogSyncInFlight = null;
        if (catalogSyncPending) {
          catalogSyncPending = false;
          scheduleCatalogSync(900, { force: false, silent: true });
        }
      }
    })();

    return catalogSyncInFlight;
  }

  function scheduleCatalogSync(delay = 1200, options = {}) {
    if (catalogSyncTimer) clearTimeout(catalogSyncTimer);
    catalogSyncTimer = setTimeout(() => {
      catalogSyncTimer = null;
      syncCurrentCatalog(options).catch(() => {});
    }, Math.max(100, Number(delay) || 1200));
  }

  function catalogSleep(ms) {
    if (window.SIAPUtils?.sleep) return window.SIAPUtils.sleep(ms);
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function getSelectedOption(select) {
    if (!select || select.selectedIndex < 0) return { value: '', text: '' };
    const option = select.options[select.selectedIndex];
    return {
      value: normalizeCatalogText(option?.value || select.value || ''),
      text: normalizeCatalogText(option?.textContent || option?.innerText || '')
    };
  }

  function getBimestreOptions() {
    const select = document.querySelector(BIMESTRE_SELECTOR);
    const seen = new Set();

    return Array.from(select?.options || []).map(option => {
      const value = normalizeCatalogText(option.value || '');
      const text = normalizeCatalogText(option.textContent || option.innerText || '');
      const byValue = Number.parseInt(value, 10);
      const byText = Number.parseInt((text.match(/\b([1-4])\s*[ºo]?\s*bimestre\b/i) || [])[1] || '', 10);
      const numero = byValue >= 1 && byValue <= 4 ? byValue : byText;
      return { value, text, numero };
    }).filter(item => {
      if (!item.value || !item.numero || item.numero < 1 || item.numero > 4) return false;
      const key = String(item.numero);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function getEixoOptions() {
    const select = document.querySelector(EIXO_SELECTOR);
    const seen = new Set();

    return Array.from(select?.options || []).map(option => ({
      value: normalizeCatalogText(option.value || ''),
      text: normalizeCatalogText(option.textContent || option.innerText || ''),
      disabled: !!option.disabled
    })).filter(item => {
      if (item.disabled) return false;
      if (!item.value || !item.text || item.value === '0' || item.value === '-1') return false;

      const textKey = normalizeCatalogKey(item.text);
      if (!textKey) return false;

      // Remove opções auxiliares/placeholder que não representam um eixo real.
      if (/^(selecione|escolha)(\s|$)/i.test(item.text)) return false;
      if (/^(todos?|todas?|nenhum|nenhuma|nao se aplica|não se aplica)$/i.test(item.text)) return false;

      // IMPORTANTE: deduplica pelo nome canônico do eixo, e não por ID.
      // É o mesmo critério lógico usado pela chave única do catálogo no banco.
      if (seen.has(textKey)) return false;
      seen.add(textKey);
      return true;
    }).map(({ disabled, ...item }) => item);
  }

  function getCoverageKey(context) {
    const base = getCatalogBaseContext(context);
    return [base.serie, base.disciplina]
      .map(value => normalizeCatalogText(value).toLocaleLowerCase('pt-BR'))
      .join('|');
  }

  function readFullScanState(coverageKey) {
    try {
      const parsed = JSON.parse(sessionStorage.getItem(FULL_SCAN_STATE_KEY) || 'null');
      if (!parsed || parsed.coverageKey !== coverageKey) return null;
      if (!parsed.startedAt || Date.now() - Number(parsed.startedAt) > 2 * 60 * 60 * 1000) return null;
      return parsed;
    } catch (_) {
      return null;
    }
  }

  function writeFullScanState(state) {
    try {
      sessionStorage.setItem(FULL_SCAN_STATE_KEY, JSON.stringify(state));
    } catch (_) {}
  }

  function clearFullScanState(coverageKey) {
    try {
      const parsed = JSON.parse(sessionStorage.getItem(FULL_SCAN_STATE_KEY) || 'null');
      if (!parsed || !coverageKey || parsed.coverageKey === coverageKey) {
        sessionStorage.removeItem(FULL_SCAN_STATE_KEY);
      }
    } catch (_) {
      try { sessionStorage.removeItem(FULL_SCAN_STATE_KEY); } catch (_) {}
    }
  }

  async function waitForCatalogPage(timeout = 24000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeout) {
      const current = window.SIAPContext?.getCurrentContext?.() || {};
      const base = getCatalogBaseContext(current);
      if (
        base.serie && base.disciplina &&
        document.querySelector(BIMESTRE_SELECTOR) && document.querySelector(EIXO_SELECTOR) &&
        getBimestreOptions().length > 0 && getEixoOptions().length > 0
      ) {
        return current;
      }
      await catalogSleep(500);
    }
    return null;
  }

  function sameEixo(current, target) {
    const currentId = normalizeCatalogText(current?.eixoSiapId || '');
    if (currentId && target?.value) return currentId === normalizeCatalogText(target.value);
    return normalizeCatalogText(current?.eixo || '').toLocaleLowerCase('pt-BR') ===
      normalizeCatalogText(target?.text || '').toLocaleLowerCase('pt-BR');
  }

  function getTreeSignature(context) {
    const habilidades = Array.isArray(context?.habilidadesCatalogo) ? context.habilidadesCatalogo : [];
    const conteudos = Array.isArray(context?.conteudosCatalogo) ? context.conteudosCatalogo : [];
    const matrizSaeb = Array.isArray(context?.matrizSaeb?.catalogo) ? context.matrizSaeb.catalogo : [];
    return JSON.stringify({
      habilidades: habilidades.map(item => String(item?.siap_id || '')).sort(),
      conteudos: conteudos.map(item => String(item?.siap_id || '')).sort(),
      matriz_saeb: matrizSaeb.map(item => String(item?.siap_id || '')).sort()
    });
  }

  async function waitForCatalogCombination(bimestre, eixo, timeout = 24000) {
    const startedAt = Date.now();
    let lastSignature = '';
    let stableReads = 0;

    while (Date.now() - startedAt < timeout) {
      const current = window.SIAPContext?.getCurrentContext?.() || {};
      const sameBimestre = Number(current.bimestre || 0) === Number(bimestre.numero || 0);
      const treeReady = !!current?.arvoreObjetivosConteudos?.encontrado;

      if (sameBimestre && sameEixo(current, eixo) && treeReady) {
        const signature = getTreeSignature(current);
        if (signature === lastSignature) stableReads += 1;
        else {
          lastSignature = signature;
          stableReads = 1;
        }
        if (stableReads >= 3) return current;
      } else {
        stableReads = 0;
        lastSignature = '';
      }

      await catalogSleep(400);
    }

    throw new Error(`O SIAP não terminou de carregar ${eixo.text} / ${bimestre.text}.`);
  }

  function createCatalogProgress(context) {
    if (window.__SIAP_SAAS_HEADLESS__) {
      return {
        update() {},
        success() {},
        fail() {},
        remove() {}
      };
    }
    document.getElementById('siap-catalog-registration-overlay')?.remove?.();

    const overlay = document.createElement('div');
    overlay.id = 'siap-catalog-registration-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(15,23,42,.48);display:flex;align-items:center;justify-content:center;padding:18px;font-family:Arial,sans-serif;';

    const card = document.createElement('div');
    card.style.cssText = 'width:min(560px,100%);background:#fff;border:1px solid #fecaca;border-top:5px solid #d92d20;border-radius:14px;box-shadow:0 22px 60px rgba(15,23,42,.28);padding:24px;color:#172033;';

    const title = document.createElement('div');
    title.textContent = 'Cadastrando habilidades e Matriz SAEB';
    title.style.cssText = 'font-size:20px;font-weight:800;color:#b42318;margin-bottom:8px;';

    const description = document.createElement('div');
    description.textContent = `A série ${context.serie} e a disciplina ${context.disciplina} ainda não estão cadastradas nesta versão. Aguarde enquanto os bimestres, eixos, habilidades, conteúdos e a Matriz SAEB (quando existir) são verificados.`;
    description.style.cssText = 'font-size:14px;line-height:1.5;color:#475569;margin-bottom:14px;';

    const warning = document.createElement('div');
    warning.style.cssText = 'display:flex;gap:10px;align-items:flex-start;background:#fff1f0;border:1px solid #fda29b;border-radius:10px;padding:11px 12px;margin-bottom:18px;color:#912018;';

    const warningIcon = document.createElement('span');
    warningIcon.textContent = '⚠';
    warningIcon.setAttribute('aria-hidden', 'true');
    warningIcon.style.cssText = 'font-size:20px;line-height:1;flex:0 0 auto;';

    const warningText = document.createElement('div');
    warningText.style.cssText = 'font-size:13px;line-height:1.45;';

    const warningTitle = document.createElement('strong');
    warningTitle.textContent = 'Aguarde — não feche nem atualize esta página.';
    warningTitle.style.cssText = 'display:block;margin-bottom:2px;';

    const warningDetail = document.createElement('span');
    warningDetail.textContent = 'Este primeiro cadastro é automático, normalmente não demora muito e acontece apenas uma vez para cada série e disciplina.';

    warningText.append(warningTitle, warningDetail);
    warning.append(warningIcon, warningText);

    const progressHeader = document.createElement('div');
    progressHeader.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:7px;';

    const progressLabel = document.createElement('strong');
    progressLabel.textContent = 'Progresso do cadastro';
    progressLabel.style.cssText = 'font-size:13px;color:#344054;';

    const percent = document.createElement('strong');
    percent.textContent = '0%';
    percent.style.cssText = 'font-size:14px;color:#b42318;font-variant-numeric:tabular-nums;';

    progressHeader.append(progressLabel, percent);

    const bar = document.createElement('div');
    bar.setAttribute('role', 'progressbar');
    bar.setAttribute('aria-valuemin', '0');
    bar.setAttribute('aria-valuemax', '100');
    bar.setAttribute('aria-valuenow', '0');
    bar.style.cssText = 'height:12px;background:#e4e7ec;border-radius:999px;overflow:hidden;margin-bottom:12px;box-shadow:inset 0 1px 2px rgba(16,24,40,.08);';
    const fill = document.createElement('div');
    fill.style.cssText = 'height:100%;width:2%;background:linear-gradient(90deg,#d92d20,#f04438);border-radius:999px;transition:width .3s ease;';
    bar.appendChild(fill);

    const status = document.createElement('div');
    status.textContent = 'Preparando o cadastro...';
    status.style.cssText = 'font-size:13px;font-weight:700;line-height:1.45;color:#344054;';

    const detail = document.createElement('div');
    detail.textContent = 'Identificando as etapas necessárias...';
    detail.style.cssText = 'font-size:12px;line-height:1.4;color:#667085;margin-top:4px;';

    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Fechar';
    button.style.cssText = 'display:none;margin-top:16px;border:0;border-radius:8px;background:#2f80ed;color:#fff;padding:10px 16px;font-weight:700;cursor:pointer;';
    button.addEventListener('click', () => overlay.remove());

    card.append(title, description, warning, progressHeader, bar, status, detail, button);
    overlay.appendChild(card);
    document.documentElement.appendChild(overlay);

    const setPercent = (value) => {
      const safeValue = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
      fill.style.width = `${safeValue}%`;
      percent.textContent = `${safeValue}%`;
      bar.setAttribute('aria-valuenow', String(safeValue));
    };

    return {
      update(message, progressValue = 0, detailMessage = '') {
        status.textContent = message;
        detail.textContent = detailMessage || 'Aguarde a conclusão automática desta etapa.';
        setPercent(Math.min(97, Math.max(2, progressValue)));
      },
      success(message) {
        title.textContent = 'Cadastro concluído';
        title.style.color = '#067647';
        description.textContent = message;
        warning.style.display = 'none';
        status.textContent = 'Tudo pronto. A tela voltou ao bimestre e eixo anteriores.';
        detail.textContent = 'Este catálogo será reutilizado nas próximas aulas da mesma série e disciplina.';
        setPercent(100);
        percent.style.color = '#067647';
        fill.style.background = '#22a06b';
        setTimeout(() => overlay.remove(), 2600);
      },
      fail(message) {
        title.textContent = 'Não foi possível concluir o cadastro';
        description.textContent = message;
        status.textContent = 'Atualize a página para tentar novamente.';
        detail.textContent = 'O cadastro não foi marcado como concluído.';
        setPercent(100);
        fill.style.background = '#d64545';
        button.style.display = 'inline-block';
      },
      remove() {
        overlay.remove();
      }
    };
  }

  async function restoreCatalogSelection(state) {
    if (!state?.originalBimestre || !state?.originalEixo) return;

    try {
      await window.SIAPBimestre?.selectBimestre?.(state.originalBimestre, { timeout: 16000, remember: false });
      await catalogSleep(500);
      await window.SIAPEixo?.selectEixo?.(state.originalEixo, { timeout: 16000, remember: false });
      await catalogSleep(500);
    } catch (err) {
      window.SIAPLogger?.log?.(`[Catálogo SIAP] Não foi possível restaurar a seleção original: ${err?.message || err}`);
    }
  }

  async function ensureFullCatalogRegistration() {
    if (catalogFullScanPromise) return catalogFullScanPromise;

    catalogFullScanPromise = (async () => {
      const initial = await waitForCatalogPage();
      if (!initial) return { ok: false, skipped: true, reason: 'pagina_catalogo_indisponivel' };

      const base = getCatalogBaseContext(initial);
      const coverageKey = getCoverageKey(initial);
      const statusResponse = await callCatalogEndpoint({
        action: 'status_serie_disciplina',
        versao_extensao: CATALOG_VERSION,
        contexto: base
      });

      if (statusResponse?.data?.cadastrado) {
        const pendingRestore = readFullScanState(coverageKey);
        if (pendingRestore) {
          window.__SIAP_CATALOG_SCAN_ACTIVE__ = true;
          await restoreCatalogSelection(pendingRestore);
          window.__SIAP_CATALOG_SCAN_ACTIVE__ = false;
          window.SIAPBimestre?.rememberCurrentBimestre?.();
          window.SIAPEixo?.rememberCurrentEixo?.();
        }
        clearFullScanState(coverageKey);
        window.SIAPLogger?.log?.(`[Catálogo SIAP] ${base.serie} • ${base.disciplina} já possui cadastro completo.`);
        return { ok: true, skipped: true, reason: 'ja_cadastrado' };
      }

      const bimestreSelect = document.querySelector(BIMESTRE_SELECTOR);
      const eixoSelect = document.querySelector(EIXO_SELECTOR);
      const selectedBimestre = getSelectedOption(bimestreSelect);
      const selectedEixo = getSelectedOption(eixoSelect);
      let state = readFullScanState(coverageKey);

      if (!state) {
        state = {
          coverageKey,
          startedAt: Date.now(),
          originalBimestre: selectedBimestre,
          originalEixo: selectedEixo,
          visited: [],
          completedBimestres: [],
          totalHabilidades: 0,
          totalConteudos: 0,
          totalMatrizSaeb: 0
        };
        writeFullScanState(state);
      }

      const progress = createCatalogProgress(base);
      catalogFullScanInProgress = true;
      window.__SIAP_CATALOG_SCAN_ACTIVE__ = true;

      try {
        const beginResponse = await callCatalogEndpoint({
          action: 'iniciar_varredura',
          versao_extensao: CATALOG_VERSION,
          contexto: base
        });

        if (beginResponse?.data?.cadastrado) {
          clearFullScanState(coverageKey);
          progress.remove();
          return { ok: true, skipped: true, reason: 'ja_cadastrado' };
        }

        const bimestres = getBimestreOptions();
        if (!bimestres.length) throw new Error('Nenhum bimestre foi encontrado nesta tela.');

        const visited = new Set(Array.isArray(state.visited) ? state.visited : []);
        const completedBimestres = new Set(Array.isArray(state.completedBimestres) ? state.completedBimestres : []);
        const totalBimestres = bimestres.length;

        for (let bimestreIndex = 0; bimestreIndex < totalBimestres; bimestreIndex++) {
          const bimestre = bimestres[bimestreIndex];
          const bimestreKey = String(bimestre.numero);
          if (completedBimestres.has(bimestreKey)) continue;

          const bimestreStartPercent = 5 + ((bimestreIndex / totalBimestres) * 86);
          progress.update(
            `Carregando ${bimestre.text}...`,
            bimestreStartPercent,
            `${visited.size} combinação(ões) de eixo e bimestre concluída(s).`
          );
          const bimestreOk = await window.SIAPBimestre?.selectBimestre?.(bimestre, { timeout: 18000, remember: false });
          if (!bimestreOk) throw new Error(`Não foi possível abrir ${bimestre.text}.`);
          await catalogSleep(700);

          const eixos = getEixoOptions();
          if (!eixos.length) throw new Error(`Nenhum eixo foi encontrado em ${bimestre.text}.`);

          for (let eixoIndex = 0; eixoIndex < eixos.length; eixoIndex++) {
            const eixo = eixos[eixoIndex];
            // A combinação precisa usar a mesma identidade lógica que o banco:
            // bimestre + nome canônico do eixo. IDs diferentes para o mesmo nome
            // não podem aumentar artificialmente o total esperado.
            const combinationKey = `${bimestre.numero}|${normalizeCatalogKey(eixo.text)}`;
            if (visited.has(combinationKey)) continue;

            const combinationStart = 5 + (((bimestreIndex + (eixoIndex / eixos.length)) / totalBimestres) * 86);
            progress.update(
              `Salvando ${bimestre.text} • ${eixo.text}...`,
              combinationStart,
              `Etapa ${bimestreIndex + 1} de ${totalBimestres} bimestres • ${visited.size} combinação(ões) concluída(s).`
            );
            const eixoOk = await window.SIAPEixo?.selectEixo?.(eixo, { timeout: 18000, remember: false });
            if (!eixoOk) throw new Error(`Não foi possível abrir o eixo ${eixo.text}.`);

            let current = await waitForCatalogCombination(bimestre, eixo);
            if (getCoverageKey(current) !== coverageKey) {
              throw new Error('A série ou a disciplina mudou durante o cadastro.');
            }

            if (window.SIAPMatrizSaeb?.isAvailable?.()) {
              const matrixProgress = 5 + (((bimestreIndex + ((eixoIndex + 0.5) / eixos.length)) / totalBimestres) * 86);
              progress.update(
                `Lendo Matriz SAEB de ${bimestre.text} • ${eixo.text}...`,
                matrixProgress,
                'A página está respondendo normalmente. Continue aguardando.'
              );
              await window.SIAPMatrizSaeb?.getAllMatrizLinks?.();
              current = await waitForCatalogCombination(bimestre, eixo);
            }

            const response = await syncCurrentCatalog({
              context: current,
              force: true,
              silent: false,
              fullScan: true
            });
            if (!response?.ok) {
              throw new Error(response?.error || `Falha ao salvar ${eixo.text} / ${bimestre.text}.`);
            }

            visited.add(combinationKey);
            state.visited = Array.from(visited);
            state.totalHabilidades = Number(state.totalHabilidades || 0) + Number(response?.data?.habilidades || 0);
            state.totalConteudos = Number(state.totalConteudos || 0) + Number(response?.data?.conteudos || 0);
            state.totalMatrizSaeb = Number(state.totalMatrizSaeb || 0) + Number(response?.data?.matriz_saeb || 0);
            writeFullScanState(state);

            const combinationDone = 5 + (((bimestreIndex + ((eixoIndex + 1) / eixos.length)) / totalBimestres) * 86);
            progress.update(
              `${bimestre.text} • ${eixo.text} concluído.`,
              combinationDone,
              `${visited.size} combinação(ões) de eixo e bimestre salva(s).`
            );
          }

          completedBimestres.add(bimestreKey);
          state.completedBimestres = Array.from(completedBimestres);
          writeFullScanState(state);
        }

        if (!visited.size) throw new Error('Nenhuma combinação de eixo e bimestre pôde ser cadastrada.');

        progress.update(
          'Confirmando o cadastro no banco de dados...',
          94,
          `${visited.size} combinação(ões) concluída(s). Falta apenas a confirmação final.`
        );
        const finishResponse = await callCatalogEndpoint({
          action: 'concluir_varredura',
          versao_extensao: CATALOG_VERSION,
          contexto: base,
          total_combinacoes: visited.size
        });

        progress.update('Restaurando o bimestre e o eixo anteriores...', 97, 'O cadastro já foi salvo. Organizando a tela para continuar.');
        await restoreCatalogSelection(state);
        window.__SIAP_CATALOG_SCAN_ACTIVE__ = false;
        window.SIAPBimestre?.rememberCurrentBimestre?.();
        window.SIAPEixo?.rememberCurrentEixo?.();
        clearFullScanState(coverageKey);

        const totals = finishResponse?.data || {};
        progress.success(
          `${Number(totals.total_habilidades || state.totalHabilidades || 0)} registros de habilidades foram salvos em ` +
          `${Number(totals.total_combinacoes || visited.size)} combinações de eixo e bimestre, com ` +
          `${Number(totals.total_matriz_saeb || state.totalMatrizSaeb || 0)} itens da Matriz SAEB.`
        );
        return finishResponse;
      } catch (err) {
        try {
          await callCatalogEndpoint({
            action: 'falhar_varredura',
            versao_extensao: CATALOG_VERSION,
            contexto: base,
            mensagem: err?.message || String(err)
          });
        } catch (_) {}

        await restoreCatalogSelection(state);
        window.__SIAP_CATALOG_SCAN_ACTIVE__ = false;
        window.SIAPBimestre?.rememberCurrentBimestre?.();
        window.SIAPEixo?.rememberCurrentEixo?.();
        clearFullScanState(coverageKey);
        progress.fail(err?.message || String(err));
        window.SIAPLogger?.log?.(`[Catálogo SIAP] Varredura interrompida: ${err?.message || err}`);
        return { ok: false, error: err?.message || String(err) };
      } finally {
        catalogFullScanInProgress = false;
        if (window.__SIAP_CATALOG_SCAN_ACTIVE__) window.__SIAP_CATALOG_SCAN_ACTIVE__ = false;
      }
    })().finally(() => {
      catalogFullScanPromise = null;
    });

    return catalogFullScanPromise;
  }

  function startCatalogSync() {
    if (catalogWatcherStarted) return;
    catalogWatcherStarted = true;
    setTimeout(() => {
      ensureFullCatalogRegistration().catch(err => {
        window.SIAPLogger?.log?.(`[Catálogo SIAP] Falha ao verificar o cadastro: ${err?.message || err}`);
      });
    }, 1200);
  }

  async function findHabilidadeLocations(habilidade, context = null) {
    const current = context || window.SIAPContext?.getCurrentContext?.() || {};
    const texto = normalizeCatalogText(
      typeof habilidade === 'string'
        ? habilidade
        : (habilidade?.texto || habilidade?.descricao || '')
    );
    const codigo = normalizeCatalogText(
      typeof habilidade === 'object' && habilidade
        ? (habilidade.codigo || '')
        : extractHabilidadeCode(texto)
    );
    const siapId = normalizeCatalogText(
      typeof habilidade === 'object' && habilidade ? (habilidade.siap_id || '') : ''
    );

    if (!texto && !codigo && !siapId) return [];

    try {
      const response = await callCatalogEndpoint({
        action: 'find_habilidade',
        contexto: {
          serie: normalizeCatalogText(current.serie || current.turma || ''),
          disciplina: normalizeCatalogText(current.disciplina || ''),
          eixo: normalizeCatalogText(current.eixo || ''),
          eixo_siap_id: normalizeCatalogText(current.eixoSiapId || ''),
          bimestre: Number(current.bimestre || 0)
        },
        habilidade: {
          siap_id: siapId,
          codigo,
          texto
        }
      });

      const locations = response?.data?.locations;
      return Array.isArray(locations) ? locations : [];
    } catch (err) {
      window.SIAPLogger?.log?.(`[Catálogo SIAP] Consulta da habilidade falhou: ${err?.message || err}`);
      return [];
    }
  }

  async function findConteudoLocations(conteudo, context = null) {
    const current = context || window.SIAPContext?.getCurrentContext?.() || {};
    const texto = normalizeCatalogText(
      typeof conteudo === 'string'
        ? conteudo
        : (conteudo?.texto || '')
    );
    const siapId = normalizeCatalogText(
      typeof conteudo === 'object' && conteudo ? (conteudo.siap_id || '') : ''
    );

    if (!texto && !siapId) return [];

    try {
      const response = await callCatalogEndpoint({
        action: 'find_conteudo',
        contexto: {
          serie: normalizeCatalogText(current.serie || current.turma || ''),
          disciplina: normalizeCatalogText(current.disciplina || ''),
          eixo: normalizeCatalogText(current.eixo || ''),
          eixo_siap_id: normalizeCatalogText(current.eixoSiapId || ''),
          bimestre: Number(current.bimestre || 0)
        },
        conteudo: {
          siap_id: siapId,
          texto
        }
      });

      const locations = response?.data?.locations;
      return Array.isArray(locations) ? locations : [];
    } catch (err) {
      window.SIAPLogger?.log?.(`[Catálogo SIAP] Consulta do conteúdo falhou: ${err?.message || err}`);
      return [];
    }
  }

  async function resolveInstructionFromCatalog(instruction, context = null) {
    const texto = normalizeCatalogText(instruction);
    if (!texto) {
      return { habilidades: [], conteudos: [] };
    }

    const current = context || window.SIAPContext?.getCurrentContext?.() || {};

    try {
      const response = await callCatalogEndpoint({
        action: 'resolve_instruction',
        contexto: {
          serie: normalizeCatalogText(current.serie || current.turma || ''),
          disciplina: normalizeCatalogText(current.disciplina || ''),
          eixo: normalizeCatalogText(current.eixo || ''),
          eixo_siap_id: normalizeCatalogText(current.eixoSiapId || ''),
          bimestre: Number(current.bimestre || 0)
        },
        instrucao: texto
      });

      return {
        habilidades: Array.isArray(response?.data?.habilidades) ? response.data.habilidades : [],
        conteudos: Array.isArray(response?.data?.conteudos) ? response.data.conteudos : [],
        contextoAlvo: (response?.data?.contexto_alvo && typeof response.data.contexto_alvo === 'object')
          ? response.data.contexto_alvo
          : null
      };
    } catch (err) {
      window.SIAPLogger?.log?.(`[Catálogo SIAP] Não foi possível confirmar a instrução agora: ${err?.message || err}`);
      return { habilidades: [], conteudos: [] };
    }
  }

  function buildTreeSection(context = {}) {
    const tree = context.arvoreObjetivosConteudos || {};
    const habilidades = Array.isArray(tree.habilidadesDisponiveis)
      ? tree.habilidadesDisponiveis.filter(Boolean)
      : [];
    const conteudos = Array.isArray(tree.conteudosDisponiveis)
      ? tree.conteudosDisponiveis.filter(Boolean)
      : [];
    const catalogo = Array.isArray(context.conteudosCatalogo)
      ? context.conteudosCatalogo
      : (Array.isArray(tree.conteudosCatalogo) ? tree.conteudosCatalogo : []);
    const grupos = [...new Set(
      catalogo
        .filter(item => item && !item.selecionavel)
        .map(item => normalizeCatalogText(item.texto || ''))
        .filter(Boolean)
    )];

    const listaGrupos = grupos.length
      ? grupos.map(g => `- "${g}"`).join('\n')
      : '- Nenhum grupo de conteúdo disponível';
    const listaConteudos = conteudos.length
      ? conteudos.map(f => `- "${f}"`).join('\n')
      : '- Nenhum conteúdo clicável disponível';
    const listaHabilidades = habilidades.length
      ? habilidades.map(h => `- "${h}"`).join('\n')
      : '- Nenhuma habilidade disponível';

    return `Contexto da árvore visível no SIAP (Objetivos de Conhecimentos / Conteúdos):
- Árvore encontrada: ${tree.encontrado ? 'sim' : 'não'}
- Total de habilidades clicáveis: ${habilidades.length}
- Total de conteúdos clicáveis: ${conteudos.length}

**GRUPOS DE CONTEÚDO (somente contexto; nunca retorne um grupo em "conteudos"):**
${listaGrupos}

**CONTEÚDOS CLICÁVEIS (retorne em "conteudos" APENAS textos exatos desta lista):**
${listaConteudos}

**HABILIDADES CLICÁVEIS:**
${listaHabilidades}`;
  }

  function findLeafForContentGroup(texto, context = {}) {
    const requested = window.SIAPUtils?.normalizeCompare(texto) || String(texto || '').toLowerCase();
    if (!requested) return '';

    const tree = context.arvoreObjetivosConteudos || {};
    const catalogo = Array.isArray(context.conteudosCatalogo)
      ? context.conteudosCatalogo
      : (Array.isArray(tree.conteudosCatalogo) ? tree.conteudosCatalogo : []);
    if (!catalogo.length) return '';

    const byId = new Map(catalogo.map(item => [String(item?.siap_id || ''), item]));
    const group = catalogo.find(item => {
      if (!item || item.selecionavel) return false;
      const normalized = window.SIAPUtils?.normalizeCompare(item.texto || '') || String(item.texto || '').toLowerCase();
      return normalized === requested;
    });
    if (!group) return '';

    const groupId = String(group.siap_id || '');
    const leaf = catalogo
      .filter(item => item && item.selecionavel)
      .sort((a, b) => Number(a.ordem || 0) - Number(b.ordem || 0))
      .find(item => {
        let parentId = String(item.pai_siap_id || '');
        const visited = new Set();
        while (parentId && !visited.has(parentId)) {
          if (parentId === groupId) return true;
          visited.add(parentId);
          parentId = String(byId.get(parentId)?.pai_siap_id || '');
        }
        return false;
      });

    return normalizeCatalogText(leaf?.texto || '');
  }



  function isMatrizSaebContextDisponivel(context = {}) {
    const matriz = context.matrizSaeb || {};
    const folhas = Array.isArray(matriz.folhas) ? matriz.folhas.filter(Boolean) : [];

    // Só considera Matriz SAEB disponível quando ela existe na árvore do SIAP
    // e possui ao menos uma folha/link real da Matriz SAEB.
    // Isso evita que a API gere Matriz SAEB quando apenas a caixa vazia
    // #conteudomatrizsaebs existe no HTML.
    return !!(matriz.disponivel && folhas.length > 0);
  }

  function buildMatrizSaebSection(context = {}) {
    const matriz = context.matrizSaeb || {};
    const folhas = Array.isArray(matriz.folhas) ? matriz.folhas : [];
    const grupos = Array.isArray(matriz.grupos) ? matriz.grupos : [];
    const listaFolhas = folhas.length ? folhas.map(f => `- "${f}"`).join('\n') : '- Nenhum item disponível';
    const listaGrupos = grupos.length ? grupos.map(g => `- "${g}"`).join('\n') : '- Nenhum grupo disponível';

    if (!isMatrizSaebContextDisponivel(context)) {
      return `Matriz SAEB: não disponível na árvore desta tela. Não gere o campo "matrizSaeb" ou retorne "matrizSaeb": [].`;
    }

    return `Matriz SAEB disponível nesta tela: SIM.

**REGRA OBRIGATÓRIA DA MATRIZ SAEB:**
- Como a Matriz SAEB apareceu na tela, cada aula DEVE trazer o campo "matrizSaeb".
- O campo "matrizSaeb" deve conter exatamente 1 item escolhido APENAS da lista de itens disponíveis abaixo.
- Não invente item de Matriz SAEB.
- Selecione o item mais coerente com a habilidade, conteúdo, disciplina e turma.

**GRUPOS DA MATRIZ SAEB:**
${listaGrupos}

**ITENS/FOLHAS DA MATRIZ SAEB DISPONÍVEIS:**
${listaFolhas}`;
  }

  function buildBatchSection(context = {}) {
    const batchInfo = context.batchInfo;
    if (!batchInfo || !Number(batchInfo.totalRequested)) return '';

    const totalRequested = Math.max(1, Number(batchInfo.totalRequested) || 1);
    const startIndex = Math.max(1, Number(batchInfo.startIndex) || 1);
    const endIndex = Math.max(startIndex, Number(batchInfo.endIndex) || startIndex);
    const batchNumber = Math.max(1, Number(batchInfo.batchNumber) || 1);
    const batchCount = Math.max(batchNumber, Number(batchInfo.batchCount) || batchNumber);
    const previousLessons = Array.isArray(batchInfo.previousLessons)
      ? batchInfo.previousLessons.slice(-30)
      : [];

    const previousSummary = previousLessons.length
      ? previousLessons.map((lesson) => {
          const numero = Math.max(1, Number(lesson?.numero) || 1);
          const titulo = String(lesson?.titulo || '').trim().slice(0, 160);
          const conteudos = Array.isArray(lesson?.conteudos)
            ? lesson.conteudos.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 2).join(' | ')
            : '';
          const habilidades = Array.isArray(lesson?.habilidades)
            ? lesson.habilidades.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 2).join(' | ')
            : '';

          return `- Aula ${numero}: título="${titulo || '(sem título)'}"; conteúdos="${conteudos || '(não informado)'}"; habilidades="${habilidades || '(não informada)'}"`;
        }).join('\n')
      : '- Nenhuma aula anterior: este é o primeiro lote.';

    return `
**CONTINUIDADE DA GERAÇÃO EM LOTES:**
- Este é o lote ${batchNumber} de aproximadamente ${batchCount}.
- Gere somente as aulas ${startIndex} a ${endIndex}, dentro de um total solicitado de ${totalRequested} aulas.
- Mantenha uma progressão coerente em relação às aulas já geradas.
- Não repita a mesma combinação de título, conteúdo, habilidade, metodologia e avaliação das aulas anteriores.
- O resumo abaixo serve apenas para evitar repetições. Os conteúdos e habilidades da nova resposta continuam limitados às listas válidas do SIAP.

**RESUMO DAS AULAS JÁ GERADAS:**
${previousSummary}
`;
  }

  function canonicalResolvedHabilidade(item = {}) {
    const codigo = normalizeCatalogText(item.codigo || item.solicitada || '');
    const descricao = normalizeCatalogText(item.descricao || '');
    if (!codigo) return descricao;
    if (extractHabilidadeCode(descricao).toLocaleUpperCase('pt-BR') === codigo.toLocaleUpperCase('pt-BR')) {
      return descricao;
    }
    return descricao ? `(${codigo}) ${descricao}` : codigo;
  }

  function buildResolvedInstructionSection(context = {}) {
    const resolution = context.instructionResolution || {};
    const habilidades = Array.isArray(resolution.habilidades) ? resolution.habilidades : [];
    const conteudos = Array.isArray(resolution.conteudos) ? resolution.conteudos : [];
    const habilidadesExatas = habilidades.filter(item => item && item.encontrada);
    const habilidadesAusentes = habilidades.filter(item => item && !item.encontrada);
    const contextoAlvo = (resolution.contextoAlvo && typeof resolution.contextoAlvo === 'object')
      ? resolution.contextoAlvo
      : null;

    if (!habilidades.length && !conteudos.length && !contextoAlvo) return '';

    const listaHabilidades = habilidadesExatas.length
      ? habilidadesExatas.map(item => {
          const caminho = item.locations?.[0]?.caminho_siap || '';
          return `- Código pedido: ${item.solicitada || item.codigo} | RETORNO OBRIGATÓRIO: "${canonicalResolvedHabilidade(item)}"${caminho ? ` | caminho confirmado: ${caminho}` : ''}`;
        }).join('\n')
      : '- Nenhuma habilidade explícita foi confirmada.';
    const listaAusentes = habilidadesAusentes.length
      ? habilidadesAusentes.map(item => `- ${item.solicitada || item.codigo}`).join('\n')
      : '- Nenhum código explícito ficou sem correspondência.';
    const listaConteudos = conteudos.length
      ? conteudos.map(item => {
          const caminho = item.locations?.[0]?.caminho_siap || '';
          const origem = String(item?.origem || 'conteudo_exato');
          const correlato = origem === 'correlato_catalogo';
          const score = correlato && item?.score != null ? ` | correlação: ${Math.round(Number(item.score) || 0)}%` : '';
          const tipo = correlato ? 'CORRELATO REAL DO SIAP' : 'CONTEÚDO EXATO DO SIAP';
          return `- ${tipo} — RETORNO OBRIGATÓRIO: "${normalizeCatalogText(item.texto || '')}"${score}${caminho ? ` | caminho confirmado: ${caminho}` : ''}`;
        }).join('\n')
      : '- Nenhum conteúdo real suficientemente correlato foi encontrado no catálogo.';

    const alvoSection = contextoAlvo
      ? `
**TEMA/EIXO EXPLICITAMENTE PEDIDO PELO USUÁRIO — PRIORIDADE ABSOLUTA:**
- Eixo/tema confirmado no catálogo: "${normalizeCatalogText(contextoAlvo.eixo || '')}"
- Bimestres onde esse eixo existe: ${(Array.isArray(contextoAlvo.bimestres) ? contextoAlvo.bimestres : []).join(', ') || '-'}
- CONTEÚDOS REAIS PERMITIDOS:
${(Array.isArray(contextoAlvo.conteudos) && contextoAlvo.conteudos.length)
  ? contextoAlvo.conteudos.map(c => `  - "${normalizeCatalogText(c)}"`).join('\n')
  : '  - Nenhum conteúdo clicável encontrado'}
- HABILIDADES REAIS DISPONÍVEIS:
${(Array.isArray(contextoAlvo.habilidades) && contextoAlvo.habilidades.length)
  ? contextoAlvo.habilidades.map(h => `  - "${normalizeCatalogText(h)}"`).join('\n')
  : '  - Nenhuma habilidade encontrada'}

REGRA: o eixo acima foi extraído do PROMPT digitado pelo usuário e tem prioridade sobre o eixo atualmente aberto na tela.
`
      : '';

    return `
${alvoSection}
**ITENS EXPLÍCITOS CONFIRMADOS NO CATÁLOGO COMPLETO DA SÉRIE:**

Habilidades encontradas pelo código exato:
${listaHabilidades}

Conteúdos reais confirmados no catálogo (exatos ou correlatos):
${listaConteudos}

Códigos de habilidade pedidos, mas ausentes do banco:
${listaAusentes}

**PRIORIDADE ABSOLUTA DOS ITENS CONFIRMADOS:**
- Todo item marcado como RETORNO OBRIGATÓRIO deve ser usado exatamente como está escrito.
- Um CORRELATO REAL DO SIAP já foi escolhido entre os conteúdos existentes no banco; nunca substitua por texto inventado.
- Não troque um código de habilidade confirmado nem um conteúdo confirmado por item semelhante, mais amplo, mais curto ou presente na árvore visível.
- O catálogo completo já confirmou o caminho de eixo e bimestre; por isso, um item confirmado continua válido mesmo que não apareça na árvore visível neste momento.
- Somente para um código listado como ausente do banco é permitido escolher a habilidade semanticamente mais próxima dentre as opções disponíveis.
- Se houver apenas uma habilidade ou um conteúdo confirmado e o pedido abranger várias aulas, mantenha esse item em todas elas, salvo quando a instrução indicar aulas específicas.
    `;
  }

  function buildRevisaSection(context = {}) {
    const revisa = context.revisa;
    if (!revisa || !revisa.material || !revisa.sequencia) return '';

    const distribution = Array.isArray(revisa.distribuicao) ? revisa.distribuicao : [];
    const batchInfo = context.batchInfo || null;
    const startIndex = batchInfo ? Math.max(1, Number(batchInfo.startIndex) || 1) : 1;
    const endIndex = batchInfo
      ? Math.max(startIndex, Number(batchInfo.endIndex) || startIndex)
      : Math.max(startIndex, distribution.length || Number(context?.qtdAulas || 1));
    const currentDistribution = distribution.filter(item => {
      const lesson = Number(item?.aula || 0);
      return lesson >= startIndex && lesson <= endIndex;
    });

    const pageNumbers = new Set();
    for (const item of currentDistribution) {
      for (const page of (Array.isArray(item?.paginas) ? item.paginas : [])) {
        const number = Number(page);
        if (Number.isFinite(number) && number > 0) pageNumbers.add(number);
      }
    }

    const pages = (Array.isArray(revisa.paginas) ? revisa.paginas : [])
      .filter(page => !pageNumbers.size || pageNumbers.has(Number(page?.numero_pdf || 0)))
      .sort((a, b) => Number(a?.numero_pdf || 0) - Number(b?.numero_pdf || 0));

    const distributionText = currentDistribution.length
      ? currentDistribution.map(item => {
          const activities = Array.isArray(item?.atividades) ? item.atividades : [];
          const details = activities.map(activity => {
            const title = normalizeCatalogText(activity?.titulo || '');
            const instructions = normalizeCatalogText(activity?.instrucoes || '');
            const references = (Array.isArray(activity?.referencias) ? activity.referencias : [])
              .map(reference => normalizeCatalogText(reference?.codigo || reference?.texto || ''))
              .filter(Boolean);
            return [
              `atividade ${normalizeCatalogText(activity?.numero || '')}${title ? ` (${title})` : ''}`,
              instructions ? `orientação: ${instructions}` : '',
              references.length ? `referências: ${references.join(' | ')}` : ''
            ].filter(Boolean).join(' — ');
          }).join('; ');
          const pagesLabel = (Array.isArray(item?.paginas) ? item.paginas : []).join(', ');
          return `- Aula ${Number(item?.aula || 0)}: ${details || normalizeCatalogText(item?.rotulo || 'trecho selecionado')} | páginas ${pagesLabel || '-'}`;
        }).join('\n')
      : '- Use o trecho selecionado de forma progressiva entre as aulas solicitadas.';

    let usedChars = 0;
    const maxPageChars = 70000;
    const pagesTextParts = [];
    for (const page of pages) {
      if (usedChars >= maxPageChars) break;
      const raw = String(page?.texto || '').trim();
      if (!raw) continue;
      const remaining = Math.max(0, maxPageChars - usedChars);
      const text = raw.slice(0, remaining);
      usedChars += text.length;
      pagesTextParts.push(`\n### Página ${Number(page?.numero_pdf || 0)}\n${text}`);
    }
    const pagesText = pagesTextParts.length
      ? pagesTextParts.join('\n')
      : '\n- O trecho não possui texto de página cadastrado.';

    const usageMode = String(revisa.modo_uso || 'principal');
    const usageRule = usageMode === 'apoio'
      ? '- Use o Revisa como apoio obrigatório da aula, combinando-o com outras estratégias pedagógicas coerentes.'
      : usageMode === 'combinado'
        ? '- Combine obrigatoriamente o Revisa com as orientações adicionais do professor, sem ignorar nenhum dos dois.'
        : '- O Revisa é a sequência principal: organize cada aula em torno das atividades indicadas para ela.';

    const revisaSeriesLabel = normalizeCatalogText(revisa.material?.serie_rotulo || '')
      || `${Number(revisa.material?.serie_ano || 0)}º ano`;

    return `
**PLANEJAR COM REVISA — ATIVADO:**
- Material: ${normalizeCatalogText(revisa.material?.titulo || '')}
- Série/Bimestre: ${revisaSeriesLabel} • ${Number(revisa.material?.bimestre || 0)}º bimestre
- Disciplina: ${normalizeCatalogText(revisa.componente?.disciplina || context.disciplina || '')}
- Bloco: ${normalizeCatalogText(revisa.bloco?.titulo || '')}
- Sequência: ${normalizeCatalogText(revisa.sequencia?.nome || '')}${revisa.sequencia?.titulo ? ` — ${normalizeCatalogText(revisa.sequencia.titulo)}` : ''}
- Referência do trecho: ${normalizeCatalogText(revisa.referencia || '')}
${usageRule}

**DISTRIBUIÇÃO OBRIGATÓRIA DAS ATIVIDADES:**
${distributionText}

**REGRAS DO REVISA:**
- Respeite a distribuição acima; não troque uma atividade de aula nem pule a ordem selecionada.
- Descreva na metodologia o uso real das atividades, textos, questões, imagens, gráficos ou produções presentes nas páginas indicadas.
- Inclua ao final da metodologia a referência exata: "${normalizeCatalogText(revisa.referencia || '')}".
- Não invente enunciados, páginas ou atividades que não apareçam no trecho recuperado.
- Nunca copie gabaritos, respostas prontas ou sugestões de solução para a metodologia, a avaliação ou o conteúdo trabalhado. Na edição Professor, use essas informações apenas para compreender a proposta pedagógica.
- Habilidades, conteúdos do SIAP e Matriz SAEB continuam sujeitos às listas e aos itens exatos confirmados no catálogo da série.

**TEXTO DAS PÁGINAS NECESSÁRIAS NESTE LOTE:**
${pagesText}
`;
  }

  function buildPrompt(qtdAulas, contentText, context = {}) {
    const disciplina = context.disciplina || 'Não informada';
    const turma = context.turma || 'Não informada';
    const treeSection = buildTreeSection(context);
    const matrizSaebSection = buildMatrizSaebSection(context);
    const batchSection = buildBatchSection(context);
    const resolvedInstructionSection = buildResolvedInstructionSection(context);
    const revisaSection = buildRevisaSection(context);

    const hasUserInstruction = contentText && contentText.trim().length > 0 &&
                               !contentText.includes('Sem instruções específicas. Gere os planejamentos utilizando APENAS os conteúdos');

    const customContentEnabled = !!(context.generationOptions && context.generationOptions.customContentEnabled);
    const customContentRule = customContentEnabled
      ? `
13. Como a opção "Gerar conteúdo personalizado no campo de texto livre" está marcada, cada aula DEVE trazer também o campo "conteudoPersonalizado".
14. O campo "conteudoPersonalizado" deve ser um texto curto, pronto para preencher o textarea livre do SIAP, descrevendo o que os alunos irão compreender/desenvolver nesta aula.
15. Use linguagem pedagógica simples, em uma frase, no estilo: "Nesta aula, os alunos irão...".`
      : `
13. Como a opção "Gerar conteúdo personalizado no campo de texto livre" NÃO está marcada, não gere o campo "conteudoPersonalizado".`;
    const customContentFormatLine = customContentEnabled
      ? '      "conteudoPersonalizado": "Nesta aula, os alunos irão...",\n'
      : '';

    let instructionBlock = '';
    if (!hasUserInstruction) {
      instructionBlock = `
**MODO AUTOMÁTICO (sem instruções do usuário):**
- Você DEVE gerar os planejamentos utilizando EXCLUSIVAMENTE os conteúdos e habilidades listados na árvore acima.
- Selecione uma combinação lógica e progressiva de habilidades e CONTEÚDOS CLICÁVEIS.
- Os grupos servem somente para compreender a organização; nunca os devolva no campo "conteudos".
- Varie os temas entre as aulas, mas sempre dentro do que está disponível na árvore.
- Não invente temas, disciplinas ou conteúdos fora da lista fornecida.
`;
    } else {
      instructionBlock = `
**PROMPT DO USUÁRIO — ORDEM PRINCIPAL E OBRIGATÓRIA:**
"""
${contentText}
"""
- O texto acima é um PROMPT/comando do usuário, não uma observação opcional.
- Cumpra o pedido literalmente sempre que ele for compatível com itens reais do catálogo.
- Se o usuário disser "Gere 4 aulas sobre o conteúdo: Lutas", TODAS as 4 aulas devem tratar de Lutas.
- O tema/eixo explicitamente pedido tem prioridade sobre o eixo que estiver aberto na tela do SIAP.
- A árvore visível serve apenas como fallback quando o catálogo não tiver identificado um tema/eixo explícito no prompt.
- Quando a instrução pedir uma habilidade por código ou indicar um conteúdo, preserve exatamente o item confirmado no catálogo completo da série.
- Só escolha item semelhante quando o item solicitado não tiver sido encontrado no banco.
`;
    }

    return `Você é um especialista em planejamento de aulas.

**REGRAS OBRIGATÓRIAS:**
1. Gere exatamente ${qtdAulas} planejamentos de aula.\n1.1. O PROMPT digitado pelo usuário é a ordem temática principal. Nunca o substitua silenciosamente pelo eixo atualmente aberto na tela.
2. Os campos "conteudos" e "habilidades" DEVEM conter os itens exatos confirmados no catálogo completo ou, quando não houver pedido explícito confirmado, textos existentes nas listas fornecidas abaixo.
3. NUNCA invente conteúdos ou habilidades. Só use correspondência semelhante quando o item solicitado estiver explicitamente marcado como ausente do banco.
4. Para "conteudos": use somente uma folha da lista CONTEÚDOS CLICÁVEIS. Nunca retorne o nome de um grupo.
5. Para "habilidades": um código solicitado e confirmado no catálogo completo tem prioridade sobre a árvore visível. Sem pedido confirmado, use textos da árvore (ex.: códigos como (EF02LP01)).
6. Responda SOMENTE em JSON válido, sem explicações fora do JSON.
7. Sempre leia as habilidades presentes e conteúdos mostrados na tela.
8. Para "habilidades": use itens da lista HABILIDADES DISPONÍVEIS ou os itens exatos marcados como RETORNO OBRIGATÓRIO no catálogo completo.
9. Selecione apenas uma habilidade e um conteúdo por aula.
10. Selecione apenas conteúdos que já existam, não crie um novo.
11. Se a seção Matriz SAEB abaixo indicar que está disponível, é OBRIGATÓRIO retornar o campo "matrizSaeb" com 1 item exato da lista da Matriz SAEB em cada aula. Se indicar que NÃO está disponível, NÃO gere Matriz SAEB.
12. Quando a seção Planejar com Revisa estiver ativada, respeite obrigatoriamente a distribuição de atividades e páginas de cada aula.${customContentRule}

Contexto da turma:
- Disciplina: ${disciplina}
- Turma/Série: ${turma}

${treeSection}

${matrizSaebSection}

${batchSection}

${resolvedInstructionSection}

${revisaSection}

${instructionBlock}

**FORMATO OBRIGATÓRIO:**
{
  "aulas": [
    {
      "titulo": "string curta",
      "habilidades": ["(EF02LP01) ...", ...],
      "conteudos": ["string exata da lista", ...],
      "matrizSaeb": ["string exata da lista da Matriz SAEB quando disponível"],
${customContentFormatLine}      "metodologia": "texto completo",
      "avaliacao": "texto completo"
    }
  ]
}`;
  }

  function extractJson(text) {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) {
      throw new Error('Não foi possível extrair JSON da resposta.');
    }
    return text.slice(start, end + 1);
  }

  function validateAndFixPlan(plan, context) {
    if (!plan || !Array.isArray(plan.aulas)) {
      window.SIAPLogger?.log('[API] Plano inválido recebido (sem "aulas"), retornando estrutura vazia.');
      return { aulas: [] };
    }

    const todosConteudosValidos = Array.isArray(context.arvoreObjetivosConteudos?.conteudosDisponiveis)
      ? context.arvoreObjetivosConteudos.conteudosDisponiveis.filter(Boolean)
      : [];
    const resolution = context.instructionResolution || {};
    const habilidadesExatas = (Array.isArray(resolution.habilidades) ? resolution.habilidades : [])
      .filter(item => item && item.encontrada)
      .map(item => ({
        codigo: normalizeCatalogText(item.codigo || item.solicitada || '').toLocaleUpperCase('pt-BR'),
        texto: canonicalResolvedHabilidade(item)
      }))
      .filter(item => item.codigo && item.texto);
    const conteudosExatos = (Array.isArray(resolution.conteudos) ? resolution.conteudos : [])
      .map(item => normalizeCatalogText(item?.texto || ''))
      .filter(Boolean);

    plan.aulas = plan.aulas.map((aula, aulaIndex) => {
      if (!aula || typeof aula !== 'object') aula = {};

      if (habilidadesExatas.length) {
        const habilidadeRetornada = (Array.isArray(aula.habilidades) ? aula.habilidades : [])
          .map(item => extractHabilidadeCode(item).toLocaleUpperCase('pt-BR'))
          .map(codigo => habilidadesExatas.find(item => item.codigo === codigo))
          .find(Boolean);
        const habilidadeObrigatoria = habilidadeRetornada || habilidadesExatas[aulaIndex % habilidadesExatas.length];
        aula.habilidades = [habilidadeObrigatoria.texto];
        window.SIAPLogger?.log?.(`[API] Habilidade explícita preservada: ${habilidadeObrigatoria.texto}`);
      }

      if (conteudosExatos.length) {
        const conteudoRetornado = (Array.isArray(aula.conteudos) ? aula.conteudos : [])
          .map(item => {
            const itemNorm = window.SIAPUtils?.normalizeCompare(item) || String(item).toLowerCase();
            return conteudosExatos.find(c =>
              (window.SIAPUtils?.normalizeCompare(c) || c.toLowerCase()) === itemNorm
            );
          })
          .find(Boolean);
        const conteudoObrigatorio = conteudoRetornado || conteudosExatos[aulaIndex % conteudosExatos.length];
        aula.conteudos = [conteudoObrigatorio];
        window.SIAPLogger?.log?.(`[API] Conteúdo explícito preservado: ${conteudoObrigatorio}`);
      } else if (todosConteudosValidos.length) {
        let conteudosCorrigidos = [];
        for (let item of (aula.conteudos || [])) {
          const itemNorm = window.SIAPUtils?.normalizeCompare(item) || String(item).toLowerCase();
          let encontrado = todosConteudosValidos.find(c =>
            window.SIAPUtils?.normalizeCompare(c) === itemNorm
          );
          if (!encontrado) {
            encontrado = todosConteudosValidos.find(c =>
              c.toLowerCase().includes(itemNorm) || itemNorm.includes(c.toLowerCase())
            );
          }
          if (!encontrado) {
            encontrado = findLeafForContentGroup(item, context);
            if (encontrado) {
              window.SIAPLogger?.log?.(`[API] Grupo convertido em conteúdo clicável do mesmo caminho: ${encontrado}`);
            }
          }
          if (encontrado) {
            conteudosCorrigidos.push(encontrado);
          } else if (window.SIAPConteudos?.safeSimilarityScore) {
            let bestText = '';
            let bestScore = 0;
            for (const candidate of todosConteudosValidos) {
              const score = Number(window.SIAPConteudos.safeSimilarityScore(item, candidate) || 0);
              if (score > bestScore) {
                bestScore = score;
                bestText = candidate;
              }
            }
            if (bestText && bestScore >= 50) conteudosCorrigidos.push(bestText);
          }
        }
        aula.conteudos = conteudosCorrigidos;
      }

      // Garantia final: toda aula precisa de ao menos 1 conteúdo clicável da
      // árvore do SIAP (mesmo padrão usado para habilidades e Matriz SAEB).
      // Sem isso, a árvore "Objetivos de Conhecimentos/ Conteúdos" fica vazia
      // na aula aplicada quando a IA retorna array vazio e o catálogo não
      // resolveu um conteúdo exato para esta aula.
      if (!Array.isArray(aula.conteudos) || !aula.conteudos.length) {
        if (todosConteudosValidos.length) {
          aula.conteudos = [todosConteudosValidos[aulaIndex % todosConteudosValidos.length]];
          window.SIAPLogger?.log?.(`[API] Conteúdo padrão da árvore atribuído: ${aula.conteudos[0]}`);
        } else if (conteudosExatos.length) {
          aula.conteudos = [conteudosExatos[aulaIndex % conteudosExatos.length]];
          window.SIAPLogger?.log?.(`[API] Conteúdo do catálogo atribuído como fallback: ${aula.conteudos[0]}`);
        }
      }

      const matriz = context.matrizSaeb || {};
      if (isMatrizSaebContextDisponivel(context)) {
        const matrizValidos = [...(matriz.folhas || [])].filter(Boolean);
        let matrizCorrigida = [];
        for (let item of (aula.matrizSaeb || [])) {
          const itemNorm = window.SIAPUtils?.normalizeCompare(item) || String(item).toLowerCase();
          let encontrado = matrizValidos.find(c => (window.SIAPUtils?.normalizeCompare(c) || String(c).toLowerCase()) === itemNorm);
          if (!encontrado && window.SIAPMatcher) {
            const best = window.SIAPMatcher.bestTextMatchAdvanced(item, matrizValidos, txt => txt);
            if (best && best.score > 60) encontrado = best.text;
          }
          if (encontrado) matrizCorrigida.push(encontrado);
        }
        if (!matrizCorrigida.length && matrizValidos.length) matrizCorrigida = [matrizValidos[0]];
        aula.matrizSaeb = matrizCorrigida.slice(0, 1);
      } else {
        aula.matrizSaeb = [];
      }

      return aula;
    });
    return plan;
  }

  async function callOpenAI(qtdAulas, contentText, _apiKeyIgnored, context = {}) {
    const requestedLessons = Math.max(1, Number(qtdAulas) || 1);
    const maxOutputTokens = Math.min(32000, Math.max(3500, requestedLessons * 900));
    const payload = {
      model: C.MODEL,
      temperature: 0.3,
      max_tokens: maxOutputTokens,
      messages: [
        { role: 'system', content: 'Você responde apenas JSON válido. Pedidos explícitos confirmados no catálogo são obrigatórios e têm prioridade sobre a árvore visível; somente itens ausentes do catálogo podem ser substituídos por semelhantes das listas.' },
        { role: 'user', content: buildPrompt(qtdAulas, contentText, context) }
      ]
    };

    if (!isMatrizSaebContextDisponivel(context)) {
      window.SIAPLogger?.log?.('[Matriz SAEB] Não enviada para API: não existe na árvore desta tela.');
    } else {
      window.SIAPLogger?.log?.('[Matriz SAEB] Enviada para API: existe na árvore desta tela.');
    }

    const token = getServerToken();
    if (!token) {
      throw new Error('Token da licença não encontrado. Recarregue a página e entre novamente.');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000);

    try {
      const response = await fetch(`${getServerApiBase()}/ai/generate.php`, {
        method: 'POST',
        mode: 'cors',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const rawText = await response.text();
      let json = null;
      try {
        json = rawText ? JSON.parse(rawText) : null;
      } catch (parseErr) {
        throw new Error(`Resposta inválida do servidor: ${rawText.slice(0, 300)}`);
      }

      if (!response.ok) {
        const message = json?.error?.message || json?.error || json?.message || `Erro HTTP ${response.status}`;
        const responseError = new Error(message);
        responseError.status = response.status;
        throw responseError;
      }

      const providerPayload = json?.data && typeof json.data === 'object' ? json.data : json;
      const firstChoice = providerPayload?.choices?.[0];
      if (firstChoice?.finish_reason === 'length') {
        const outputLimitError = new Error('A resposta ficou grande demais e foi interrompida pelo limite de saída.');
        outputLimitError.code = 'OUTPUT_LIMIT';
        throw outputLimitError;
      }

      let content = firstChoice?.message?.content;
      if (!content && typeof providerPayload?.output_text === 'string') {
        content = providerPayload.output_text;
      }
      if (!content && typeof providerPayload?.content === 'string') {
        content = providerPayload.content;
      }
      if (!content) {
        throw new Error('A API não retornou conteúdo.');
      }

      let parsed;
      try {
        parsed = JSON.parse(content);
      } catch (_firstParseError) {
        try {
          parsed = JSON.parse(extractJson(content));
        } catch (secondParseError) {
          const incompleteJsonError = new Error(
            `A resposta JSON da API veio incompleta: ${secondParseError?.message || secondParseError}`
          );
          incompleteJsonError.code = 'INCOMPLETE_JSON';
          throw incompleteJsonError;
        }
      }

      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Resposta da API não é um objeto JSON válido.');
      }

      if (context && context.arvoreObjetivosConteudos) {
        parsed = validateAndFixPlan(parsed, context);
      }

      if (!parsed || !Array.isArray(parsed.aulas)) {
        throw new Error('A resposta da API não contém o campo "aulas" (array).');
      }

      return parsed;
    } catch (err) {
      if (err?.name === 'AbortError') {
        throw new Error('Timeout na requisição da API (120 segundos).');
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  return {
    buildTreeSection,
    buildMatrizSaebSection,
    buildRevisaSection,
    isMatrizSaebContextDisponivel,
    buildPrompt,
    extractJson,
    callOpenAI,
    validateAndFixPlan,
    buildCatalogPayload,
    syncCurrentCatalog,
    scheduleCatalogSync,
    startCatalogSync,
    ensureFullCatalogRegistration,
    findHabilidadeLocations,
    findConteudoLocations,
    resolveInstructionFromCatalog,
    loadRevisaCatalog,
    prepareRevisaSelection,
    getRevisaReferenceInstruction,
    markRevisaProgress
  };
})();
