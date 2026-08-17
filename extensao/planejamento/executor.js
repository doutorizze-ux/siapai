window.SIAPExecutor = (() => {
  const C = window.SIAPConfig;
  const S = window.SIAPState;
  const U = window.SIAPUtils;
  const L = window.SIAPLogger;
  const A = window.SIAPApi;
  const H = window.SIAPHabilidades;
  const CT = window.SIAPConteudos;
  const V = window.SIAPValidation;
  const ST = window.SIAPStorage;
  const EIXO = window.SIAPEixo;
  const BIMESTRE = window.SIAPBimestre;
  const MS = window.SIAPMatrizSaeb;
  const MAX_AULAS_POR_LOTE = 10;
  const MAX_TENTATIVAS_POR_LOTE = 3;

  function isMatrizSaebRealmenteDisponivel(context = null) {
    try {
      const ctx = context?.matrizSaeb
        ? context.matrizSaeb
        : (MS && typeof MS.extractMatrizSaebContext === 'function' ? MS.extractMatrizSaebContext() : null);

      const folhas = Array.isArray(ctx?.folhas) ? ctx.folhas.filter(Boolean) : [];

      // A Matriz SAEB só vale quando aparece de verdade na árvore
      // e tem ao menos um link/folha real. A div #conteudomatrizsaebs
      // pode existir vazia no HTML e não deve ativar a matriz.
      return !!(ctx?.disponivel && folhas.length > 0);
    } catch (_) {
      return false;
    }
  }

  function removerMatrizSaebSeNaoDisponivel(aulas, context = null) {
    if (isMatrizSaebRealmenteDisponivel(context)) return aulas;
    if (!Array.isArray(aulas)) return aulas;

    const limpas = aulas.map((aula) => {
      if (!aula || typeof aula !== 'object') return aula;
      delete aula.matriz_saeb;
      delete aula.matrizSaeb;
      delete aula.matriz_saebs;
      delete aula.matrizSaebs;
      return aula;
    });

    L?.log?.('[Matriz SAEB] Removida do retorno porque não existe na árvore desta tela.');
    return limpas;
  }

  function normalizePlan(plan, index = 0) {
    const safePlan = (plan && typeof plan === 'object') ? plan : {};
    let revisa = null;
    if (safePlan.revisa && typeof safePlan.revisa === 'object') {
      try {
        revisa = JSON.parse(JSON.stringify(safePlan.revisa));
      } catch (_) {
        revisa = null;
      }
    }

    return {
      titulo: safePlan.titulo ? String(safePlan.titulo).trim() : `Aula ${index + 1}`,
      habilidades: Array.isArray(safePlan.habilidades)
        ? safePlan.habilidades.map(v => String(v).trim()).filter(Boolean)
        : [],
      conteudos: Array.isArray(safePlan.conteudos)
        ? safePlan.conteudos.map(v => String(v).trim()).filter(Boolean)
        : [],
      matrizSaeb: Array.isArray(safePlan.matrizSaeb)
        ? safePlan.matrizSaeb.map(v => String(v).trim()).filter(Boolean)
        : [],
      conteudoPersonalizado: safePlan.conteudoPersonalizado ? String(safePlan.conteudoPersonalizado).trim() : '',
      metodologia: safePlan.metodologia ? String(safePlan.metodologia).trim() : '',
      avaliacao: safePlan.avaliacao ? String(safePlan.avaliacao).trim() : '',
      revisa,
      __originalIndex: Number.isInteger(safePlan.__originalIndex) ? safePlan.__originalIndex : (index + 1)
    };
  }

  function normalizePlans(plans) {
    if (!Array.isArray(plans)) return [];
    return plans.map((plan, index) => normalizePlan(plan, index));
  }

  function attachRevisaMetadata(plans, revisa = null) {
    if (!Array.isArray(plans) || !revisa || !Array.isArray(revisa.distribuicao)) {
      return plans;
    }

    const materialId = Number(revisa?.material?.id || 0);
    const componenteId = Number(revisa?.componente?.id || 0);
    const blocoId = Number(revisa?.bloco?.id || 0);
    const sequenciaId = Number(revisa?.sequencia?.id || 0);
    const modoUso = String(revisa?.modo_uso || 'principal');
    const baseReference = String(revisa?.referencia || '').trim();

    return plans.map((plan, index) => {
      const lessonNumber = Number(plan?.__originalIndex || (index + 1));
      const distribution = revisa.distribuicao.find(item => Number(item?.aula || 0) === lessonNumber)
        || revisa.distribuicao[index]
        || null;
      if (!distribution) return plan;

      const activityIds = (Array.isArray(distribution.atividade_ids) ? distribution.atividade_ids : [])
        .map(Number)
        .filter(id => Number.isFinite(id) && id > 0);
      const pages = (Array.isArray(distribution.paginas) ? distribution.paginas : [])
        .map(Number)
        .filter(page => Number.isFinite(page) && page > 0);
      const label = String(distribution.rotulo || 'trecho selecionado').trim();
      const lessonReference = [
        String(revisa?.material?.titulo || '').trim(),
        String(revisa?.bloco?.titulo || '').trim(),
        String(revisa?.sequencia?.nome || '').trim(),
        label,
        pages.length ? `página${pages.length > 1 ? 's' : ''} ${pages.join(', ')}` : ''
      ].filter(Boolean).join(', ') || baseReference;

      const referenceSentence = `${modoUso === 'principal' ? 'Material principal' : 'Material de apoio'}: ${lessonReference}.`;
      const currentMethodology = String(plan?.metodologia || '').trim();
      const alreadyReferenced = lessonReference && currentMethodology.includes(lessonReference);

      return {
        ...plan,
        metodologia: alreadyReferenced
          ? currentMethodology
          : [currentMethodology, referenceSentence].filter(Boolean).join('\n\n'),
        revisa: {
          materialId,
          componenteId,
          blocoId,
          sequenciaId,
          atividadeIds: activityIds,
          paginas: pages,
          rotulo: label,
          referencia: lessonReference,
          modoUso
        }
      };
    });
  }

  function debugCurrentContext(context) {
    try {
      const tree = context?.arvoreObjetivosConteudos || {};
      L.log(`[DEBUG] Disciplina: ${context?.disciplina || '(vazia)'}`);
      L.log(`[DEBUG] Turma: ${context?.turma || '(vazia)'}`);
      L.log(`[DEBUG] Árvore encontrada: ${tree.encontrado ? 'sim' : 'não'}`);
      L.log(`[DEBUG] Total de grupos: ${Array.isArray(tree.grupos) ? tree.grupos.length : 0}`);
      L.log(`[DEBUG] Total de folhas: ${Array.isArray(tree.folhas) ? tree.folhas.length : 0}`);
      L.log(`[DEBUG] Total de habilidades disponíveis: ${Array.isArray(context?.habilidadesDisponiveis) ? context.habilidadesDisponiveis.length : 0}`);
      L.log(`[DEBUG] Total de conteúdos disponíveis: ${Array.isArray(context?.conteudosDisponiveis) ? context.conteudosDisponiveis.length : 0}`);
      L.log(`[DEBUG] Matriz SAEB disponível: ${isMatrizSaebRealmenteDisponivel(context) ? 'sim' : 'não'} | itens: ${Array.isArray(context?.matrizSaeb?.folhas) ? context.matrizSaeb.folhas.length : 0}`);
    } catch (err) {
      console.error('[SIAP DEBUG] Erro ao inspecionar contexto:', err);
    }
  }

  function debugApiResult(result) {
    try {
      const aulas = Array.isArray(result?.aulas) ? result.aulas : [];
      const totalInvalidas = Number(result?.validacao?.totalInvalidas || 0);
      L.log(`[DEBUG] Resultado da API: ${aulas.length} aula(s) válida(s), ${totalInvalidas} descartada(s).`);

      aulas.slice(0, 3).forEach((aula, idx) => {
        const habilidades = Array.isArray(aula?.habilidades) ? aula.habilidades.length : 0;
        const conteudos = Array.isArray(aula?.conteudos) ? aula.conteudos.length : 0;
        const matrizSaeb = Array.isArray(aula?.matrizSaeb) ? aula.matrizSaeb.length : 0;
        const personalizado = String(aula?.conteudoPersonalizado || '').trim();
        L.log(`[DEBUG] Aula válida ${idx + 1}: original=${aula?.__originalIndex || '?'} | título="${aula?.titulo || ''}" | habilidades=${habilidades} | conteúdos=${conteudos} | matrizSaeb=${matrizSaeb} | personalizado=${personalizado ? 'sim' : 'não'}`);
      });
    } catch (err) {
      console.error('[SIAP DEBUG] Erro ao inspecionar retorno da API:', err);
    }
  }

  function logDiscardedLessons(validacao) {
    const invalidas = Array.isArray(validacao?.invalidas) ? validacao.invalidas : [];
    if (!invalidas.length) return;

    L.log(`[DEBUG] ${invalidas.length} aula(s) descartada(s) por inconsistência.`);
    invalidas.forEach((item) => {
      L.log(`[DESCARTADA] Aula ${item.numero}: ${item.motivos.join(', ')}`);
    });
  }

  function setRunningState(running) {
    ST.setRunning(running);

    const buttons = ['#tm-gpt-generate', '#tm-gpt-apply', '#tm-gpt-auto', '#tm-gpt-stop'];
    for (const sel of buttons) {
      const btn = document.querySelector(sel);
      if (!btn) continue;

      if (sel === '#tm-gpt-stop') btn.disabled = !running && !ST.isAutoMode();
      else btn.disabled = !!running;
    }
  }

  function getLessonNumberValue() {
    const selector = C.SELECTORS.LESSON_NUMBER || '#cphFuncionalidade_cphCampos_txtNumeroAula';
    return String(document.querySelector(selector)?.value || '').trim();
  }

  function getSaveStrategyKey() {
    return C?.STORAGE_KEYS?.SAVE_STRATEGY || 'tm_gpt_save_strategy';
  }

  function getPreferredSaveStrategy() {
    try {
      const value = sessionStorage.getItem(getSaveStrategyKey()) || '';
      return value === 'legacy' || value === 'custom' ? value : '';
    } catch (_) {
      return '';
    }
  }

  function setPreferredSaveStrategy(strategy) {
    try {
      if (strategy === 'legacy' || strategy === 'custom') {
        sessionStorage.setItem(getSaveStrategyKey(), strategy);
      } else {
        sessionStorage.removeItem(getSaveStrategyKey());
      }
    } catch (_) {}
  }

  function getPendingLessonKey() {
    return 'tm_gpt_pending_previous_lesson';
  }

  function setPendingPreviousLessonNumber(value) {
    try {
      const v = String(value || '').trim();
      if (v) sessionStorage.setItem(getPendingLessonKey(), v);
      else sessionStorage.removeItem(getPendingLessonKey());
    } catch (_) {}
  }

  function getPendingPreviousLessonNumber() {
    try {
      return String(sessionStorage.getItem(getPendingLessonKey()) || '').trim();
    } catch (_) {
      return '';
    }
  }

  function clearPendingPreviousLessonNumber() {
    try {
      sessionStorage.removeItem(getPendingLessonKey());
    } catch (_) {}
  }

  function getPendingNextPlanIndexKey() {
    return 'tm_gpt_pending_next_plan_index';
  }

  function getPendingNextAutoModeKey() {
    return 'tm_gpt_pending_next_auto_mode';
  }

  function setPendingNextPlanIndex(index, autoMode) {
    try {
      const safeIndex = Number.isInteger(index) ? index : parseInt(String(index || ''), 10);
      if (!Number.isFinite(safeIndex) || safeIndex < 0) {
        sessionStorage.removeItem(getPendingNextPlanIndexKey());
        sessionStorage.removeItem(getPendingNextAutoModeKey());
        return;
      }
      sessionStorage.setItem(getPendingNextPlanIndexKey(), String(safeIndex));
      sessionStorage.setItem(getPendingNextAutoModeKey(), autoMode ? '1' : '0');
    } catch (_) {}
  }

  function getPendingNextPlanIndex() {
    try {
      const raw = sessionStorage.getItem(getPendingNextPlanIndexKey());
      if (raw == null || raw === '') return null;
      const parsed = parseInt(raw, 10);
      return Number.isFinite(parsed) ? parsed : null;
    } catch (_) {
      return null;
    }
  }

  function getPendingNextAutoMode() {
    try {
      return sessionStorage.getItem(getPendingNextAutoModeKey()) === '1';
    } catch (_) {
      return false;
    }
  }

  function clearPendingNextPlanIndex() {
    try {
      sessionStorage.removeItem(getPendingNextPlanIndexKey());
      sessionStorage.removeItem(getPendingNextAutoModeKey());
    } catch (_) {}
  }

  function commitPendingAdvanceState(currentLessonNumber = '') {
    const pendingIndex = getPendingNextPlanIndex();
    const previousLesson = getPendingPreviousLessonNumber();
    const lessonNow = String(currentLessonNumber || getLessonNumberValue() || '').trim();

    if (pendingIndex === null) return false;
    if (!previousLesson || !lessonNow || lessonNow === previousLesson) return false;

    const completedPlan = Array.isArray(S.generatedPlans) && pendingIndex > 0
      ? S.generatedPlans[pendingIndex - 1]
      : null;
    const completedContext = window.SIAPContext?.getCurrentContext?.() || {};
    const boundedIndex = Math.max(0, Math.min(pendingIndex, Array.isArray(S.generatedPlans) ? S.generatedPlans.length : pendingIndex));
    S.currentPlanIndex = boundedIndex;
    ST.setAutoMode(getPendingNextAutoMode());
    ST.saveState();
    window.SIAPUI?.renderPreview?.();
    clearPendingPreviousLessonNumber();
    clearPendingNextPlanIndex();
    if (completedPlan?.revisa && A && typeof A.markRevisaProgress === 'function') {
      Promise.resolve(A.markRevisaProgress(completedPlan, completedContext, previousLesson))
        .then(() => window.SIAPUI?.refreshRevisaCatalog?.({ force: true }))
        .catch((err) => L.log(`[Revisa] Não foi possível atualizar o indicador de progresso: ${err?.message || err}`));
    }
    L.log(`[DEBUG] Avanço confirmado após mudança real da aula. Índice atual agora é ${S.currentPlanIndex}. Aula visível: ${lessonNow}.`);
    return true;
  }

  function getLegacySaveNextButton() {
    return document.querySelector(C.SELECTORS.SAVE_NEXT_LEGACY || '#cphFuncionalidade_cphCampos_btnSalvarProximo');
  }

  function getCustomSaveNextButton() {
    return document.querySelector(C.SELECTORS.SAVE_NEXT_CUSTOM || '#siap_btn_salvar_abrir_proxima');
  }

  function getAnySaveNextButton() {
    // Fluxo padrão: sempre preferir o botão novo, que salva e abre a próxima aula.
    return getCustomSaveNextButton() || getLegacySaveNextButton() || document.querySelector(C.SELECTORS.SAVE_NEXT);
  }


  function getVisiblePlanningErrorText() {
    const candidates = Array.from(document.querySelectorAll('#painelMensagem, .flagMensagemErro, .mensagem.flagMensagemErro'));

    for (const el of candidates) {
      if (!el) continue;
      const style = window.getComputedStyle ? window.getComputedStyle(el) : null;
      const visible = !!(
        el.offsetParent !== null ||
        el.getClientRects().length > 0 ||
        (style && style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0')
      );
      if (!visible) continue;

      const text = U.normalizeText(el.innerText || el.textContent || '');
      if (text) return text;
    }

    return '';
  }

  function isMissingPlanningItemsErrorVisible() {
    const text = getVisiblePlanningErrorText();
    if (!text) return false;

    return (
      text.includes('a operação não pode ser efetuada') &&
      text.includes('um ou mais itens do planejamento não foram informados')
    );
  }

  async function waitForMissingPlanningItemsError(timeout = 6500) {
    const found = await U.waitUntil(() => isMissingPlanningItemsErrorVisible(), timeout, 250);
    return !!found;
  }

  function getPlanConteudosByIndex(index) {
    if (!Array.isArray(S.generatedPlans)) return [];
    if (index < 0 || index >= S.generatedPlans.length) return [];
    return normalizePlan(S.generatedPlans[index], index).conteudos || [];
  }

  function isSameConteudoText(a, b) {
    const na = U.normalizeCompare(a || '');
    const nb = U.normalizeCompare(b || '');
    return !!(na && nb && na === nb);
  }

  function conteudoExistsInList(texto, lista) {
    return (Array.isArray(lista) ? lista : []).some((item) => isSameConteudoText(texto, item));
  }

  function uniqueConteudos(textos) {
    const out = [];
    for (const texto of (Array.isArray(textos) ? textos : [textos])) {
      const value = String(texto || '').replace(/\s+/g, ' ').trim();
      if (!value) continue;
      if (conteudoExistsInList(value, out)) continue;
      out.push(value);
    }
    return out;
  }

  function buildConteudoFallbackPreferences(safePlan) {
    const atual = uniqueConteudos(safePlan?.conteudos || []);
    const anterior = uniqueConteudos(getPlanConteudosByIndex(S.currentPlanIndex - 1));
    const proxima = uniqueConteudos(getPlanConteudosByIndex(S.currentPlanIndex + 1));

    const preferencias = [];

    for (const item of anterior) {
      if (!conteudoExistsInList(item, atual)) preferencias.push(item);
    }

    // Se a aula anterior usa o mesmo conteúdo da aula atual, usa o conteúdo da próxima aula.
    if (!preferencias.length) {
      for (const item of proxima) {
        if (!conteudoExistsInList(item, atual)) preferencias.push(item);
      }
    }

    return uniqueConteudos(preferencias);
  }

  async function corrigirErroItensPlanejamentoComConteudoExtra(safePlan) {
    if (!isMissingPlanningItemsErrorVisible()) return false;

    L.log('[Correção SIAP] Erro de itens do planejamento detectado. Vou adicionar um conteúdo diferente e tentar salvar novamente.');

    const preferencias = buildConteudoFallbackPreferences(safePlan);
    if (preferencias.length) {
      L.log(`[Correção SIAP] Conteúdo de correção preferencial: ${preferencias.join(' | ')}`);
    } else {
      L.log('[Correção SIAP] Sem conteúdo diferente na aula anterior/próxima. Vou escolher um conteúdo aleatório da árvore.');
    }

    const resultado = await CT.addFallbackConteudoDiferente(preferencias, safePlan?.conteudos || []);
    await U.waitForAsyncPostBack(4000, 700);
    await U.sleep(500);

    if (!resultado?.ok) {
      L.log('[Correção SIAP] Não consegui adicionar conteúdo extra para corrigir o erro.');
      return false;
    }

    L.log(`[Correção SIAP] Conteúdo extra adicionado (${resultado.origem}): ${resultado.texto}`);
    return true;
  }

  function getPageReadinessState(expectedLessonNumber = '') {
    const pendingExpectedLesson = String(expectedLessonNumber || getPendingPreviousLessonNumber() || '').trim();
    const prm = U.getPageRequestManager?.();
    let inAsyncPostBack = false;

    try {
      inAsyncPostBack = !!(prm && typeof prm.get_isInAsyncPostBack === 'function' && prm.get_isInAsyncPostBack());
    } catch (_) {}

    const saveBtn = getAnySaveNextButton();
    const metodologia = document.querySelector(C.SELECTORS.METODOLOGIA);
    const avaliacao = document.querySelector(C.SELECTORS.AVALIACAO);
    const lessonField = document.querySelector(C.SELECTORS.LESSON_NUMBER || '#cphFuncionalidade_cphCampos_txtNumeroAula');
    const lessonNumber = String(lessonField?.value || '').trim();
    const expected = pendingExpectedLesson;
    const documentReady = document.readyState === 'interactive' || document.readyState === 'complete';

    const coreReady = !!(documentReady && !inAsyncPostBack && saveBtn && lessonField && lessonNumber);
    const optionalFieldsReady = !!(metodologia && avaliacao);
    const lessonAdvanced = !expected || (lessonNumber && lessonNumber !== expected);
    const ready = coreReady && lessonAdvanced;

    const missing = [];
    if (!documentReady) missing.push('documento');
    if (inAsyncPostBack) missing.push('postback');
    if (!saveBtn) missing.push('salvar');
    if (!lessonField) missing.push('numero_aula');
    if (!lessonNumber) missing.push('valor_numero_aula');
    if (expected && lessonNumber && lessonNumber === expected) missing.push(`aula ainda ${expected}`);

    return {
      ready,
      coreReady,
      optionalFieldsReady,
      lessonAdvanced,
      lessonNumber,
      expectedLessonNumber: expected,
      missing
    };
  }

  function isPageReadyForApply(expectedLessonNumber = '') {
    return getPageReadinessState(expectedLessonNumber).ready;
  }

  async function waitForPageReady(timeout = 30000, expectedLessonNumber = '') {
    const start = Date.now();
    let lastKey = '';

    while (Date.now() - start < timeout) {
      const state = getPageReadinessState(expectedLessonNumber);
      if (state.ready) {
        return true;
      }

      const key = `${state.lessonNumber}|${state.missing.join(',')}`;
      if (key !== lastKey) {
        lastKey = key;
        L.log(`[DEBUG] Aguardando página pronta... número da aula=${state.lessonNumber || '-'} | pendências=${state.missing.join(', ') || 'nenhuma'}`);
      }

      await U.sleep(500);
    }

    return false;
  }


  async function waitForStableSiapScreen(timeout = 15000, stableForMs = 1400) {
    const start = Date.now();
    let stableSince = 0;
    let lastSignature = '';

    while (Date.now() - start < timeout) {
      const ready = getPageReadinessState('');
      const contexto = window.SIAPContext?.getCurrentContext?.() || {};
      const eixoSelect = document.querySelector('#ddlEixo, select[id$="ddlEixo"], select[name$="$ddlEixo"]');
      const bimestreSelect = document.querySelector(
        '#cphFuncionalidade_cphCampos_ddlBimestre, #ddlBimestre, select[id$="ddlBimestre"], select[name$="$ddlBimestre"]'
      );
      const prm = window.Sys?.WebForms?.PageRequestManager?.getInstance?.() || null;
      const postback = !!(prm && typeof prm.get_isInAsyncPostBack === 'function' && prm.get_isInAsyncPostBack());

      const signature = [
        document.readyState,
        String(contexto?.numeroAula || getLessonNumberValue() || ''),
        String(contexto?.eixo || ''),
        String(contexto?.bimestre || ''),
        String(eixoSelect?.value || ''),
        String(bimestreSelect?.value || ''),
        document.querySelectorAll('[id*="treeView"]').length,
        document.querySelectorAll('textarea').length
      ].join('|');

      const baseReady = ready.coreReady && !postback && !!eixoSelect && !!bimestreSelect;

      if (baseReady && signature === lastSignature) {
        if (!stableSince) stableSince = Date.now();

        if (Date.now() - stableSince >= stableForMs) {
          L.log(
            `[DEBUG] Tela do SIAP estabilizada: ` +
            `${contexto?.eixo || eixoSelect?.options?.[eixoSelect.selectedIndex]?.textContent || '-'} / ` +
            `${contexto?.bimestre || bimestreSelect?.value || '-'}º bimestre.`
          );
          return true;
        }
      } else {
        stableSince = baseReady ? Date.now() : 0;
        lastSignature = signature;
      }

      await U.sleep(250);
    }

    L.log('[AVISO] Tempo limite aguardando estabilização completa da tela do SIAP.');
    return false;
  }

  function getGenerationOptions() {
    return {
      customContentEnabled: !!S.enableCustomContent,
      replicateToOtherClass: !!S.replicateToOtherClass,
      revisaEnabled: !!S.revisaEnabled
    };
  }


  function buildLibraryEntryFromPlans(context = {}, plans = S.generatedPlans) {
    const safePlans = normalizePlans(plans);
    if (!safePlans.length) return null;

    const disciplina = String(context?.disciplina || '').trim();
    const turma = String(context?.turma || '').trim();
    const serieAno = String(context?.serieAno || ST.getSerieAnoFromTurma(turma)).trim();
    const numeroAulaInicial = String(getLessonNumberValue() || context?.numeroAula || '').trim();
    const startNumber = ST.parseLessonNumber(numeroAulaInicial);
    const numeroAulaFinal = Number.isFinite(startNumber)
      ? String(startNumber + safePlans.length - 1)
      : '';

    return {
      id: `${ST.normalizeKey(disciplina)}__${serieAno}__${numeroAulaInicial || 'sem_numero'}__${safePlans.length}`,
      disciplina,
      serieAno,
      turmaOrigem: turma,
      numeroAulaInicial,
      numeroAulaFinal,
      totalAulas: safePlans.length,
      plans: safePlans,
      createdAt: new Date().toISOString(),
      generationOptions: getGenerationOptions()
    };
  }

  function saveGeneratedPlansToLibrary(context = {}, plans = S.generatedPlans) {
    const entry = buildLibraryEntryFromPlans(context, plans);
    if (!entry) return null;

    const saved = ST.upsertPlanLibraryEntry(entry);
    if (saved) {
      L.log(`Lote salvo para reaproveitar: ${saved.disciplina} | série ${saved.serieAno} | turma ${saved.turmaOrigem} | aulas ${saved.numeroAulaInicial || '?'}-${saved.numeroAulaFinal || '?'}`);
    }
    return saved;
  }

  function refreshSavedPlansMatch(silent = false) {
    const context = window.SIAPContext?.getCurrentContext?.() || {};
    const currentLessonNumber = getLessonNumberValue() || context?.numeroAula || '';
    const match = ST.findMatchingPlanLibraryEntry(context, currentLessonNumber);

    S.savedPlanMatch = match || null;

    if (window.SIAPUI?.renderSavedPlanMatch) {
      window.SIAPUI.renderSavedPlanMatch();
    }

    if (match?.entry && !silent) {
      const source = match.entry.turmaOrigem || '-';
      const offsetLabel = Number.isFinite(match.offset) ? `${match.offset + 1}/${Array.isArray(match.entry.plans) ? match.entry.plans.length : match.entry.totalAulas}` : '-';
      L.log(`Aulas salvas encontradas para reaproveitar. Origem: ${source}. Faixa: ${match.entry.numeroAulaInicial || '?'}-${match.entry.numeroAulaFinal || '?'}. Posição atual: ${offsetLabel}.`);
    }

    return match;
  }

  function setCurrentPlansFromLibraryEntry(match) {
    const resolvedMatch = match?.entry ? match : refreshSavedPlansMatch(true);
    if (!resolvedMatch || !resolvedMatch.entry) {
      return null;
    }

    const context = window.SIAPContext?.getCurrentContext?.() || {};
    const plans = normalizePlans(resolvedMatch.entry.plans || []);
    if (!plans.length) {
      throw new Error('O lote salvo está vazio ou inválido.');
    }

    const offset = Math.max(0, Math.min(Number(resolvedMatch.offset || 0), plans.length - 1));

    S.generatedPlans = plans;
    S.currentPlanIndex = offset;
    S.generatedPlansContext = {
      disciplina: context.disciplina,
      turma: context.turma,
      serieAno: context.serieAno,
      numeroAulaInicial: resolvedMatch.entry.numeroAulaInicial || '',
      origemTurma: resolvedMatch.entry.turmaOrigem || ''
    };

    ST.setAutoMode(false);
    ST.saveState();
    window.SIAPUI?.renderPreview?.();
    refreshSavedPlansMatch(true);

    const total = plans.length;
    const restantes = Math.max(total - offset, 0);
    L.log(`Lote salvo carregado. Origem: ${resolvedMatch.entry.turmaOrigem || '-'} | início do lote: aula ${resolvedMatch.entry.numeroAulaInicial || '?'} | posição atual: ${offset + 1}/${total} | restantes: ${restantes}`);

    return {
      total,
      offset,
      restantes,
      entry: resolvedMatch.entry
    };
  }

  function loadSavedPlansForCurrentContext() {
    try {
      const loaded = setCurrentPlansFromLibraryEntry(S.savedPlanMatch || refreshSavedPlansMatch(true));
      if (!loaded) {
        alert('Não encontrei um lote salvo compatível agora. Verifique se a disciplina e a série são as mesmas e aguarde o painel terminar a verificação.');
        return false;
      }

      alert(
        `Aulas salvas carregadas com sucesso. Origem: ${loaded.entry.turmaOrigem || '-'} | ` +
        `Aulas restantes para esta turma: ${loaded.restantes}.`
      );
      return true;
    } catch (err) {
      console.error(err);
      L.log(`Erro ao carregar lote salvo: ${err.message || err}`);
      alert(`Erro ao carregar lote salvo: ${err.message || err}`);
      return false;
    }
  }

  async function runSavedPlansForCurrentContext() {
    const ok = loadSavedPlansForCurrentContext();
    if (!ok) return false;
    await applyAllPlans();
    return true;
  }

  async function fillCustomContentIfNeeded(plan, conteudosAdicionados = []) {
    const texto = String(plan?.conteudoPersonalizado || '').trim();
    const shouldHandleCustomContent = !!texto || !!S.enableCustomContent;

    if (!shouldHandleCustomContent) {
      return false;
    }

    // O SIAP normalmente cria lstConteudos_txtDescricaoConteudo_0 depois que um
    // conteúdo padrão é adicionado. Em turmas/disciplinas sem conteúdo padrão
    // disponível, o textarea do personalizado pode já existir direto — nesse
    // caso preenchemos sem bloquear o fluxo (tolerante ao fluxo sem padrão).
    let direto = false;
    if (texto && (!Array.isArray(conteudosAdicionados) || conteudosAdicionados.length === 0)) {
      const selector = C.SELECTORS.CUSTOM_CONTENT_TEXTAREA ||
        '#cphFuncionalidade_cphCampos_lstConteudos_txtDescricaoConteudo_0, textarea[id*="lstConteudos_txtDescricaoConteudo"]';
      if (document.querySelector(selector)) {
        direto = true;
        L.log('[Conteúdo personalizado] Nenhum conteúdo padrão confirmado, mas o campo já está disponível; preenchendo direto.');
      } else {
        throw new Error(
          'Conteúdo personalizado aguardando: nenhum conteúdo padrão foi confirmado no SIAP e o campo de conteúdo personalizado não está disponível nesta aula. Desmarque "Gerar conteúdo personalizado no campo de texto livre" ou use conteúdos nativos no plano.'
        );
      }
    }

    const selector = C.SELECTORS.CUSTOM_CONTENT_TEXTAREA ||
      '#cphFuncionalidade_cphCampos_lstConteudos_txtDescricaoConteudo_0, textarea[id*="lstConteudos_txtDescricaoConteudo"]';

    if (!direto) {
      L.log('[Conteúdo personalizado] Conteúdo padrão confirmado. Aguardando o textarea do SIAP...');

      const apareceu = await U.waitUntil(
        () => !!document.querySelector(selector),
        15000,
        250
      );

      if (!apareceu) {
        throw new Error(
          'Conteúdo padrão foi confirmado, mas o SIAP não criou o campo de conteúdo personalizado.'
        );
      }
    }

    const ok = U.setTextareaValue(selector, texto);
    if (!ok) {
      throw new Error('O campo de conteúdo personalizado apareceu, mas não pôde ser preenchido.');
    }

    L.log(texto ? 'Conteúdo personalizado preenchido.' : 'Conteúdo personalizado limpo.');
    await U.sleep(400);
    return true;
  }

  function getReplicationDialog() {
    const dialogs = Array.from(document.querySelectorAll('.ui-dialog, [role="dialog"]'));
    return dialogs.find((dialog) => {
      const text = U.normalizeText(dialog.querySelector('.ui-dialog-title, #ui-id-2')?.textContent || dialog.textContent || '');
      const hasConfirm = !!dialog.querySelector('#cphFuncionalidade_cphCampos_btnConfirmarReplicar');
      const visible = dialog.offsetParent !== null || window.getComputedStyle(dialog).display !== 'none';
      return visible && hasConfirm && text.includes('replicar aula');
    }) || null;
  }

  async function waitForReplicationDialog(timeout = 12000) {
    const ok = await U.waitUntil(() => !!getReplicationDialog(), timeout, 200);
    return ok ? getReplicationDialog() : null;
  }

  async function waitForReplicationDialogClose(timeout = 12000) {
    return U.waitUntil(() => !getReplicationDialog(), timeout, 200);
  }

  function getAvailableReplicationCheckboxes(dialog) {
    if (!dialog) return [];
    return Array.from(dialog.querySelectorAll('#listaTurmas input[type="checkbox"], [id*="listaTurma" i] input[type="checkbox"], input[type="checkbox"][id*="Turma" i]'))
      .filter((input) => !input.disabled && input.offsetParent !== null && !input.closest('label[style*="display:none"]'));
  }

  function markReplicationCheckboxes(inputs = []) {
    let marked = 0;
    for (const input of inputs) {
      if (!input.checked) {
        input.checked = true;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
      marked += 1;
    }
    return marked;
  }

  function ensureOutrasTurmasSelected(dialog) {
    const select = dialog?.querySelector('#cphFuncionalidade_cphCampos_ddlTipoReplicacao');
    if (!select) throw new Error('Tipo de replicação não está disponível no SIAP.');
    const otherOption = Array.from(select.options || []).find((option) => U.normalizeText(option.textContent || '').includes('outra'));
    if (!otherOption) throw new Error('O SIAP não ofereceu a opção de replicar para outras turmas.');
    if (select.value !== otherOption.value) {
      select.value = otherOption.value;
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    return false;
  }

  function assertOtherClassReplicationAvailable() {
    if (!S.replicateToOtherClass) return true;

    const select = document.querySelector('#cphFuncionalidade_cphCampos_ddlTipoReplicacao');
    const hasOtherClassesOption = Array.from(select?.options || []).some((option) =>
      String(option.value || '').toUpperCase() === 'OUTRAS' ||
      U.normalizeText(option.textContent || '').includes('outra turma')
    );

    if (hasOtherClassesOption) return true;

    const targets = Array.isArray(window.turmasReplicacao) ? window.turmasReplicacao : [];
    const eligibleTargets = targets.filter((target) => target?.PodeReplicar !== false);
    const targetHint = targets.length && !eligibleTargets.length
      ? ' As turmas retornadas pelo SIAP já possuem planejamento nesta aula ou não estão elegíveis.'
      : targets.length
        ? ' O SIAP não disponibilizou essas turmas como destino de replicação para esta aula.'
        : ' O SIAP não retornou nenhuma turma de destino elegível para esta disciplina, série e aula.';

    throw new Error(
      'Não é possível replicar esta aula para outra turma agora.' + targetHint +
      ' Abra a turma de destino no SIAP e confirme que ela usa a mesma disciplina/série e ainda não possui planejamento nesta aula; ou desmarque “Replicar aula para outra turma” para salvar somente a turma atual.'
    );
  }

  function alertOrThrowFromHeadless(message) {
    if (window.__SIAP_SAAS_HEADLESS__) throw new Error(message);
    alert(message);
    return false;
  }

  function notifyCompletion(message) {
    if (window.__SIAP_SAAS_HEADLESS__) {
      L.log(message);
      return;
    }
    alert(message);
  }

  async function maybeReplicateAndAdvanceCurrentLesson(previousNumeroAula) {
    if (!S.replicateToOtherClass) {
      return false;
    }

    const btnReplicar = document.querySelector(C.SELECTORS.REPLICATE_BUTTON);
    if (!btnReplicar) throw new Error('A opção de replicar está ativa, mas o botão Replicar não foi encontrado no SIAP.');

    L.log('Opção de replicar ativa. Abrindo popup de replicação...');
    U.safeClick(btnReplicar);

    let dialog = await waitForReplicationDialog(12000);
    if (!dialog) {
      const sawAsync = await U.waitForAsyncPostBack(12000);
      if (sawAsync) await U.sleep(600);
      dialog = await waitForReplicationDialog(5000);
    }

    if (!dialog) throw new Error('O SIAP não abriu a janela de replicação. A aula não foi salva para evitar um avanço sem réplica.');

    const typeChanged = ensureOutrasTurmasSelected(dialog);
    if (typeChanged) {
      await U.waitForAsyncPostBack(12000);
      await U.sleep(500);
      dialog = await waitForReplicationDialog(6000);
      if (!dialog) throw new Error('A janela de replicação foi fechada antes de carregar as outras turmas.');
    }

    await U.waitUntil(() => getAvailableReplicationCheckboxes(dialog).length > 0, 10000, 200);
    const checkboxes = getAvailableReplicationCheckboxes(dialog);
    if (!checkboxes.length) {
      const btnCancelar = dialog.querySelector('#cphFuncionalidade_cphCampos_btnCancelarReplicar');
      if (btnCancelar) {
        U.safeClick(btnCancelar);
        await U.waitForAsyncPostBack(8000);
        await waitForReplicationDialogClose(4000);
      }
      throw new Error('Nenhuma turma de destino disponível para replicação no SIAP.');
    }

    const totalMarcadas = markReplicationCheckboxes(checkboxes);
    L.log(`Turmas marcadas para replicação: ${totalMarcadas}.`);

    const runSequence = async () => {
      const btnConfirmar = dialog.querySelector('#cphFuncionalidade_cphCampos_btnConfirmarReplicar');
      if (!btnConfirmar) {
        throw new Error('Botão Confirmar da replicação não encontrado.');
      }

      L.log('Confirmando replicação pelo botão novo do popup...');
      U.safeClick(btnConfirmar);

      await U.waitForAsyncPostBack(12000);
      const dialogClosed = await waitForReplicationDialogClose(8000);
      if (!dialogClosed) throw new Error('O SIAP não confirmou a replicação: a janela de destino permaneceu aberta.');
      await waitForPageReady(12000, previousNumeroAula || '');
      await U.sleep(500);

      const salvarModule = window.SIAPSalvarAbrirProxima;
      const btnSalvarAbrirProxima = getCustomSaveNextButton();

      if (!salvarModule?.salvarEAguardarRedirecionamento && (!btnSalvarAbrirProxima || !document.contains(btnSalvarAbrirProxima))) {
        throw new Error('Botão/Função "Salvar e abrir próxima" não encontrado após confirmar replicação.');
      }

      L.log('Replicação confirmada. Salvando e abrindo a próxima aula...');

      // IMPORTANTE: no fluxo com replicação, clicar no botão pode falhar quando o SIAP recria
      // os botões depois do postback do popup. Chamando a função diretamente, garantimos que:
      // 1) o número da próxima aula é salvo no sessionStorage;
      // 2) o botão Salvar real do SIAP é acionado;
      // 3) ao voltar para a tela da turma, o salvar.js abre automaticamente a próxima aula.
      if (salvarModule?.salvarEAguardarRedirecionamento) {
        await salvarModule.salvarEAguardarRedirecionamento();
      } else {
        U.safeClick(btnSalvarAbrirProxima);
      }

      // Na maioria dos casos o SIAP redireciona para a página da turma e este script é descarregado.
      // Se não redirecionar, ainda tentamos confirmar a troca da aula como fallback.
      try {
        if (previousNumeroAula) {
          await waitForNextLessonLoaded(previousNumeroAula, 25000);
          commitPendingAdvanceState(getLessonNumberValue());
        } else {
          await U.sleep(2500);
          await waitForPageReady(25000);
          clearPendingPreviousLessonNumber();
          clearPendingNextPlanIndex();
        }
      } catch (err) {
        L.log('[AVISO] Após replicar, o SIAP provavelmente redirecionou/está redirecionando. A próxima aula será aberta pelo salvar.js na tela da turma.');
      }

      setPreferredSaveStrategy('custom');
      L.log(`✔ Replicação finalizada. Próxima aula pendente para abertura automática (antes: ${previousNumeroAula || '-'}).`);
      return true;
    };

    return runSequence();
  }

  async function waitForNextLessonLoaded(previousNumeroAula, timeout = 30000) {
    const ok = await waitForPageReady(timeout, previousNumeroAula);
    if (ok) {
      await U.sleep(1200);
      return true;
    }

    throw new Error(`Timeout aguardando próxima aula carregar (anterior: ${previousNumeroAula || '-'})`);
  }

  async function fillPlanOnPage(plan, saveAndNext = true, beforeNavigate = null) {
    const safePlan = normalizePlan(plan, S.currentPlanIndex);

    if (!safePlan || typeof safePlan !== 'object') {
      throw new Error('Plano inválido.');
    }

    // O SIAP só disponibiliza a opção OUTRAS quando há turma de destino elegível.
    // A validação antecipada evita preencher uma aula que não poderá ser replicada.
    if (saveAndNext && S.replicateToOtherClass) {
      assertOtherClassReplicationAvailable();
    }

    // O SIAP pode levar alguns segundos para terminar de montar selects, árvore e campos.
    // Não usa espera fixa de 5 s: aguarda o DOM/contexto realmente estabilizar.
    await waitForStableSiapScreen(15000, 1400);

    // Mantém na próxima aula o último bimestre selecionado pelo professor.
    // Restaura primeiro o bimestre porque ele pode disparar postback e recriar partes da tela.
    if (BIMESTRE && typeof BIMESTRE.restoreLastBimestre === 'function') {
      await BIMESTRE.restoreLastBimestre();
      await waitForPageReady(12000);
      await waitForStableSiapScreen(12000, 1000);
    }

    // Mantém na próxima aula o último item selecionado no ddlEixo pelo professor.
    // Esse campo muda por disciplina, então a restauração só acontece se o valor existir na tela atual.
    if (EIXO && typeof EIXO.restoreLastEixo === 'function') {
      await EIXO.restoreLastEixo();
      await waitForPageReady(12000);
      await waitForStableSiapScreen(12000, 1000);
    }

    if (A && typeof A.syncCurrentCatalog === 'function') {
      await A.syncCurrentCatalog({ silent: true });
    }

    const habilidades = safePlan.habilidades;
    const conteudos = safePlan.conteudos;
    const conteudoPersonalizado = String(safePlan.conteudoPersonalizado || '').trim();
    const matrizSaebDisponivelNaPagina = isMatrizSaebRealmenteDisponivel();
    const matrizSaeb = matrizSaebDisponivelNaPagina ? (safePlan.matrizSaeb || []) : [];
    const originalInfo = safePlan.__originalIndex ? ` (original ${safePlan.__originalIndex})` : '';

    L.log(`Preenchendo aula ${S.currentPlanIndex + 1} de ${S.generatedPlans.length}${originalInfo}...`);
    L.log(`[DEBUG] Habilidades recebidas: ${habilidades.length}`);
    L.log(`[DEBUG] Conteúdos recebidos: ${conteudos.length}`);
    L.log(`[DEBUG] Conteúdo personalizado recebido: ${conteudoPersonalizado ? 'sim' : 'não'}`);
    L.log(`[DEBUG] Matriz SAEB recebida: ${matrizSaeb.length}`);

    const habilidadesAdicionadas = [];
    const habilidadesFalhas = [];
    for (const habilidade of habilidades) {
      L.log(`[DEBUG] Adicionando habilidade: ${habilidade}`);
      const ok = await H.addHabilidadeByText(habilidade);
      await U.waitForAsyncPostBack(3500, 700);
      await U.sleep(180);

      if (ok) habilidadesAdicionadas.push(habilidade);
      else habilidadesFalhas.push(habilidade);
    }

    await U.waitForAsyncPostBack(3000, 700);
    await U.sleep(150);

    const conteudosAdicionados = [];
    const conteudosFalhos = [];
    for (const conteudo of conteudos) {
      L.log(`[DEBUG] Adicionando conteúdo: ${conteudo}`);
      const ok = await CT.addConteudoByText(conteudo);
      await U.waitForAsyncPostBack(3500, 700);
      await U.sleep(180);

      if (ok) conteudosAdicionados.push(conteudo);
      else conteudosFalhos.push(conteudo);
    }

    if (habilidadesFalhas.length) {
      L.log(`[AVISO] ${habilidadesFalhas.length} habilidade(s) não puderam ser adicionadas: ${habilidadesFalhas.join(' | ')}`);
    }

    if (conteudosFalhos.length) {
      L.log(`[AVISO] ${conteudosFalhos.length} conteúdo(s) não puderam ser adicionados: ${conteudosFalhos.join(' | ')}`);
    }

    const matrizSaebAdicionadas = [];
    const matrizSaebFalhas = [];
    if (matrizSaebDisponivelNaPagina && MS && MS.addMatrizSaebByText) {
      if (!matrizSaeb.length) {
        matrizSaebFalhas.push('API não retornou item da Matriz SAEB');
      }

      for (const itemMatriz of matrizSaeb) {
        L.log(`[DEBUG] Adicionando Matriz SAEB: ${itemMatriz}`);
        const ok = await MS.addMatrizSaebByText(itemMatriz);
        await U.waitForAsyncPostBack(3500, 700);
        await U.sleep(180);

        if (ok) matrizSaebAdicionadas.push(itemMatriz);
        else matrizSaebFalhas.push(itemMatriz);
      }
    }

    if (matrizSaebFalhas.length) {
      L.log(`[AVISO] ${matrizSaebFalhas.length} item(ns) da Matriz SAEB não puderam ser adicionados: ${matrizSaebFalhas.join(' | ')}`);
    }

    if (habilidades.length > 0 && habilidadesAdicionadas.length === 0) {
      await U.sleep(1400);
      for (const habilidade of habilidades) {
        if (H.habilidadeJaAdicionada(habilidade) && !habilidadesAdicionadas.includes(habilidade)) {
          habilidadesAdicionadas.push(habilidade);
        }
      }
    }

    // Campos textuais normais primeiro.
    const metodologiaOk = U.setTextareaValue(C.SELECTORS.METODOLOGIA, safePlan.metodologia || '');
    L.log(metodologiaOk ? 'Metodologia preenchida.' : 'Campo Metodologia não encontrado.');
    await U.sleep(400);

    const avaliacaoOk = U.setTextareaValue(C.SELECTORS.AVALIACAO, safePlan.avaliacao || '');
    L.log(avaliacaoOk ? 'Avaliação preenchida.' : 'Campo Avaliação não encontrado.');
    await U.sleep(800);

    // O personalizado é o último campo dependente do conteúdo: só é chamado
    // depois que o conteúdo padrão já foi adicionado e confirmado.
    await fillCustomContentIfNeeded(safePlan, conteudosAdicionados);

    if (habilidades.length > 0 && habilidadesAdicionadas.length === 0) {
      throw new Error(`Nenhuma habilidade pôde ser adicionada nesta aula.`);
    }

    if (conteudos.length > 0 && conteudosAdicionados.length === 0) {
      throw new Error(`Nenhum conteúdo pôde ser adicionado nesta aula.`);
    }

    if (matrizSaebDisponivelNaPagina && matrizSaebAdicionadas.length === 0) {
      throw new Error(`A Matriz SAEB apareceu nesta turma, mas nenhum item pôde ser adicionado.`);
    }

    if (saveAndNext) {
      if (!getCustomSaveNextButton()) {
        throw new Error('Botão "Salvar e abrir próxima" não encontrado. O fluxo automático agora usa sempre esse botão.');
      }

      let validacao = V.validarAntesDeSalvar();
      if (!validacao.habilidadesOk && habilidades.length > 0) {
        for (let tentativa = 1; tentativa <= 2 && !validacao.habilidadesOk; tentativa++) {
          L.log(`[Validação] Aguardando o SIAP confirmar a habilidade (${tentativa}/2)...`);
          await U.waitForAsyncPostBack(5000, 1200);
          await U.sleep(1200);
          validacao = V.validarAntesDeSalvar();
        }
      }
      L.log(
        `Validação antes de salvar -> Metodologia: ${validacao.metodologiaOk ? 'OK' : 'FALHOU'} | ` +
        `Avaliação: ${validacao.avaliacaoOk ? 'OK' : 'FALHOU'} | ` +
        `Habilidades: ${validacao.qtdHabilidades} | Conteúdos: ${validacao.qtdConteudos} | ` +
        `Conteúdo personalizado: ${validacao.conteudoPersonalizado ? 'SIM' : 'NÃO'}`
      );

      if (!validacao.podeSalvar) {
        throw new Error(
          `Validação falhou antes de salvar: ` +
          `${validacao.metodologiaOk ? '' : '[Metodologia vazia] '}` +
          `${validacao.avaliacaoOk ? '' : '[Avaliação vazia] '}` +
          `${validacao.habilidadesOk ? '' : '[Nenhuma habilidade adicionada] '}` +
          `${validacao.conteudosOk ? '' : '[Nenhum conteúdo adicionado] '}`
        );
      }

      // Garante que as escolhas manuais do professor não se percam ao salvar e abrir a próxima aula.
      if (BIMESTRE && typeof BIMESTRE.rememberCurrentBimestre === 'function') {
        BIMESTRE.rememberCurrentBimestre();
      }

      if (EIXO && typeof EIXO.rememberCurrentEixo === 'function') {
        EIXO.rememberCurrentEixo();
      }

      const numeroAulaAntes = getLessonNumberValue();

      if (typeof beforeNavigate === 'function') {
        beforeNavigate(numeroAulaAntes);
      }

      setPendingPreviousLessonNumber(numeroAulaAntes);
      ST.saveState();
      L.log(`Salvando aula ${Math.min(S.currentPlanIndex, S.generatedPlans.length)} e aguardando próxima carregar...`);

      if (S.replicateToOtherClass) {
        const replicatedAndAdvanced = await maybeReplicateAndAdvanceCurrentLesson(numeroAulaAntes);
        if (replicatedAndAdvanced) {
          L.log(`Aula ${Math.min(S.currentPlanIndex, S.generatedPlans.length)} concluída.`);
          return true;
        }

        validacao = V.validarAntesDeSalvar();
        if (!validacao.podeSalvar) {
          throw new Error('Validação falhou após a tentativa de replicação. Revise a aula antes de continuar.');
        }
      }

      let saveSucceeded = false;
      let lastSaveError = null;

      async function tryAdvanceWithCustomButton(timeoutMs) {
        let jaTentouCorrigirErroItens = false;

        for (let tentativaSalvar = 1; tentativaSalvar <= 2; tentativaSalvar++) {
          const button = getCustomSaveNextButton();
          if (!button || !document.contains(button)) {
            throw new Error('Botão "Salvar e abrir próxima" não encontrado na página.');
          }

          L.log(`Tentando avançar usando sempre: Salvar e abrir próxima${tentativaSalvar > 1 ? ' (nova tentativa após correção)' : ''}.`);
          U.safeClick(button);

          await U.sleep(450);
          await U.waitForAsyncPostBack(7000, 900);
          await U.sleep(450);

          if (isMissingPlanningItemsErrorVisible() || await waitForMissingPlanningItemsError(1800)) {
            if (jaTentouCorrigirErroItens) {
              throw new Error('O SIAP continuou informando que há itens do planejamento não preenchidos mesmo após adicionar conteúdo extra.');
            }

            jaTentouCorrigirErroItens = true;
            const corrigiu = await corrigirErroItensPlanejamentoComConteudoExtra(safePlan);
            if (!corrigiu) {
              throw new Error('O SIAP informou itens ausentes, mas não consegui adicionar um conteúdo diferente para corrigir.');
            }

            const novaValidacao = V.validarAntesDeSalvar();
            if (!novaValidacao.podeSalvar) {
              throw new Error('Após corrigir o conteúdo, a validação local ainda falhou. Revise a aula antes de continuar.');
            }

            setPendingPreviousLessonNumber(numeroAulaAntes);
            ST.saveState();
            continue;
          }

          try {
            if (numeroAulaAntes) {
              await waitForNextLessonLoaded(numeroAulaAntes, timeoutMs);
              commitPendingAdvanceState(getLessonNumberValue());
              setPreferredSaveStrategy('custom');
              L.log(`✔ Próxima aula carregada com Salvar e abrir próxima (antes: ${numeroAulaAntes}, agora: ${getLessonNumberValue() || '?'})`);
            } else {
              L.log('⚠ Campo Número da Aula não encontrado. Usando fallback de espera.');
              await U.sleep(2500);
              await waitForPageReady(timeoutMs);
              clearPendingPreviousLessonNumber();
              clearPendingNextPlanIndex();
              setPreferredSaveStrategy('custom');
            }

            saveSucceeded = true;
            return;
          } catch (err) {
            if (!jaTentouCorrigirErroItens && isMissingPlanningItemsErrorVisible()) {
              jaTentouCorrigirErroItens = true;
              const corrigiu = await corrigirErroItensPlanejamentoComConteudoExtra(safePlan);
              if (!corrigiu) throw err;

              const novaValidacao = V.validarAntesDeSalvar();
              if (!novaValidacao.podeSalvar) throw err;

              setPendingPreviousLessonNumber(numeroAulaAntes);
              ST.saveState();
              continue;
            }

            throw err;
          }
        }
      }

      try {
        await tryAdvanceWithCustomButton(25000);
      } catch (errCustom) {
        lastSaveError = errCustom;
      }

      if (!saveSucceeded) {
        clearPendingPreviousLessonNumber();
        clearPendingNextPlanIndex();
        throw lastSaveError || new Error('Não foi possível avançar para a próxima aula usando o botão "Salvar e abrir próxima".');
      }
    }

    L.log(`Aula ${Math.min(S.currentPlanIndex, S.generatedPlans.length)} concluída.`);
    return true;
  }

  function summarizeGeneratedLessons(plans) {
    if (!Array.isArray(plans)) return [];

    return plans.slice(-30).map((plan, index, recentPlans) => ({
      numero: plans.length - recentPlans.length + index + 1,
      titulo: String(plan?.titulo || '').trim(),
      habilidades: Array.isArray(plan?.habilidades) ? plan.habilidades : [],
      conteudos: Array.isArray(plan?.conteudos) ? plan.conteudos : []
    }));
  }

  function isRequestTooLargeGenerationError(err) {
    const message = String(err?.message || err || '').toLowerCase();
    return (
      message.includes('request too large') ||
      message.includes('maximum context length') ||
      message.includes('please reduce the length of the messages') ||
      message.includes('input or output tokens must be reduced') ||
      (message.includes('messages resulted in') && message.includes('tokens')) ||
      (message.includes('long-context') && message.includes('tokens'))
    );
  }

  function hasUploadedFileAttachment() {
    const fileInput = document.querySelector('#tm-gpt-file');
    return !!(
      String(S.uploadedText || '').trim() ||
      String(fileInput?.value || '').trim()
    );
  }

  function createAttachedFileTooLargeError(err) {
    const attachmentError = new Error(String(err?.message || err || 'Arquivo anexado muito grande.'));
    attachmentError.code = 'ATTACHED_FILE_TOO_LARGE';
    attachmentError.status = Number(err?.status || 429);
    return attachmentError;
  }

  function clearUploadedFileAttachment() {
    S.uploadedText = '';
    const fileInput = document.querySelector('#tm-gpt-file');
    if (fileInput) {
      try {
        fileInput.value = '';
      } catch (_) {}
    }
    ST.saveState();
  }

  function isTransientGenerationError(err) {
    const message = String(err?.message || err || '').toLowerCase();
    const status = Number(err?.status || 0);
    const code = String(err?.code || '').toUpperCase();
    return (
      [429, 500, 502, 503, 504].includes(status) ||
      ['INCOMPLETE_JSON', 'OUTPUT_LIMIT'].includes(code) ||
      message.includes('failed to fetch') ||
      message.includes('falha de comunicação') ||
      message.includes('networkerror') ||
      message.includes('load failed') ||
      message.includes('request too large') ||
      message.includes('rate limit') ||
      message.includes('too many requests') ||
      message.includes('tokens per min') ||
      message.includes('(tpm)') ||
      message.includes('limite de tokens') ||
      message.includes('resposta json da api veio incompleta') ||
      message.includes('interrompida pelo limite de saída') ||
      message.includes('timeout') ||
      message.includes('tempo esgotado') ||
      message.includes('erro http 429') ||
      message.includes('erro http 500') ||
      message.includes('erro http 502') ||
      message.includes('erro http 503') ||
      message.includes('erro http 504')
    );
  }

  async function callBatchWithRetry(batchSize, userInstruction, apiContext, batchNumber) {
    let lastError = null;

    for (let attempt = 1; attempt <= MAX_TENTATIVAS_POR_LOTE; attempt++) {
      try {
        return await A.callOpenAI(batchSize, userInstruction, '', apiContext);
      } catch (err) {
        lastError = err;

        if (isRequestTooLargeGenerationError(err) && hasUploadedFileAttachment()) {
          throw createAttachedFileTooLargeError(err);
        }

        if (attempt >= MAX_TENTATIVAS_POR_LOTE || !isTransientGenerationError(err)) {
          break;
        }

        const errorMessage = String(err?.message || err || '').toLowerCase();
        const isRateLimit = Number(err?.status || 0) === 429 ||
          errorMessage.includes('request too large') ||
          errorMessage.includes('rate limit') ||
          errorMessage.includes('tokens per min') ||
          errorMessage.includes('(tpm)');
        const retryDelay = isRateLimit
          ? Math.min(20000, 6000 * (2 ** (attempt - 1)))
          : Math.min(5000, 1200 * (2 ** (attempt - 1)));

        L.log(
          `Lote ${batchNumber}: ${isRateLimit ? 'limite temporário de tokens atingido' : 'o servidor não respondeu'}. ` +
          `Nova tentativa ${attempt + 1}/${MAX_TENTATIVAS_POR_LOTE} em instantes...`
        );
        const completedLessons = Math.max(
          0,
          Number(apiContext?.batchInfo?.startIndex || 1) - 1
        );
        const totalLessons = Math.max(
          completedLessons + batchSize,
          Number(apiContext?.batchInfo?.totalRequested || batchSize)
        );
        window.SIAPUI?.setGenerationProgress?.(
          completedLessons,
          totalLessons,
          isRateLimit
            ? `Aguardando o limite de tokens liberar para continuar o lote ${batchNumber}...`
            : `O lote ${batchNumber} demorou para responder. Tentando novamente...`
        );
        await U.sleep(retryDelay);
      }
    }

    throw lastError || new Error(`Não foi possível gerar o lote ${batchNumber}.`);
  }

  async function callOpenAIInBatches(totalLessons, userInstruction, apiContext, initialResult = null) {
    const initialLessons = Array.isArray(initialResult?.aulas)
      ? initialResult.aulas.slice(0, totalLessons)
      : [];
    const generatedLessons = initialLessons.map((lesson, index) => {
      if (lesson && typeof lesson === 'object') {
        lesson.__originalIndex = index + 1;
      }
      return lesson;
    });
    const initialInvalidLessons = Array.isArray(initialResult?.validacao?.invalidas)
      ? initialResult.validacao.invalidas
      : [];
    const invalidLessons = initialInvalidLessons.map((item) => ({ ...item }));
    let totalInvalidLessons = Math.max(
      Number(initialResult?.validacao?.totalInvalidas || 0),
      initialInvalidLessons.length
    );
    let batchNumber = 0;
    const estimatedBatches = Math.max(
      1,
      Math.ceil((totalLessons - generatedLessons.length) / MAX_AULAS_POR_LOTE)
    );
    const maxBatchRequests = estimatedBatches + 3;

    L.log(
      `${totalLessons - generatedLessons.length} aula(s) restante(s) serão geradas em ` +
      `${estimatedBatches} lote(s) sequencial(is) ` +
      `de até ${MAX_AULAS_POR_LOTE}.`
    );
    window.SIAPUI?.setGenerationProgress?.(
      generatedLessons.length,
      totalLessons,
      'Continuando automaticamente em lotes menores.'
    );

    while (generatedLessons.length < totalLessons) {
      if (batchNumber >= maxBatchRequests) {
        throw new Error(
          `A API gerou ${generatedLessons.length} de ${totalLessons} aulas após várias tentativas.`
        );
      }

      batchNumber += 1;
      const remaining = totalLessons - generatedLessons.length;
      const batchSize = Math.min(MAX_AULAS_POR_LOTE, remaining);
      const startIndex = generatedLessons.length + 1;
      const endIndex = startIndex + batchSize - 1;
      const visibleBatchCount = Math.max(estimatedBatches, batchNumber);
      const batchContext = {
        ...apiContext,
        batchInfo: {
          totalRequested: totalLessons,
          startIndex,
          endIndex,
          batchNumber,
          batchCount: visibleBatchCount,
          previousLessons: summarizeGeneratedLessons(generatedLessons)
        }
      };

      L.log(
        `Gerando lote ${batchNumber}/${visibleBatchCount}: ` +
        `aulas ${startIndex} a ${endIndex} (${generatedLessons.length}/${totalLessons} concluídas).`
      );
      window.SIAPUI?.setGenerationProgress?.(
        generatedLessons.length,
        totalLessons,
        `Gerando lote ${batchNumber}/${visibleBatchCount}: aulas ${startIndex} a ${endIndex}.`
      );

      let batchResult;
      try {
        batchResult = await callBatchWithRetry(batchSize, userInstruction, batchContext, batchNumber);
      } catch (err) {
        if (err?.code === 'ATTACHED_FILE_TOO_LARGE') {
          throw err;
        }
        throw new Error(`Falha no lote ${batchNumber}: ${err?.message || err}`);
      }

      const batchLessons = Array.isArray(batchResult?.aulas)
        ? batchResult.aulas.slice(0, batchSize)
        : [];

      if (!batchLessons.length) {
        throw new Error(`O lote ${batchNumber} não retornou nenhuma aula válida.`);
      }

      const baseIndex = generatedLessons.length;
      batchLessons.forEach((lesson, localIndex) => {
        if (lesson && typeof lesson === 'object') {
          lesson.__originalIndex = baseIndex + localIndex + 1;
        }
        generatedLessons.push(lesson);
      });

      const batchInvalidLessons = Array.isArray(batchResult?.validacao?.invalidas)
        ? batchResult.validacao.invalidas
        : [];
      const reportedInvalidTotal = Number(batchResult?.validacao?.totalInvalidas || 0);
      totalInvalidLessons += Math.max(reportedInvalidTotal, batchInvalidLessons.length);

      batchInvalidLessons.forEach((item, invalidIndex) => {
        const localNumber = Number(item?.numero);
        invalidLessons.push({
          ...item,
          numero: Number.isFinite(localNumber)
            ? startIndex + localNumber - 1
            : `${batchNumber}.${invalidIndex + 1}`
        });
      });

      L.log(
        `Lote ${batchNumber} concluído: ` +
        `${generatedLessons.length}/${totalLessons} aula(s) recebida(s).`
      );
      window.SIAPUI?.setGenerationProgress?.(
        generatedLessons.length,
        totalLessons,
        `${generatedLessons.length} de ${totalLessons} aulas concluídas.`
      );

      if (batchLessons.length < batchSize) {
        L.log(
          `O lote ${batchNumber} retornou ${batchLessons.length} de ${batchSize} aulas. ` +
          `As restantes serão solicitadas no próximo lote.`
        );
      }
    }

    return {
      aulas: generatedLessons.slice(0, totalLessons),
      validacao: {
        totalValidas: Math.min(generatedLessons.length, totalLessons),
        totalInvalidas: totalInvalidLessons,
        invalidas: invalidLessons
      }
    };
  }

  async function callOpenAIWithAutomaticFallback(totalLessons, userInstruction, apiContext) {
    if (totalLessons <= MAX_AULAS_POR_LOTE) {
      window.SIAPUI?.updateGenerationProgress?.({
        mode: 'indeterminate',
        state: 'running',
        label: `Planejando ${totalLessons} aula${totalLessons === 1 ? '' : 's'}...`,
        detail: 'Aguardando a IA concluir os planejamentos.'
      });
      return A.callOpenAI(totalLessons, userInstruction, '', apiContext);
    }

    L.log(`Tentando gerar as ${totalLessons} aulas em uma única solicitação.`);
    window.SIAPUI?.updateGenerationProgress?.({
      mode: 'indeterminate',
      state: 'running',
      label: `Planejando ${totalLessons} aulas...`,
      detail: 'Tentando concluir todos os planejamentos em uma única etapa.'
    });

    try {
      const fullResult = await A.callOpenAI(totalLessons, userInstruction, '', apiContext);
      const fullLessons = Array.isArray(fullResult?.aulas) ? fullResult.aulas : [];

      if (fullLessons.length >= totalLessons) {
        fullResult.aulas = fullLessons.slice(0, totalLessons);
        L.log(`${totalLessons}/${totalLessons} aulas recebidas em uma única solicitação.`);
        window.SIAPUI?.setGenerationProgress?.(
          totalLessons,
          totalLessons,
          'Aulas recebidas. Finalizando os planejamentos...'
        );
        return fullResult;
      }

      L.log('Ajustando automaticamente a geração para lotes menores...');
      window.SIAPUI?.setGenerationProgress?.(
        fullLessons.length,
        totalLessons,
        'A geração continuará automaticamente em lotes menores.'
      );
      return callOpenAIInBatches(totalLessons, userInstruction, apiContext, fullResult);
    } catch (err) {
      if (isRequestTooLargeGenerationError(err) && hasUploadedFileAttachment()) {
        throw createAttachedFileTooLargeError(err);
      }

      if (!isTransientGenerationError(err)) {
        throw err;
      }

      L.log('Ajustando automaticamente a geração para lotes menores...');
      window.SIAPUI?.setGenerationProgress?.(
        0,
        totalLessons,
        'A geração continuará automaticamente em lotes menores.'
      );
      return callOpenAIInBatches(totalLessons, userInstruction, apiContext);
    }
  }

  function yieldToBrowser() {
    return new Promise((resolve) => {
      if (typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(() => resolve());
      } else {
        setTimeout(resolve, 0);
      }
    });
  }

  function scheduleGeneratedPlansLibraryRefresh(context, aulas) {
    const task = () => {
      try {
        saveGeneratedPlansToLibrary(context, aulas);
        refreshSavedPlansMatch(true);
      } catch (err) {
        console.warn('[SIAP] Falha ao persistir lote em idle time:', err);
        L.log(`[PERFORMANCE] Não foi possível atualizar o lote de reaproveitamento agora: ${err?.message || err}`);
      }
    };

    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(task, { timeout: 1200 });
    } else {
      setTimeout(task, 0);
    }
  }

  async function generatePlans() {
    try {
      setRunningState(true);

      const qtd = parseInt(document.querySelector('#tm-gpt-qtd')?.value || '1', 10);
      const pastedText = document.querySelector('#tm-gpt-content')?.value?.trim() || '';
      const uploadedSupport = String(S.uploadedText || '').trim();
      const finalContent = [pastedText, uploadedSupport].filter(Boolean).join('\n\n');

      // O textarea #tm-gpt-content é o PROMPT principal do usuário.
      // Arquivo enviado é apenas material de apoio.
      let userInstruction = pastedText
        ? [
            'PROMPT PRINCIPAL DO USUÁRIO (OBEDECER):',
            pastedText,
            uploadedSupport
              ? '\nMATERIAL DE APOIO ANEXADO (usar sem contrariar o prompt principal):\n' + uploadedSupport
              : ''
          ].filter(Boolean).join('\n')
        : finalContent;

      if (BIMESTRE && typeof BIMESTRE.rememberCurrentBimestre === 'function') {
        BIMESTRE.rememberCurrentBimestre();
      }

      if (EIXO && typeof EIXO.rememberCurrentEixo === 'function') {
        EIXO.rememberCurrentEixo();
      }

      const currentContext = window.SIAPContext.getCurrentContext();
      debugCurrentContext(currentContext);

      if (!currentContext.disciplina || !currentContext.turma) {
        alert('Não foi possível identificar disciplina/turma. Aguarde a página carregar completamente.');
        return;
      }


      if (!qtd || qtd < 1) {
        alert('Informe uma quantidade de aulas válida.');
        return;
      }

      // Não bloqueia o botão Gerar com sincronização forçada.
      // O catálogo continua sendo atualizado em segundo plano.
      if (A && typeof A.syncCurrentCatalog === 'function') {
        Promise.resolve(
          A.syncCurrentCatalog({ context: currentContext, force: false, silent: true })
        ).catch(err => {
          console.warn('[Catálogo SIAP] sincronização leve em segundo plano falhou:', err);
        });
      }

      let revisaContext = null;
      const revisaConfig = window.SIAPUI?.getRevisaGenerationConfig?.() || null;
      if (revisaConfig && A && typeof A.prepareRevisaSelection === 'function') {
        window.SIAPUI?.setGenerationProgress?.(0, qtd, 'Carregando o trecho selecionado do Revisa...');
        revisaContext = await A.prepareRevisaSelection(revisaConfig, currentContext, qtd);
        S.revisaEnabled = true;
        S.revisaSelection = revisaConfig;
        ST.saveState();
        L.log(
          `[Revisa] ${revisaContext?.material?.titulo || 'Material'} | ` +
          `${revisaContext?.bloco?.titulo || '-'} | ${revisaContext?.sequencia?.nome || '-'} | ` +
          `${revisaContext?.referencia || 'trecho selecionado'}`
        );
      }

      if (!userInstruction) {
        if (revisaContext) {
          userInstruction = 'Planeje as aulas usando obrigatoriamente o trecho do Revisa selecionado e a distribuição informada.';
        } else {
          userInstruction = 'Sem instruções específicas. Gere os planejamentos utilizando APENAS os conteúdos e habilidades disponíveis na árvore do SIAP, de forma coerente e variada.';
          L.log('Nenhuma instrução do usuário. Usando modo automático baseado na árvore.');
        }
      }

      let instructionResolution = { habilidades: [], conteudos: [] };
      const revisaReferences = A && typeof A.getRevisaReferenceInstruction === 'function'
        ? A.getRevisaReferenceInstruction(revisaContext)
        : '';
      const instructionTextToResolve = pastedText || revisaReferences;
      if (instructionTextToResolve && A && typeof A.resolveInstructionFromCatalog === 'function') {
        instructionResolution = await A.resolveInstructionFromCatalog(instructionTextToResolve, currentContext);
        const habilidadesExatas = instructionResolution.habilidades.filter(item => item?.encontrada);
        const habilidadesAusentes = instructionResolution.habilidades.filter(item => item && !item.encontrada);
        const conteudosExatos = instructionResolution.conteudos;
        const contextoAlvo = instructionResolution.contextoAlvo || null;

        if (contextoAlvo?.eixo) {
          L.log(`[Comando] Tema/eixo prioritário confirmado pelo prompt: ${contextoAlvo.eixo}`);
        }

        if (habilidadesExatas.length) {
          L.log(`[Comando] Habilidade(s) confirmada(s) no banco: ${habilidadesExatas.map(item => item.codigo || item.solicitada).join(' | ')}`);
        }
        if (conteudosExatos.length) {
          L.log(`[Comando] Conteúdo(s) confirmado(s) no banco: ${conteudosExatos.map(item => item.texto).join(' | ')}`);
        }
        if (habilidadesAusentes.length) {
          L.log(`[Comando] Código(s) ausente(s) do banco; similaridade liberada somente para: ${habilidadesAusentes.map(item => item.solicitada || item.codigo).join(' | ')}`);
        }
      }

      window.SIAPUI?.startGenerationProgress?.(qtd);
      ST.saveState();
      const generationOptions = getGenerationOptions();
      const apiContext = {
        ...currentContext,
        generationOptions,
        instructionResolution,
        revisa: revisaContext
      };

      L.log(`Enviando ${qtd} aula(s) para a API. Contexto: ${currentContext.disciplina} - ${currentContext.turma}`);
      L.log(`Instrução: ${String(userInstruction).substring(0, 150)}...`);
      L.log(`[DEBUG] Opções -> conteúdo personalizado: ${generationOptions.customContentEnabled ? 'sim' : 'não'} | replicar: ${generationOptions.replicateToOtherClass ? 'sim' : 'não'}`);

      const result = await callOpenAIWithAutomaticFallback(qtd, userInstruction, apiContext);
      if (result && Array.isArray(result.aulas)) {
        result.aulas = removerMatrizSaebSeNaoDisponivel(result.aulas, apiContext);
      }
      debugApiResult(result);
      logDiscardedLessons(result?.validacao);

      let aulas = normalizePlans(result?.aulas);
      aulas = attachRevisaMetadata(aulas, revisaContext);

      if (!aulas.length) {
        throw new Error('A API retornou JSON, mas sem aulas válidas.');
      }

      S.generatedPlans = aulas;
      S.currentPlanIndex = 0;
      S.generatedPlansContext = {
        disciplina: currentContext.disciplina,
        turma: currentContext.turma,
        serieAno: currentContext.serieAno,
        numeroAulaInicial: getLessonNumberValue() || currentContext.numeroAula || '',
        revisa: revisaContext ? {
          materialId: Number(revisaContext?.material?.id || 0),
          componenteId: Number(revisaContext?.componente?.id || 0),
          blocoId: Number(revisaContext?.bloco?.id || 0),
          sequenciaId: Number(revisaContext?.sequencia?.id || 0),
          referencia: String(revisaContext?.referencia || '')
        } : null
      };

      ST.setAutoMode(false);
      ST.saveState();

      // Libera a thread principal para que a prévia apareça imediatamente.
      // A gravação secundária do lote acontece quando o navegador estiver ocioso.
      await yieldToBrowser();
      window.SIAPUI.renderPreview();
      scheduleGeneratedPlansLibraryRefresh(currentContext, aulas);

      const totalInvalidas = Number(result?.validacao?.totalInvalidas || 0);
      const totalValidas = Number(result?.validacao?.totalValidas || aulas.length);

      L.log(`Planejamentos válidos gerados: ${S.generatedPlans.length}`);
      window.SIAPUI?.completeGenerationProgress?.(qtd);
      await U.sleep(80);

      // Não usa alert() no sucesso: alert bloqueia a thread principal e fazia o
      // diagnóstico registrar ~2,5 s de "long task" enquanto o professor fechava
      // a janela. O painel/progresso já informa a conclusão sem bloquear a página.
      if (totalInvalidas > 0) {
        const numerosDescartados = (result.validacao.invalidas || []).map((item) => item.numero).join(', ');
        L.log(
          `Planejamentos concluídos: ${totalValidas} válida(s); ${totalInvalidas} descartada(s)` +
          `${numerosDescartados ? ` (${numerosDescartados})` : ''}.`
        );
      } else {
        L.log(`Planejamentos gerados com sucesso para ${currentContext.disciplina} - ${currentContext.turma}.`);
      }
    } catch (err) {
      if (
        err?.code === 'ATTACHED_FILE_TOO_LARGE' ||
        (isRequestTooLargeGenerationError(err) && hasUploadedFileAttachment())
      ) {
        clearUploadedFileAttachment();
        const userMessage =
          'O arquivo anexado é grande demais para ser processado e foi removido. ' +
          'Tente gerar novamente sem o arquivo ou anexe uma versão menor.';
        console.warn('[SIAP generatePlans] arquivo anexado removido por excesso de tamanho.');
        L.log(`⚠️ ${userMessage}`);
        window.SIAPUI?.failGenerationProgress?.(userMessage);
        alert(userMessage);
        return;
      }

      console.error('[SIAP generatePlans] erro completo:', err);
      if (err?.stack) console.error(err.stack);
      L.log(`❌ Erro ao gerar planejamento: ${err?.message || err}`);
      window.SIAPUI?.failGenerationProgress?.(err?.message || String(err));
    } finally {
      setRunningState(false);
    }
  }

  function isContextCompatible() {
    const current = window.SIAPContext.getCurrentContext();
    if (!S.generatedPlansContext) return true;

    return (
      S.generatedPlansContext.disciplina === current.disciplina &&
      S.generatedPlansContext.turma === current.turma
    );
  }

  async function applyNextPlan() {
    try {
      if (!Array.isArray(S.generatedPlans) || !S.generatedPlans.length) {
        return alertOrThrowFromHeadless('Primeiro gere os planejamentos.');
      }

      if (S.currentPlanIndex >= S.generatedPlans.length) {
        return alertOrThrowFromHeadless('Todas as aulas já foram aplicadas.');
      }

      if (!isContextCompatible()) {
        const current = window.SIAPContext.getCurrentContext();
        const msg =
          `Os planos carregados são para ${S.generatedPlansContext.disciplina} - ${S.generatedPlansContext.turma}, ` +
          `mas a página atual é ${current.disciplina} - ${current.turma}. Deseja limpar e gerar novos planos?`;

        if (confirm(msg)) {
          S.generatedPlans = [];
          S.currentPlanIndex = 0;
          S.generatedPlansContext = null;
          ST.saveState();
          window.SIAPUI.renderPreview();
          await generatePlans();
        }
        return;
      }

      ST.setAutoMode(false);
      setRunningState(true);

      const currentIndex = S.currentPlanIndex;

      await fillPlanOnPage(S.generatedPlans[currentIndex], true, () => {
        setPendingNextPlanIndex(currentIndex + 1, false);
        ST.setAutoMode(false);
        ST.saveState();
        L.log(`[DEBUG] Próximo índice ficou pendente até a mudança real da aula: ${currentIndex + 1}`);
      });

      if (S.currentPlanIndex >= S.generatedPlans.length) {
        L.log('Todas as aulas foram aplicadas.');
        notifyCompletion('Todas as aulas foram aplicadas.');
        clearPendingPreviousLessonNumber();
        clearPendingNextPlanIndex();
        ST.clearPlanExecutionState();
        window.SIAPUI.renderPreview();
        refreshSavedPlansMatch(true);
      } else {
        L.log(`Próxima aula: ${S.currentPlanIndex + 1}/${S.generatedPlans.length}`);
      }
    } catch (err) {
      console.error(err);
      L.log(`Erro ao aplicar: ${err.message || err}`);
      clearPendingNextPlanIndex();
      if (window.__SIAP_SAAS_HEADLESS__) throw err;
      alert(`Erro ao aplicar aula: ${err.message || err}`);
    } finally {
      setRunningState(false);
    }
  }

  async function applyAllPlans() {
    try {
      if (!Array.isArray(S.generatedPlans) || !S.generatedPlans.length) {
        return alertOrThrowFromHeadless('Primeiro gere os planejamentos.');
      }

      if (S.currentPlanIndex >= S.generatedPlans.length) {
        alert('Todas as aulas já foram aplicadas.');
        clearPendingPreviousLessonNumber();
        clearPendingNextPlanIndex();
        ST.clearPlanExecutionState();
        window.SIAPUI.renderPreview();
        refreshSavedPlansMatch(true);
        return;
      }

      if (!isContextCompatible()) {
        const current = window.SIAPContext.getCurrentContext();
        const msg =
          `Os planos carregados são para ${S.generatedPlansContext.disciplina} - ${S.generatedPlansContext.turma}, ` +
          `mas a página atual é ${current.disciplina} - ${current.turma}. Deseja limpar e gerar novos planos?`;

        if (confirm(msg)) {
          S.generatedPlans = [];
          S.currentPlanIndex = 0;
          S.generatedPlansContext = null;
          ST.saveState();
          window.SIAPUI.renderPreview();
          await generatePlans();
        }
        return;
      }

      ST.setAutoMode(true);
      ST.saveState();
      setRunningState(true);

      while (ST.isAutoMode() && S.currentPlanIndex < S.generatedPlans.length) {
        const currentIndex = S.currentPlanIndex;
        const total = S.generatedPlans.length;
        const isLastPlan = currentIndex >= (total - 1);

        L.log(`Processando aula automática ${currentIndex + 1}/${total}...`);

        await fillPlanOnPage(S.generatedPlans[currentIndex], true, () => {
          const nextIndex = currentIndex + 1;
          const isLastPending = nextIndex >= S.generatedPlans.length;

          setPendingNextPlanIndex(nextIndex, !isLastPending);

          if (isLastPending) {
            ST.setAutoMode(false);
            L.log('[DEBUG] Última aula detectada. Próximo índice ficou pendente até a mudança real da aula.');
          } else {
            ST.setAutoMode(true);
            L.log(`[DEBUG] Próxima aula ficou pendente até a mudança real da aula: ${nextIndex + 1}/${S.generatedPlans.length}`);
          }

          ST.saveState();
        });

        if (isLastPlan || S.currentPlanIndex >= S.generatedPlans.length) {
          break;
        }

        const pendingPreviousLesson = getPendingPreviousLessonNumber();
        const lessonAfterSave = getLessonNumberValue();
        L.log(`[AUTO] Aguardando retomada automática na próxima aula. atual=${lessonAfterSave || '-'} | anterior pendente=${pendingPreviousLesson || '-'}`);
        return;
      }

      if (S.currentPlanIndex >= S.generatedPlans.length) {
        L.log('Todas as aulas foram aplicadas com sucesso.');
        ST.setAutoMode(false);
        ST.saveState();
        notifyCompletion('Todas as aulas foram aplicadas.');
        clearPendingPreviousLessonNumber();
        clearPendingNextPlanIndex();
        ST.clearPlanExecutionState();
        window.SIAPUI.renderPreview();
        refreshSavedPlansMatch(true);
        return;
      }

      if (!ST.isAutoMode()) {
        L.log('Execução automática interrompida pelo usuário.');
        ST.saveState();
      }
    } catch (err) {
      console.error(err);
      L.log(`Erro no automático: ${err.message || err}`);
      clearPendingPreviousLessonNumber();
      clearPendingNextPlanIndex();
      ST.setAutoMode(false);
      setRunningState(false);
      if (window.__SIAP_SAAS_HEADLESS__) throw err;
      alert(`Erro no processamento automático: ${err.message || err}`);
      return false;
    } finally {
      setRunningState(false);
    }
  }

  function stopAutomation() {
    clearPendingPreviousLessonNumber();
    clearPendingNextPlanIndex();
    ST.setAutoMode(false);
    setRunningState(false);
    ST.saveState();
    L.log('Execução automática parada.');
  }

  async function autoResumeIfNeeded() {
    if (!ST.isAutoMode()) return false;
    if (!Array.isArray(S.generatedPlans) || !S.generatedPlans.length) return false;
    if (S.isRunning) return false;

    S.generatedPlans = normalizePlans(S.generatedPlans);

    if (S.currentPlanIndex >= S.generatedPlans.length) {
      L.log('Lote já finalizado.');
      ST.setAutoMode(false);
      setRunningState(false);
      return false;
    }

    const pendingPreviousLesson = getPendingPreviousLessonNumber();
    commitPendingAdvanceState(getLessonNumberValue());
    const state = getPageReadinessState(getPendingPreviousLessonNumber());
    if (!state.ready) {
      L.log(`Retomada automática ativa. Aguardando a aula ${S.currentPlanIndex + 1}/${S.generatedPlans.length} ficar pronta... número atual=${state.lessonNumber || '-'}${pendingPreviousLesson ? ' | aula anterior esperada=' + pendingPreviousLesson : ''}${state.missing.length ? ' | Pendências: ' + state.missing.join(', ') : ''}`);
      return false;
    }

    if (pendingPreviousLesson && state.lessonNumber && state.lessonNumber !== pendingPreviousLesson) {
      clearPendingPreviousLessonNumber();
    }

    L.log(`Retomando automaticamente: aula ${S.currentPlanIndex + 1} de ${S.generatedPlans.length}... número atual=${state.lessonNumber || '-'}`);
    await applyAllPlans();
    return true;
  }

  return {
    setRunningState,
    fillPlanOnPage,
    generatePlans,
    applyNextPlan,
    applyAllPlans,
    stopAutomation,
    autoResumeIfNeeded,
    normalizePlan,
    normalizePlans,
    attachRevisaMetadata,
    waitForPageReady,
    waitForStableSiapScreen,
    isPageReadyForApply,
    getLessonNumberValue,
    getPageReadinessState,
    refreshSavedPlansMatch,
    loadSavedPlansForCurrentContext,
    runSavedPlansForCurrentContext,
    saveGeneratedPlansToLibrary,
    setCurrentPlansFromLibraryEntry,
    commitPendingAdvanceState
  };
})();
