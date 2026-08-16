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

  function applyHeadlessUiAdapter() {
    window.__SIAP_SAAS_HEADLESS__ = true;
    const ui = window.SIAPUI;
    if (!ui) return;
    [
      'buildPanel', 'renderPreview', 'renderSavedPlanMatch', 'openPlanEditor', 'closePlanEditor',
      'updateGenerationProgress', 'startGenerationProgress', 'setGenerationProgress',
      'completeGenerationProgress', 'failGenerationProgress', 'refreshRevisaCatalog'
    ].forEach((name) => { ui[name] = noOp; });
    ui.getRevisaGenerationConfig = () => null;
  }

  function getPlanningContext() {
    const context = window.SIAPContext?.getCurrentContext?.() || {};
    if (!context.disciplina || !context.turma) {
      throw new Error('Abra a edição de uma aula e aguarde o SIAP identificar a turma e a disciplina.');
    }
    return context;
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
      const instruction = String(payload?.instruction || '').trim() ||
        'Sem instruções específicas. Gere os planejamentos utilizando apenas os conteúdos e habilidades disponíveis na árvore do SIAP.';
      const generationOptions = {
        customContentEnabled: !!payload?.customContentEnabled,
        replicateToOtherClass: !!payload?.replicateToOtherClass,
        revisaEnabled: false
      };
      const apiContext = { ...context, generationOptions, instructionResolution: { habilidades: [], conteudos: [] } };
      const prompt = window.SIAPApi?.buildPrompt?.(count, instruction, apiContext);
      if (!prompt) throw new Error('Não foi possível preparar o planejamento para a turma aberta.');
      return { prompt, count, context: { disciplina: context.disciplina, turma: context.turma, serieAno: context.serieAno, numeroAula: context.numeroAula } };
    }
    if (command === 'PLANNING_STORE') {
      const context = getPlanningContext();
      const result = parseProviderResponse(payload?.providerResponse);
      const generationOptions = {
        customContentEnabled: !!payload?.customContentEnabled,
        replicateToOtherClass: !!payload?.replicateToOtherClass,
        revisaEnabled: false
      };
      const apiContext = { ...context, generationOptions };
      const valid = window.SIAPApi?.validateAndFixPlan ? window.SIAPApi.validateAndFixPlan(result, apiContext) : result;
      if (!Array.isArray(valid?.aulas) || !valid.aulas.length) throw new Error('A IA não retornou aulas válidas para aplicar.');
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
      persistPlanningState();
      return getPlanningSnapshot();
    }
    if (command === 'FREQUENCY_CONFIGURE') {
      const months = Array.isArray(payload?.months) ? payload.months.map(Number).filter((n) => n >= 0 && n <= 11) : [];
      localStorage.setItem('siap_freq_v51_selected_months', JSON.stringify([...new Set(months)].sort((a, b) => a - b)));
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
      sessionStorage.setItem('tm_executor_conteudo_state_v13', JSON.stringify({ ...current, selectedMaterials, autoMode: !!payload?.autoMode }));
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
      data.comando_ia = String(payload?.instruction || '').trim();
      return data;
    }
    if (command === 'PEI_FILL') {
      if (!window.SIAPPEIApi?.fillFields) throw new Error('Motor de preenchimento do PEI indisponível.');
      window.SIAPPEIApi.fillFields(payload?.data || payload || {});
      return { filled: true };
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
        const result = await runHeadlessCommand(String(data.command || ''), data.payload || {});
        return send(data.requestId, true, result);
      }
      throw new Error('Ação da ponte não reconhecida.');
    } catch (err) {
      send(data.requestId, false, { message: err?.message || String(err) });
    }
  });
})();
