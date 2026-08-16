window.SIAPBootstrap = (() => {
  let lastContextAlertKey = '';

  function buildAlertKey(context, match) {
    const turma = String(context?.turma || '').trim();
    const disciplina = String(context?.disciplina || '').trim();
    const origem = String(match?.entry?.turmaOrigem || '').trim();
    const inicio = String(match?.entry?.numeroAulaInicial || '').trim();
    return `${disciplina}__${turma}__${origem}__${inicio}`;
  }

  function maybeAlertSavedPlans(context, match) {
    if (!match || !match.entry) return;

    const alertKey = buildAlertKey(context, match);
    if (!alertKey || alertKey === lastContextAlertKey) return;
    lastContextAlertKey = alertKey;

    const turmaAtual = String(context?.turma || '-').trim();
    const turmaOrigem = String(match.entry.turmaOrigem || '-').trim();
    const disciplina = String(context?.disciplina || '-').trim();
    const inicio = String(match.entry.numeroAulaInicial || '-').trim();
    const fim = String(match.entry.numeroAulaFinal || '-').trim();
    const total = Array.isArray(match.entry.plans) ? match.entry.plans.length : Number(match.entry.totalAulas || 0);
    const status = match.inRange
      ? `A turma ${turmaAtual} já está dentro da faixa desse lote salvo.`
      : `A turma ${turmaAtual} está fora da faixa exata do lote, mas você já pode carregá-lo pelo painel.`;

    window.alert(
      `Já existem aulas salvas para ${disciplina} na série ${context?.serieAno || '-'} (${turmaOrigem} → ${turmaAtual}).\n\n` +
      `Faixa do lote: aula ${inicio} até ${fim}\n` +
      `Total de aulas: ${total}\n\n` +
      `${status}\n\n` +
      `No painel, clique em "Aplicar aulas salvas agora".`
    );
  }

  function init() {
    // PRIORIDADE MÁXIMA: mostrar o painel imediatamente.
    // Nenhuma consulta de catálogo/Revisa/lote deve bloquear a interface.
    try {
      window.SIAPStorage.loadState();
    } catch (err) {
      console.error(err);
    }

    try {
      window.SIAPUI.buildPanel();
      window.SIAPUI.renderPreview();
      window.SIAPLogger.log('Painel iniciado com sucesso.');
    } catch (err) {
      console.error('[SIAP Bootstrap] Falha ao montar painel imediatamente:', err);
    }

    // Liga apenas os watchers leves logo em seguida.
    try {
      if (window.SIAPBimestre && typeof window.SIAPBimestre.init === 'function') {
        window.SIAPBimestre.init();
      }
      if (window.SIAPEixo && typeof window.SIAPEixo.init === 'function') {
        window.SIAPEixo.init();
      }
    } catch (err) {
      console.error(err);
    }

    // Todo o restante fica em segundo plano para não atrasar a abertura do painel.
    setTimeout(() => {
      try {
        if (window.SIAPExecutor && typeof window.SIAPExecutor.commitPendingAdvanceState === 'function') {
          window.SIAPExecutor.commitPendingAdvanceState();
        }
      } catch (err) {
        console.error(err);
      }

      try {
        if (window.SIAPExecutor && typeof window.SIAPExecutor.refreshSavedPlansMatch === 'function') {
          window.SIAPExecutor.refreshSavedPlansMatch(true);
        } else {
          window.SIAPUI.renderSavedPlanMatch();
        }
      } catch (err) {
        console.error(err);
      }

      try {
        scheduleSavedPlanRefresh();
      } catch (err) {
        console.error(err);
      }

      try {
        if (window.SIAPApi && typeof window.SIAPApi.startCatalogSync === 'function') {
          window.SIAPApi.startCatalogSync();
        }
      } catch (err) {
        console.error(err);
      }
    }, 0);

    if (window.SIAPContext && typeof window.SIAPContext.startWatcher === 'function') {
      window.SIAPContext.startWatcher((newContext, oldContext) => {
        window.SIAPLogger.log(`Contexto alterado: ${oldContext?.chave || 'nenhum'} -> ${newContext.chave}`);

        if (window.SIAPStorage.isAutoMode() || window.SIAPState.isRunning) {
          return;
        }

        if (window.SIAPState.generatedPlans && window.SIAPState.generatedPlans.length > 0) {
          const planCtx = window.SIAPState.generatedPlansContext;
          const sameContext = !!(planCtx && planCtx.disciplina === newContext.disciplina && planCtx.turma === newContext.turma);
          if (!sameContext) {
            window.SIAPLogger.log('Contexto mudou. Limpando o lote carregado para evitar aplicação na turma errada.');
            window.SIAPStorage.clearPlanExecutionState();
            window.SIAPUI.renderPreview();
          }
        }

        if (window.SIAPExecutor && typeof window.SIAPExecutor.refreshSavedPlansMatch === 'function') {
          const match = window.SIAPExecutor.refreshSavedPlansMatch();
          if (match && match.entry) {
            window.SIAPLogger.log(`Há aulas salvas para ${newContext.disciplina} - série ${newContext.serieAno}. Use o painel para executar.`);
            maybeAlertSavedPlans(newContext, match);
          }
        } else {
          window.SIAPUI.renderSavedPlanMatch();
        }
      }, 1500);
    } else {
      window.SIAPLogger.log('Aviso: SIAPContext.startWatcher não disponível');
    }

    scheduleAutoResume();
  }


  function scheduleSavedPlanRefresh() {
    let runs = 0;
    const maxRuns = 20;
    const tick = () => {
      runs++;
      try {
        if (window.SIAPExecutor && typeof window.SIAPExecutor.refreshSavedPlansMatch === 'function') {
          const match = window.SIAPExecutor.refreshSavedPlansMatch(true);
          const box = document.querySelector('#tm-gpt-reuse-box');
          if (match && match.entry && box) {
            box.scrollTop = 0;
            if (runs <= 2) {
              window.SIAPLogger.log(`Lote salvo detectado para ${match.entry.disciplina} / série ${match.entry.serieAno}. Use o botão do painel para aplicar.`);
            }
          }
        }
      } catch (err) {
        console.error(err);
      }
      if (runs < maxRuns) setTimeout(tick, 1500);
    };
    setTimeout(tick, 700);
  }

  function scheduleAutoResume() {
    const intervalMs = 1800;
    let attempt = 0;
    let running = false;

    async function tryResume() {
      if (running) return;
      if (!window.SIAPStorage.isAutoMode()) return;

      running = true;
      attempt++;

      if (attempt === 1 || attempt % 5 === 0) {
        window.SIAPLogger.log(`[AUTO] Verificando retomada automática (${attempt})...`);
      }

      try {
        const resumed = await window.SIAPExecutor.autoResumeIfNeeded();
        if (resumed) {
          running = false;
          return;
        }
      } catch (err) {
        console.error(err);
        window.SIAPLogger.log(`[AUTO] Falha na retomada: ${err.message || err}`);
      }

      running = false;

      if (window.SIAPStorage.isAutoMode()) {
        setTimeout(tryResume, intervalMs);
      }
    }

    setTimeout(tryResume, 1200);
    window.addEventListener('load', () => {
      if (window.SIAPStorage.isAutoMode()) {
        setTimeout(tryResume, 600);
      }
    });
  }

  return { init };
})();
