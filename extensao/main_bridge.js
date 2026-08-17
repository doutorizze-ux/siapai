(function () {
  'use strict';

  if (window.__SIAP_SAAS_MAIN_BRIDGE_READY__) return;
  window.__SIAP_SAAS_MAIN_BRIDGE_READY__ = true;

  function send(requestId, ok, payload) {
    window.postMessage({ source: 'SIAP_SAAS_MAIN_BRIDGE', requestId, ok: !!ok, payload: payload || {} }, '*');
  }

  function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

  async function waitForAnyGlobal(names, timeoutMs) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      for (const name of names) if (window[name]) return window[name];
      await sleep(150);
    }
    return null;
  }

  function noOp() {}

  function readRuntimeAuth() {
    const values = [window.SIAP_SAAS_AUTH, globalThis.SIAP_SAAS_AUTH];
    try { values.push(sessionStorage.getItem('SIAP_SAAS_AUTH')); } catch (_) {}
    try { values.push(localStorage.getItem('SIAP_SAAS_AUTH')); } catch (_) {}
    for (const value of values) {
      if (!value) continue;
      if (typeof value === 'object') return value;
      try {
        const parsed = JSON.parse(value);
        if (parsed && typeof parsed === 'object') return parsed;
      } catch (_) {}
    }
    return null;
  }

  function assertRuntimeLicense(command) {
    const isStopCommand = command === 'PLANNING_STOP' || command === 'FREQUENCY_STOP' || command === 'CONTENT_STOP';
    if (isStopCommand) return;
    const auth = readRuntimeAuth();
    let token = String(window.SIAP_SAAS_TOKEN || globalThis.SIAP_SAAS_TOKEN || '').trim();
    if (!token) {
      try { token = String(sessionStorage.getItem('SIAP_SAAS_TOKEN') || '').trim(); } catch (_) {}
    }
    if (!token) {
      try { token = String(localStorage.getItem('SIAP_SAAS_TOKEN') || '').trim(); } catch (_) {}
    }
    if (auth?.accessGranted !== true || !token) {
      throw new Error('Licença ativa obrigatória. Valide o e-mail no painel lateral antes de usar este módulo.');
    }
  }

  function applyHeadlessUiAdapter() {
    window.__SIAP_SAAS_HEADLESS__ = true;
    const ui = window.SIAPUI;
    if (!ui) return;
        [ 'buildPanel', 'renderPreview', 'renderSavedPlanMatch', 'openPlanEditor', 'closePlanEditor',
      'updateGenerationProgress', 'startGenerationProgress', 'setGenerationProgress',
      'completeGenerationProgress', 'failGenerationProgress', 'refreshRevisaCatalog'
    ].forEach((name) => { ui[name] = noOp; });
    ui.getRevisaGenerationConfig = () => readRevisaGenerationConfig();
  }

  function getPlanningContext() {
    const context = window.SIAPContext?.getCurrentContext?.() || {};
    if (!context.disciplina || !context.turma) {
      throw new Error('Abra a edição de uma aula e aguarde o SIAP identificar a turma e a disciplina.');
    }
    return context;
  }

  const REVISa_CONFIG_KEY = 'siap_planejamento_revisa_config_v1';

  function readRevisaGenerationConfig() {
    try {
      const raw = sessionStorage.getItem(REVISa_CONFIG_KEY);
      const config = raw ? JSON.parse(raw) : null;
      if (!config?.enabled) return null;
      return config;
    } catch (_) { return null; }
  }

  function persistRevisaConfig(config) {
    try {
      if (config && Object.keys(config).length) {
        sessionStorage.setItem(REVISa_CONFIG_KEY, JSON.stringify({ enabled: true, ...config }));
        const state = window.SIAPState || {};
        state.revisaEnabled = true;
        state.revisaSelection = { enabled: true, ...config, contextKey: '' };
      } else {
        sessionStorage.removeItem(REVISa_CONFIG_KEY);
        const state = window.SIAPState || {};
        state.revisaEnabled = false;
        state.revisaSelection = null;
      }
    } catch (_) {}
  }

  function attachRevisaMetadataToPlans(plans, revisaConfig, revisaContext = null) {
    if (!Array.isArray(plans) || !revisaConfig) return plans;
    const referenceInstruction = window.SIAPApi?.getRevisaReferenceInstruction?.(
      revisaContext && typeof revisaContext === 'object'
        ? { atividades: Array.isArray(revisaContext.atividades) ? revisaContext.atividades : [], ...revisaContext }
        : { materialId: revisaConfig.materialId, blocoId: revisaConfig.blocoId, sequenciaId: revisaConfig.sequenciaId }
    );
    const revisaContextSafe = revisaContext && typeof revisaContext === 'object' ? revisaContext : {};
    const sequenciaInfo = Array.isArray(revisaConfig.sequenciaInfo) ? revisaConfig.sequenciaInfo : [];
    const atividades = Array.isArray(revisaConfig.atividades) ? revisaConfig.atividades : [];
    const paginaInicial = Number(revisaConfig.paginaInicial) || 1;
    const paginaFinal = Number(revisaConfig.paginaFinal) || 1;
    return plans.map((plan) => ({
      ...plan,
      revisa: {
        enabled: true,
        materialId: revisaConfig.materialId,
        componenteId: revisaConfig.componenteId || 0,
        blocoId: revisaConfig.blocoId,
        sequenciaId: revisaConfig.sequenciaId,
        sequenciaNome: String(revisaConfig.sequenciaNome || ''),
        sequenciaTitulo: String(revisaConfig.sequenciaTitulo || ''),
        atividadeIds: Array.isArray(atividades) ? atividades : (Array.isArray(revisaContextSafe.atividades) ? revisaContextSafe.atividades.map((item) => Number(item?.id || item?.ordem || 0)).filter(Boolean) : []),
        paginas: { from: paginaInicial, to: paginaFinal },
        modoSelecao: String(revisaConfig.modoSelecao || 'sequencia'),
        modoUso: String(revisaConfig.modoUso || 'principal')
      },
      metodologia: referenceInstruction ? `${plan?.metodologia || ''}\n\n${referenceInstruction}`.trim() : (plan?.metodologia || '')
    }));
  }

  function getPlanningSnapshot() {
    const state = window.SIAPState || {};
    const plans = Array.isArray(state.generatedPlans) ? state.generatedPlans : [];
    return {
      count: plans.length,
      currentIndex: Number(state.currentPlanIndex || 0),
      plans,
      context: state.generatedPlansContext || null,
      isRunning: !!state.isRunning
    };
  }

  function persistPlanningState() {
    const state = window.SIAPState || {};
    const keys = window.SIAPConfig?.STORAGE_KEYS || {};
    sessionStorage.setItem(keys.GENERATED_PLANS || 'tm_gpt_generatedPlans', JSON.stringify(state.generatedPlans || []));
    sessionStorage.setItem(keys.CURRENT_PLAN_INDEX || 'tm_gpt_currentPlanIndex', String(state.currentPlanIndex || 0));
    sessionStorage.setItem(keys.GENERATED_PLANS_CONTEXT || 'tm_gpt_generatedPlansContext', JSON.stringify(state.generatedPlansContext || null));
    sessionStorage.setItem(keys.ENABLE_CUSTOM_CONTENT || 'tm_gpt_enable_custom_content', state.enableCustomContent ? '1' : '');
    sessionStorage.setItem(keys.REPLICATE_TO_OTHER_CLASS || 'tm_gpt_replicate_to_other_class', state.replicateToOtherClass ? '1' : '');
  }

  function extractJson(text) {
    const raw = String(text || '').trim();
    if (!raw) throw new Error('A IA não retornou conteúdo.');
    try { return JSON.parse(raw); } catch (_) {}
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) return JSON.parse(fenced[1].trim());
    const first = raw.indexOf('{');
    const last = raw.lastIndexOf('}');
    if (first >= 0 && last > first) return JSON.parse(raw.slice(first, last + 1));
    throw new Error('A resposta da IA não contém um JSON de planejamento válido.');
  }

  function parseProviderResponse(payload) {
    if (payload?.aulas && Array.isArray(payload.aulas)) return payload;
    const provider = payload?.data && typeof payload.data === 'object' ? payload.data : payload;
    const content = provider?.choices?.[0]?.message?.content || provider?.output_text || provider?.content;
    return extractJson(content);
  }

  function getSavedPlanLibrary() {
    try { return JSON.parse(localStorage.getItem('tm_gpt_plan_library') || '[]'); } catch (_) { return []; }
  }

  async function initHeadlessPage(pageKey, requiredGlobals) {
    if (pageKey === 'conteudo') {
      await waitForAnyGlobal(['SIAPExecutorConteudo', 'SIAPValidarConteudo'], 6000);
      if (!window.SIAPExecutorConteudo && window.SIAPValidarConteudo) window.SIAPExecutorConteudo = window.SIAPValidarConteudo;
      if (!window.SIAPValidarConteudo && window.SIAPExecutorConteudo) window.SIAPValidarConteudo = window.SIAPExecutorConteudo;
    }
    const missing = (requiredGlobals || []).filter((name) => !window[name]);
    if (missing.length) throw new Error('Módulos ausentes: ' + missing.join(', '));
    applyHeadlessUiAdapter();
    if (pageKey === 'planejamento') {
      if (!window.SIAPBootstrap?.init) throw new Error('Motor de Planejamento indisponível.');
      window.SIAPBootstrap.init();
    } else if (pageKey === 'frequencia') {
      if (!window.SIAPFrequencia?.init) throw new Error('Motor de Frequência indisponível.');
      window.SIAPFrequencia.init();
    } else if (pageKey === 'conteudo') {
      const mod = window.SIAPExecutorConteudo || window.SIAPValidarConteudo;
      if (!mod?.init) throw new Error('Motor de Conteúdo indisponível.');
      mod.init();
    }
  }

  async function runHeadlessCommand(command, payload) {
    applyHeadlessUiAdapter();
    if (command === 'PLANNING_PREPARE') {
      const context = getPlanningContext();
      const count = Math.max(1, Math.min(20, Number(payload?.count) || 1));
      const revisaConfig = payload?.revisaConfig && typeof payload.revisaConfig === 'object' ? payload.revisaConfig : null;
      const instruction = String(payload?.instruction || '').trim() ||
        'Sem instruções específicas. Gere os planejamentos utilizando apenas os conteúdos e habilidades disponíveis na árvore do SIAP.';
      let revisaContext = null;
      let referenceInstruction = '';
      if (revisaConfig && window.SIAPApi?.prepareRevisaSelection) {
        try {
          revisaContext = await window.SIAPApi.prepareRevisaSelection({
            materialId: revisaConfig.materialId,
            componenteId: revisaConfig.componenteId,
            blocoId: revisaConfig.blocoId,
            sequenciaId: revisaConfig.sequenciaId,
            modoSelecao: revisaConfig.modoSelecao || 'sequencia',
            atividadeInicialOrdem: revisaConfig.atividadeInicialOrdem,
            atividadeFinalOrdem: revisaConfig.atividadeFinalOrdem,
            paginaInicial: revisaConfig.paginaInicial,
            paginaFinal: revisaConfig.paginaFinal,
            continuar: !!revisaConfig.continuar,
            qtdAulas: count,
            modoUso: revisaConfig.modoUso || 'principal'
          }, context, count);
          referenceInstruction = window.SIAPApi?.getRevisaReferenceInstruction?.(revisaContext) || '';
        } catch (error) {
          throw new Error(`Não foi possível preparar o material Revisa: ${error?.message || 'falha na consulta'}.`);
        }
      }
      const generationOptions = {
        customContentEnabled: !!payload?.customContentEnabled,
        replicateToOtherClass: !!payload?.replicateToOtherClass,
        revisaEnabled: !!revisaConfig
      };
      const apiContext = { ...context, generationOptions, instructionResolution: { habilidades: [], conteudos: [] } };
      const combinedInstruction = referenceInstruction ? `${instruction}\n\n${referenceInstruction}`.trim() : instruction;
      const prompt = window.SIAPApi?.buildPrompt?.(count, combinedInstruction, apiContext);
      if (!prompt) throw new Error('Não foi possível preparar o planejamento para a turma aberta.');
      persistRevisaConfig(revisaConfig ? { ...revisaConfig, modoUso: revisaContext?.modo_uso || revisaConfig.modoUso || 'principal' } : null);
      return { prompt, count, context: { disciplina: context.disciplina, turma: context.turma, serieAno: context.serieAno, numeroAula: context.numeroAula }, revisaConfig, revisaContext };
    }
    if (command === 'PLANNING_STORE') {
      const context = getPlanningContext();
      const result = parseProviderResponse(payload?.providerResponse);
      const requestedCount = Math.max(1, Math.min(20, Number(payload?.count) || 1));
      const revisaConfig = payload?.revisaConfig && typeof payload.revisaConfig === 'object' ? payload.revisaConfig : null;
      const generationOptions = {
        customContentEnabled: !!payload?.customContentEnabled,
        replicateToOtherClass: !!payload?.replicateToOtherClass,
        revisaEnabled: !!revisaConfig
      };
      const apiContext = { ...context, generationOptions };
      const valid = window.SIAPApi?.validateAndFixPlan ? window.SIAPApi.validateAndFixPlan(result, apiContext) : result;
      if (!Array.isArray(valid?.aulas) || !valid.aulas.length) throw new Error('A IA não retornou aulas válidas para aplicar.');
      // A resposta da IA pode ignorar o tamanho solicitado e devolver um lote
      // padrão. O painel só pode disponibilizar exatamente a quantidade que o
      // professor escolheu, inclusive no caso de apenas uma aula.
      valid.aulas = valid.aulas.slice(0, requestedCount);
      if (revisaConfig) {
        const revisaContextPayload = payload?.revisaContext && typeof payload.revisaContext === 'object' ? payload.revisaContext : null;
        valid.aulas = attachRevisaMetadataToPlans(valid.aulas, revisaConfig, revisaContextPayload);
      }
      persistRevisaConfig(revisaConfig);
      const state = window.SIAPState;
      state.generatedPlans = valid.aulas;
      state.currentPlanIndex = 0;
      state.uploadedText = String(payload?.supportText || '');
      state.enableCustomContent = generationOptions.customContentEnabled;
      state.replicateToOtherClass = generationOptions.replicateToOtherClass;
      state.generatedPlansContext = {
        disciplina: context.disciplina,
        turma: context.turma,
        serieAno: context.serieAno,
        numeroAulaInicial: context.numeroAula || ''
      };
      window.SIAPStorage?.setAutoMode?.(false);
      persistPlanningState();
      window.SIAPExecutor?.saveGeneratedPlansToLibrary?.(context, valid.aulas);
      return getPlanningSnapshot();
    }
    if (command === 'PLANNING_SNAPSHOT') return { ...getPlanningSnapshot(), savedPlans: getSavedPlanLibrary() };
    if (command === 'REVISA_CATALOG') {
      assertRuntimeLicense('REVISA_CATALOG');
      const context = getPlanningContext();
      if (!window.SIAPApi?.loadRevisaCatalog) throw new Error('O catálogo Revisa não está disponível nesta página do SIAP.');
      const catalog = await window.SIAPApi.loadRevisaCatalog(context);
      const result = catalog && typeof catalog === 'object' ? catalog : { disponivel: false, materiais: [] };
      if (!result.disponivel || !Array.isArray(result.materiais)) {
        return { disponivel: false, materiais: [], contextKey: '' };
      }
      const contextKey = `${String(context.serieAno || '')}|${String(context.disciplina || '')}`.toLowerCase();
      return { ...result, contextKey };
    }
    if (command === 'PLANNING_APPLY_NEXT') {
      await window.SIAPExecutor?.applyNextPlan?.();
      return getPlanningSnapshot();
    }
    if (command === 'PLANNING_APPLY_ALL') {
      await window.SIAPExecutor?.applyAllPlans?.();
      return getPlanningSnapshot();
    }
    if (command === 'PLANNING_STOP') {
      window.SIAPExecutor?.stopAutomation?.();
      return getPlanningSnapshot();
    }
    if (command === 'PLANNING_LOAD_SAVED') {
      const item = getSavedPlanLibrary().find((entry) => entry?.id === payload?.id);
      if (!item?.plans?.length) throw new Error('O lote salvo selecionado não está mais disponível.');
      const state = window.SIAPState;
      state.generatedPlans = item.plans;
      state.currentPlanIndex = 0;
      state.generatedPlansContext = {
        disciplina: item.disciplina || '', turma: item.turma || '', serieAno: item.serieAno || '', numeroAulaInicial: item.numeroAulaInicial || ''
      };
      const savedRevisa = Array.isArray(item.plans) && item.plans[0]?.revisa ? item.plans[0].revisa : null;
      const savedRevisaConfig = savedRevisa
        ? {
            materialId: savedRevisa.materialId, componenteId: savedRevisa.componenteId || 0,
            blocoId: savedRevisa.blocoId, sequenciaId: savedRevisa.sequenciaId,
            sequenciaNome: savedRevisa.sequenciaNome || '', sequenciaTitulo: savedRevisa.sequenciaTitulo || '',
            modoSelecao: savedRevisa.modoSelecao || 'sequencia', modoUso: savedRevisa.modoUso || 'principal',
            atividadeInicialOrdem: 1, atividadeFinalOrdem: 1, paginaInicial: savedRevisa.paginas?.from || 1,
            paginaFinal: savedRevisa.paginas?.to || 1, continuar: !!savedRevisa.continuar
          }
        : null;
      persistRevisaConfig(savedRevisaConfig);
      persistPlanningState();
      return getPlanningSnapshot();
    }
    if (command === 'FREQUENCY_CONFIGURE') {
      const months = Array.isArray(payload?.months) ? payload.months.map(Number).filter((n) => n >= 0 && n <= 11) : [];
      localStorage.setItem('siap_freq_v51_selected_months', JSON.stringify([...new Set(months)].sort((a, b) => a - b)));
      sessionStorage.removeItem('siap_freq_v51_done_months');
      sessionStorage.removeItem('siap_freq_v51_target_month');
      sessionStorage.removeItem('siap_freq_v51_current_day');
      sessionStorage.removeItem('siap_freq_v51_pending_save_day');
      sessionStorage.removeItem('siap_freq_v51_pending_save_at');
      sessionStorage.setItem('siap_freq_v51_phase', 'click_day');
      return { months };
    }
    if (command === 'FREQUENCY_START') {
      sessionStorage.setItem('siap_freq_v51_active', '1');
      sessionStorage.removeItem('siap_freq_v51_blocked');
      await window.SIAPFrequencia?.start?.();
      return { active: true };
    }
    if (command === 'FREQUENCY_STOP') {
      window.SIAPFrequencia?.stop?.();
      return { active: false };
    }
    if (command === 'CONTENT_CONFIGURE') {
      const months = Array.isArray(payload?.months) ? payload.months.map(Number).filter((n) => n >= 0 && n <= 11) : [];
      localStorage.setItem('tm_executor_conteudo_selected_months_v13', JSON.stringify([...new Set(months)].sort((a, b) => a - b)));
      localStorage.setItem('tm_executor_conteudo_double_lesson_v13', payload?.doubleLesson ? '1' : '');
      localStorage.setItem('tm_executor_conteudo_other_material_text_v13', String(payload?.otherMaterialText || '').slice(0, 50));
      const current = JSON.parse(sessionStorage.getItem('tm_executor_conteudo_state_v13') || '{}');
      const selectedMaterials = Array.isArray(payload?.materials) ? payload.materials : [];
      sessionStorage.setItem('tm_executor_conteudo_state_v13', JSON.stringify({
        ...current,
        selectedMaterials,
        autoMode: !!payload?.autoMode,
        stage: 'idle',
        currentDay: '',
        targetMonth: null,
        currentLesson: 1,
        deferredDay: '',
        forceNextDay: '',
        revisitingDeferred: false,
        doneMonths: [],
        pendingSaveDay: '',
        pendingSaveStartedAt: 0,
        afterSave: null
      }));
      return { months, materials: selectedMaterials };
    }
    if (command === 'CONTENT_MATERIAL_OPTIONS') {
      const grid = document.querySelector('#cphFuncionalidade_cphCampos_GrdMaterialApoio');
      const nativeOptions = grid ? [...grid.querySelectorAll('tr')]
        .map((row) => String(row.querySelector('.descricao-item-grade')?.textContent || '').trim())
        .filter(Boolean) : [];
      const current = JSON.parse(sessionStorage.getItem('tm_executor_conteudo_state_v13') || '{}');
      return {
        options: [...new Set([...nativeOptions, 'Nenhum material de apoio utilizado'])],
        selected: Array.isArray(current.selectedMaterials) ? current.selectedMaterials : [],
        otherMaterialText: localStorage.getItem('tm_executor_conteudo_other_material_text_v13') || ''
      };
    }
    if (command === 'CONTENT_START') {
      const current = JSON.parse(sessionStorage.getItem('tm_executor_conteudo_state_v13') || '{}');
      sessionStorage.setItem('tm_executor_conteudo_state_v13', JSON.stringify({ ...current, autoMode: true, stage: current.stage || 'idle' }));
      await window.SIAPExecutorConteudo?.run?.();
      return { active: true };
    }
    if (command === 'CONTENT_STOP') {
      window.SIAPExecutorConteudo?.stop?.();
      return { active: false };
    }
    if (command === 'PEI_COLLECT') {
      if (!window.SIAPPEIApi?.collectPayload) throw new Error('Abra a tela de PEI compatível do SIAP.');
      const data = window.SIAPPEIApi.collectPayload();
      const months = Array.isArray(payload?.months) ? payload.months.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 11) : [];
      if (!months.length) throw new Error('Selecione ao menos um mês permitido para o PEI.');
      const bimestre = parseInt(String(data.bimestre || '').match(/[1-4]/)?.[0] || '', 10);
      if (!Number.isInteger(bimestre)) throw new Error('Não foi possível identificar o bimestre exibido no PEI do SIAP.');
      const periodMonths = [(bimestre - 1) * 3, (bimestre - 1) * 3 + 1, (bimestre - 1) * 3 + 2];
      if (!months.some((month) => periodMonths.includes(month))) {
        throw new Error(`O PEI aberto é do ${bimestre}º bimestre e não pertence aos meses selecionados.`);
      }
      data.comando_ia = String(payload?.instruction || '').trim();
      data.meses_selecionados = months;
      data.meses_bimestre = periodMonths;
      return data;
    }
    if (command === 'PEI_FILL') {
      if (!window.SIAPPEIApi?.fillFields) throw new Error('Motor de preenchimento do PEI indisponível.');
      window.SIAPPEIApi.fillFields(payload?.data || payload || {});
      return { filled: true };
    }
    if (command === 'PEI_FILL_AND_SAVE') {
      if (!window.SIAPPEIApi?.fillAndSave) throw new Error('Motor de salvamento do PEI indisponível.');
      return await window.SIAPPEIApi.fillAndSave(payload?.data || payload || {});
    }
    throw new Error('Comando não reconhecido pelo motor da extensão.');
  }

  window.addEventListener('message', async (event) => {
    const data = event?.data;
    if (!data || data.source !== 'SIAP_SAAS_CONTENT' || !data.requestId) return;
    try {
      if (data.action === 'ping') return send(data.requestId, true, { ready: true });
      if (data.action === 'activateHeadless') {
        window.__SIAP_SAAS_HEADLESS__ = true;
        return send(data.requestId, true, { headless: true });
      }
      if (data.action === 'executeCode') {
        const code = String(data.code || '');
        if (!code.trim()) throw new Error('Código vazio recebido pela ponte.');
        (0, eval)(code + '\n//# sourceURL=' + (data.sourceName || 'siapai-module.js'));
        return send(data.requestId, true, { executed: true });
      }
      if (data.action === 'initHeadless') {
        await initHeadlessPage(data.pageKey, data.requiredGlobals || []);
        return send(data.requestId, true, { initialized: true, pageKey: data.pageKey });
      }
      if (data.action === 'engineCommand') {
        const command = String(data.command || '');
        assertRuntimeLicense(command);
        const result = await runHeadlessCommand(command, data.payload || {});
        return send(data.requestId, true, result);
      }
      throw new Error('Ação da ponte não reconhecida.');
    } catch (err) {
      send(data.requestId, false, { message: err?.message || String(err) });
    }
  });
})();
