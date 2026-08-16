window.SIAPUI = (() => {
  const S = window.SIAPState;
  const ST = window.SIAPStorage;
  const L = window.SIAPLogger;
  const U = window.SIAPUtils;
  const E = window.SIAPExecutor;
  const A = window.SIAPApi;
  const K = window.SIAPConfig.STORAGE_KEYS;

  function truncateText(text, max = 180) {
    const raw = String(text || '');
    return `${U.escapeHtml(raw.slice(0, max))}${raw.length > max ? '...' : ''}`;
  }

  function syncEditedPlansToLibrary() {
    try {
      if (!S.generatedPlansContext || !Array.isArray(S.generatedPlans) || !S.generatedPlans.length) return;
      if (!ST || typeof ST.getPlanLibrary !== 'function' || typeof ST.savePlanLibrary !== 'function') return;

      const context = S.generatedPlansContext || {};
      const currentContext = window.SIAPContext?.getCurrentContext?.() || {};
      const disciplina = context.disciplina || currentContext.disciplina || '';
      const turma = context.turma || currentContext.turma || '';
      const serieAno = context.serieAno || currentContext.serieAno || ST.getSerieAnoFromTurma?.(turma) || '';
      const numeroAulaInicial = context.numeroAulaInicial || currentContext.numeroAula || '';

      const match = ST.findMatchingPlanLibraryEntry?.({ disciplina, turma, serieAno }, numeroAulaInicial);
      const library = ST.getPlanLibrary();
      if (!Array.isArray(library) || !library.length || !match?.entry?.id) return;

      const idx = library.findIndex((item) => item && item.id === match.entry.id);
      if (idx < 0) return;

      library[idx] = {
        ...library[idx],
        plans: S.generatedPlans,
        totalAulas: S.generatedPlans.length,
        updatedAt: new Date().toISOString()
      };
      ST.savePlanLibrary(library);
    } catch (e) {
      console.warn('[SIAPUI] Falha ao sincronizar edição com biblioteca:', e);
    }
  }

  function closePlanEditor() {
    const modal = document.querySelector('#tm-gpt-editor-modal');
    if (modal) modal.remove();
  }

  function openPlanEditor(index) {
    const plans = Array.isArray(S.generatedPlans) ? S.generatedPlans : [];
    const plan = plans[index];
    if (!plan) {
      alert('Aula não encontrada para edição.');
      return;
    }

    closePlanEditor();

    const modal = document.createElement('div');
    modal.id = 'tm-gpt-editor-modal';
    modal.innerHTML = `
      <div class="tm-gpt-editor-backdrop"></div>
      <div class="tm-gpt-editor-window" role="dialog" aria-modal="true" aria-label="Editar aula gerada">
        <div class="tm-gpt-editor-header">
          <div>
            <div class="tm-gpt-editor-title">Editar Aula ${index + 1}</div>
            <div class="tm-gpt-editor-subtitle">${plan.titulo ? U.escapeHtml(plan.titulo) : 'Planejamento gerado'}</div>
          </div>
          <button id="tm-gpt-editor-close" type="button" title="Fechar">×</button>
        </div>

        <div class="tm-gpt-editor-info">
          <div><b>Habilidades:</b> ${(plan.habilidades || []).map(U.escapeHtml).join(' | ') || '-'}</div>
          <div><b>Conteúdos:</b> ${(plan.conteudos || []).map(U.escapeHtml).join(' | ') || '-'}</div>
          ${Array.isArray(plan.matrizSaeb) && plan.matrizSaeb.length ? `<div><b>Matriz SAEB:</b> ${plan.matrizSaeb.map(U.escapeHtml).join(' | ')}</div>` : ''}
        </div>

        <label class="tm-gpt-editor-label" for="tm-gpt-editor-metodologia">Metodologia</label>
        <textarea id="tm-gpt-editor-metodologia">${U.escapeHtml(plan.metodologia || '')}</textarea>

        <label class="tm-gpt-editor-label" for="tm-gpt-editor-avaliacao">Avaliação</label>
        <textarea id="tm-gpt-editor-avaliacao">${U.escapeHtml(plan.avaliacao || '')}</textarea>

        <div class="tm-gpt-editor-actions">
          <button id="tm-gpt-editor-cancel" type="button">Cancelar</button>
          <button id="tm-gpt-editor-save" type="button">Salvar alterações</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const metodologiaEl = modal.querySelector('#tm-gpt-editor-metodologia');
    const avaliacaoEl = modal.querySelector('#tm-gpt-editor-avaliacao');
    const closeBtn = modal.querySelector('#tm-gpt-editor-close');
    const cancelBtn = modal.querySelector('#tm-gpt-editor-cancel');
    const saveBtn = modal.querySelector('#tm-gpt-editor-save');

    function saveEdit() {
      const metodologia = metodologiaEl?.value?.trim() || '';
      const avaliacao = avaliacaoEl?.value?.trim() || '';

      if (!metodologia || !avaliacao) {
        alert('Metodologia e avaliação não podem ficar vazias.');
        return;
      }

      S.generatedPlans[index] = {
        ...S.generatedPlans[index],
        metodologia,
        avaliacao,
        editadoPeloUsuario: true,
        editadoEm: new Date().toISOString()
      };

      ST.saveState();
      syncEditedPlansToLibrary();
      renderPreview();
      closePlanEditor();
      L.log(`Aula ${index + 1} editada na prévia. Metodologia e avaliação atualizadas.`);
    }

    closeBtn?.addEventListener('click', closePlanEditor);
    cancelBtn?.addEventListener('click', closePlanEditor);
    saveBtn?.addEventListener('click', saveEdit);
    modal.querySelector('.tm-gpt-editor-backdrop')?.addEventListener('click', closePlanEditor);
    modal.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') closePlanEditor();
      if ((ev.ctrlKey || ev.metaKey) && ev.key === 'Enter') saveEdit();
    });

    setTimeout(() => metodologiaEl?.focus(), 50);
  }

  function renderPreview() {
    const box = document.querySelector('#tm-gpt-preview');
    if (!box) return;

    const plans = Array.isArray(S.generatedPlans) ? S.generatedPlans : [];

    if (!plans.length) {
      box.innerHTML = '<em>Nenhum planejamento carregado.</em>';
      return;
    }

    box.innerHTML = plans.map((plan, index) => {
      const active = index === S.currentPlanIndex ? 'active' : '';
      const done = index < S.currentPlanIndex ? 'done' : '';
      const edited = plan.editadoPeloUsuario ? '<span class="tm-gpt-edited-badge">Editada</span>' : '';
      const conteudoPersonalizado = plan.conteudoPersonalizado
        ? `<div><b>Conteúdo personalizado:</b> ${truncateText(plan.conteudoPersonalizado)}</div>`
        : '';

      const matrizSaeb = Array.isArray(plan.matrizSaeb) && plan.matrizSaeb.length
        ? `<div><b>Matriz SAEB:</b> ${plan.matrizSaeb.map(U.escapeHtml).join(' | ')}</div>`
        : '';
      const revisa = plan.revisa?.referencia
        ? `<div class="tm-gpt-card-revisa"><b>Revisa:</b> ${U.escapeHtml(plan.revisa.referencia)}</div>`
        : '';

      return `<div class="tm-gpt-card ${active} ${done}" data-plan-index="${index}"><div class="tm-gpt-card-title"><div><strong>Aula ${index + 1}</strong>${plan.titulo ? ' - ' + U.escapeHtml(plan.titulo) : ''} ${edited}</div><button class="tm-gpt-edit-plan" type="button" data-index="${index}" title="Editar metodologia e avaliação">✏️ Editar</button></div><div><b>Habilidades:</b> ${(plan.habilidades || []).map(U.escapeHtml).join(' | ') || '-'}</div><div><b>Conteúdos:</b> ${(plan.conteudos || []).map(U.escapeHtml).join(' | ') || '-'}</div>${matrizSaeb}${revisa}${conteudoPersonalizado}<div><b>Metodologia:</b> ${truncateText(plan.metodologia)}</div><div><b>Avaliação:</b> ${truncateText(plan.avaliacao)}</div></div>`;
    }).join('');

    box.querySelectorAll('.tm-gpt-edit-plan').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const index = parseInt(btn.getAttribute('data-index') || '-1', 10);
        openPlanEditor(index);
      });
    });
  }

  function renderSavedPlanMatch() {
    const box = document.querySelector('#tm-gpt-reuse-box');
    if (!box) return;

    const match = S.savedPlanMatch;
    if (!match || !match.entry) {
      box.innerHTML = '<div class="tm-gpt-reuse-empty"><strong>Nenhuma aula salva detectada agora.</strong><div>Troque de turma ou aguarde alguns segundos para o painel verificar novamente.</div></div>';
      return;
    }

    const entry = match.entry;
    const offset = Number.isFinite(match.offset) ? match.offset : 0;
    const position = offset + 1;
    const total = Array.isArray(entry.plans) ? entry.plans.length : Number(entry.totalAulas || 0);
    const aulaAtual = U.escapeHtml(String(match.currentLessonNumber || entry.numeroAulaInicial || '-'));
    const disciplina = U.escapeHtml(entry.disciplina || '-');
    const serieAno = U.escapeHtml(entry.serieAno || '-');
    const turmaOrigem = U.escapeHtml(entry.turmaOrigem || '-');
    const inicio = U.escapeHtml(entry.numeroAulaInicial || '-');
    const fim = U.escapeHtml(entry.numeroAulaFinal || '-');
    const restante = Math.max(total - offset, 0);
    const status = match.inRange
      ? `A aula atual <b>${aulaAtual}</b> corresponde à posição <b>${position}/${total}</b> desse lote.`
      : `O lote salvo começa na aula <b>${inicio}</b>. Ao carregar, o script começará do início do lote.`;

    box.innerHTML = `<div class="tm-gpt-reuse-card"><div><strong>Já existe um lote salvo para esta disciplina/série.</strong></div><div style="margin:6px 0;color:#2d6cdf;font-weight:bold">Basta clicar abaixo para aplicar nesta turma.</div><div><b>Disciplina:</b> ${disciplina}</div><div><b>Série:</b> ${serieAno}º ano</div><div><b>Turma de origem:</b> ${turmaOrigem}</div><div><b>Faixa de aulas:</b> ${inicio} até ${fim}</div><div><b>Total de aulas no lote:</b> ${total}</div><div>${status}</div><div><b>Restantes para aplicar aqui:</b> ${restante}</div><div class="tm-gpt-reuse-buttons"><button id="tm-gpt-load-saved">Carregar aulas salvas</button><button id="tm-gpt-run-saved">Aplicar aulas salvas agora</button></div></div>`;

    const btnLoad = box.querySelector('#tm-gpt-load-saved');
    const btnRun = box.querySelector('#tm-gpt-run-saved');
    if (btnLoad) btnLoad.addEventListener('click', E.loadSavedPlansForCurrentContext);
    if (btnRun) btnRun.addEventListener('click', E.runSavedPlansForCurrentContext);
  }

  function updateGenerationProgress(options = {}) {
    const box = document.querySelector('#tm-gpt-generation-progress');
    if (!box) return;

    const mode = options.mode === 'determinate' ? 'determinate' : 'indeterminate';
    const state = ['complete', 'error'].includes(options.state) ? options.state : 'running';
    const numericPercent = Number(options.percent);
    const percent = Number.isFinite(numericPercent)
      ? Math.max(0, Math.min(100, Math.round(numericPercent)))
      : 0;
    const label = String(options.label || 'Planejando suas aulas...');
    const detail = String(options.detail || 'Aguarde enquanto a IA prepara os planejamentos.');

    const labelEl = box.querySelector('#tm-gpt-progress-label');
    const detailEl = box.querySelector('#tm-gpt-progress-detail');
    const percentEl = box.querySelector('#tm-gpt-progress-percent');
    const barEl = box.querySelector('#tm-gpt-progress-bar');
    const iconEl = box.querySelector('#tm-gpt-progress-icon');

    box.hidden = false;
    box.classList.toggle('tm-gpt-progress-indeterminate', mode === 'indeterminate' && state === 'running');
    box.classList.toggle('tm-gpt-progress-complete', state === 'complete');
    box.classList.toggle('tm-gpt-progress-error', state === 'error');

    if (labelEl) labelEl.textContent = label;
    if (detailEl) detailEl.textContent = detail;
    if (percentEl) percentEl.textContent = mode === 'indeterminate' && state === 'running' ? 'Processando' : `${percent}%`;
    if (barEl) barEl.style.width = mode === 'indeterminate' && state === 'running' ? '34%' : `${percent}%`;

    if (iconEl) {
      iconEl.className = 'tm-gpt-progress-icon';
      iconEl.textContent = '';
      if (state === 'running') {
        iconEl.classList.add('tm-gpt-progress-spinning');
      } else if (state === 'complete') {
        iconEl.textContent = '✓';
      } else {
        iconEl.textContent = '!';
      }
    }

    box.setAttribute('aria-valuemin', '0');
    box.setAttribute('aria-valuemax', '100');
    if (mode === 'determinate' || state !== 'running') {
      box.setAttribute('aria-valuenow', String(percent));
    } else {
      box.removeAttribute('aria-valuenow');
    }
  }

  function startGenerationProgress(totalLessons) {
    const total = Math.max(1, Number(totalLessons) || 1);
    updateGenerationProgress({
      mode: 'indeterminate',
      state: 'running',
      label: `Planejando ${total} aula${total === 1 ? '' : 's'}...`,
      detail: 'A IA está analisando os conteúdos. Não feche esta página.'
    });
  }

  function setGenerationProgress(completedLessons, totalLessons, detail = '') {
    const total = Math.max(1, Number(totalLessons) || 1);
    const completed = Math.max(0, Math.min(total, Number(completedLessons) || 0));
    const percent = Math.round((completed / total) * 100);

    updateGenerationProgress({
      mode: 'determinate',
      state: 'running',
      percent,
      label: `Planejando suas aulas — ${percent}%`,
      detail: detail || `${completed} de ${total} aulas concluídas.`
    });
  }

  function completeGenerationProgress(totalLessons) {
    const total = Math.max(1, Number(totalLessons) || 1);
    updateGenerationProgress({
      mode: 'determinate',
      state: 'complete',
      percent: 100,
      label: 'Planejamentos prontos!',
      detail: `${total} aula${total === 1 ? '' : 's'} gerada${total === 1 ? '' : 's'} com sucesso.`
    });
  }

  function failGenerationProgress(message) {
    const box = document.querySelector('#tm-gpt-generation-progress');
    const previousPercent = Number(box?.getAttribute('aria-valuenow'));
    updateGenerationProgress({
      mode: 'determinate',
      state: 'error',
      percent: Number.isFinite(previousPercent) ? previousPercent : 0,
      label: 'Não foi possível concluir a geração',
      detail: String(message || 'Tente novamente em alguns instantes.')
    });
  }

  let revisaContextWatcher = null;
  let revisaLastContextKey = '';
  let revisaLoadSequence = 0;

  function getRevisaPanel() {
    return document.querySelector('#tm-gpt-revisa-box');
  }

  function setRevisaPanelVisible(visible) {
    const box = getRevisaPanel();
    if (!box) return;

    const hasCompatibleMaterial =
      !!S.revisaCatalog?.disponivel &&
      Array.isArray(S.revisaCatalog?.materiais) &&
      S.revisaCatalog.materiais.length > 0;

    // Nem mesmo uma chamada acidental com true pode exibir um painel sem
    // material validado para o contexto atual.
    const show = !!visible && hasCompatibleMaterial;
    box.hidden = !show;
    box.setAttribute('aria-hidden', show ? 'false' : 'true');
    box.dataset.revisaAvailable = show ? '1' : '0';

    if (show) {
      box.style.removeProperty('display');
    } else {
      box.style.setProperty('display', 'none', 'important');
    }
  }

  function getRevisaContextKey(context = null) {
    const current = context || window.SIAPContext?.getCurrentContext?.() || {};
    const bimestre = String(current.bimestre || '').match(/\d+/)?.[0] || '0';
    return [
      current.serieAno || current.serie || current.turma || '',
      current.turma || '',
      current.disciplina || '',
      bimestre
    ].map(value => String(value || '').trim().toLocaleLowerCase('pt-BR')).join('|');
  }

  function getSelectedRevisaMaterial() {
    const materials = Array.isArray(S.revisaCatalog?.materiais) ? S.revisaCatalog.materiais : [];
    const materialSelect = document.querySelector('#tm-gpt-revisa-material');
    const selectedId = Number(materialSelect?.value || 0);
    return materials.find(item => Number(item?.material?.id || 0) === selectedId) || materials[0] || null;
  }

  function getSelectedRevisaBlock(materialEntry = null) {
    const entry = materialEntry || getSelectedRevisaMaterial();
    const blocks = Array.isArray(entry?.blocos) ? entry.blocos : [];
    const selectedId = Number(document.querySelector('#tm-gpt-revisa-block')?.value || 0);
    return blocks.find(item => Number(item?.id || 0) === selectedId) || blocks[0] || null;
  }

  function getSelectedRevisaSequence(block = null) {
    const selectedBlock = block || getSelectedRevisaBlock();
    const sequences = Array.isArray(selectedBlock?.sequencias) ? selectedBlock.sequencias : [];
    const selectedId = Number(document.querySelector('#tm-gpt-revisa-sequence')?.value || 0);
    return sequences.find(item => Number(item?.id || 0) === selectedId) || sequences[0] || null;
  }

  function setRevisaStatus(message, type = '') {
    const status = document.querySelector('#tm-gpt-revisa-status');
    if (!status) return;
    status.textContent = String(message || '');
    status.className = `tm-gpt-revisa-status${type ? ` tm-gpt-revisa-${type}` : ''}`;
  }

  function setRevisaLoading(loading) {
    const box = getRevisaPanel();
    if (!box) return;
    box.classList.toggle('tm-gpt-revisa-loading', !!loading);
    box.querySelectorAll('input, select, button').forEach(control => {
      control.disabled = !!loading || !S.revisaCatalog?.disponivel;
    });
  }

  function createSelectOptions(select, items, getValue, getLabel, preferredValue = '') {
    if (!select) return;
    const previous = String(preferredValue || select.value || '');
    select.innerHTML = '';
    for (const item of items) {
      const option = document.createElement('option');
      option.value = String(getValue(item));
      option.textContent = String(getLabel(item));
      select.appendChild(option);
    }
    if (previous && Array.from(select.options).some(option => option.value === previous)) {
      select.value = previous;
    }
  }

  function renderRevisaActivityControls(sequence = null, saved = null) {
    const activities = Array.isArray(sequence?.atividades) ? sequence.atividades : [];
    const from = document.querySelector('#tm-gpt-revisa-activity-from');
    const to = document.querySelector('#tm-gpt-revisa-activity-to');
    const pageFrom = document.querySelector('#tm-gpt-revisa-page-from');
    const pageTo = document.querySelector('#tm-gpt-revisa-page-to');

    createSelectOptions(
      from,
      activities,
      item => item.ordem,
      item => `${item.numero}${item.titulo && item.titulo !== `Atividade ${item.numero}` && item.titulo !== `Item ${item.numero}` ? ` — ${item.titulo}` : ''}`,
      saved?.atividadeInicialOrdem
    );
    createSelectOptions(
      to,
      activities,
      item => item.ordem,
      item => `${item.numero}${item.titulo && item.titulo !== `Atividade ${item.numero}` && item.titulo !== `Item ${item.numero}` ? ` — ${item.titulo}` : ''}`,
      saved?.atividadeFinalOrdem || activities.at(-1)?.ordem
    );

    const startPage = Math.max(1, Number(sequence?.pagina_inicial || activities[0]?.pagina_inicial || 1));
    const endPage = Math.max(startPage, Number(sequence?.pagina_final || activities.at(-1)?.pagina_final || startPage));
    const pages = [];
    for (let page = startPage; page <= endPage; page++) pages.push(page);
    createSelectOptions(pageFrom, pages, page => page, page => `Página ${page}`, saved?.paginaInicial || startPage);
    createSelectOptions(pageTo, pages, page => page, page => `Página ${page}`, saved?.paginaFinal || endPage);

    if (from && to && Number(to.value || 0) < Number(from.value || 0)) to.value = from.value;
    if (pageFrom && pageTo && Number(pageTo.value || 0) < Number(pageFrom.value || 0)) pageTo.value = pageFrom.value;

    const progress = sequence?.progresso || {};
    const last = progress.ultima;
    const next = progress.proxima;
    const progressEl = document.querySelector('#tm-gpt-revisa-progress');
    if (progressEl) {
      if (progress.completa) {
        progressEl.textContent = `Sequência concluída: ${Number(progress.concluidas || 0)}/${Number(progress.total || 0)} atividades.`;
      } else if (last) {
        progressEl.textContent = `Último ponto: ${sequence.nome} • atividade ${last.numero}. Próxima: atividade ${next?.numero || '-'}.`;
      } else {
        progressEl.textContent = `Nenhuma atividade concluída nesta turma. Início: atividade ${next?.numero || activities[0]?.numero || '-'}.`;
      }
    }
  }

  function updateRevisaModeVisibility() {
    const selected = document.querySelector('.tm-gpt-revisa-mode.is-active')?.dataset?.mode || 'sequencia';
    const activityRange = document.querySelector('#tm-gpt-revisa-activity-range');
    const pageRange = document.querySelector('#tm-gpt-revisa-page-range');
    if (activityRange) activityRange.hidden = selected !== 'atividades';
    if (pageRange) pageRange.hidden = selected !== 'paginas';
  }

  function setRevisaSelectionMode(mode = 'sequencia') {
    const safeMode = ['sequencia', 'atividades', 'paginas'].includes(mode) ? mode : 'sequencia';
    document.querySelectorAll('.tm-gpt-revisa-mode').forEach(button => {
      const active = button.dataset.mode === safeMode;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    updateRevisaModeVisibility();
  }

  function syncRevisaLessonCount() {
    const qtd = Math.max(1, Number(document.querySelector('#tm-gpt-qtd')?.value || 1));
    const target = document.querySelector('#tm-gpt-revisa-qtd');
    if (target) target.value = String(qtd);
  }

  function saveRevisaSelectionFromUi() {
    const materialEntry = getSelectedRevisaMaterial();
    const block = getSelectedRevisaBlock(materialEntry);
    const sequence = getSelectedRevisaSequence(block);
    const enabled = !!document.querySelector('#tm-gpt-revisa-enabled')?.checked;
    const mode = document.querySelector('.tm-gpt-revisa-mode.is-active')?.dataset?.mode || 'sequencia';

    S.revisaEnabled = enabled;
    S.revisaSelection = materialEntry && block && sequence ? {
      contextKey: getRevisaContextKey(),
      materialId: Number(materialEntry.material?.id || 0),
      componenteId: Number(materialEntry.componente?.id || 0),
      blocoId: Number(block.id || 0),
      sequenciaId: Number(sequence.id || 0),
      modoSelecao: mode,
      modoUso: String(document.querySelector('#tm-gpt-revisa-usage')?.value || 'principal'),
      atividadeInicialOrdem: Number(document.querySelector('#tm-gpt-revisa-activity-from')?.value || 1),
      atividadeFinalOrdem: Number(document.querySelector('#tm-gpt-revisa-activity-to')?.value || 1),
      paginaInicial: Number(document.querySelector('#tm-gpt-revisa-page-from')?.value || sequence.pagina_inicial || 1),
      paginaFinal: Number(document.querySelector('#tm-gpt-revisa-page-to')?.value || sequence.pagina_final || 1),
      continuar: !!document.querySelector('#tm-gpt-revisa-continue')?.checked
    } : null;
    ST.saveState();
    return S.revisaSelection;
  }

  function getRevisaGenerationConfig() {
    const toggle = document.querySelector('#tm-gpt-revisa-enabled');
    if (!toggle?.checked) return null;
    if (!S.revisaCatalog?.disponivel) {
      throw new Error('O Planejar com Revisa está ativado, mas não há material compatível com esta turma.');
    }
    const config = saveRevisaSelectionFromUi();
    if (!config?.materialId || !config?.componenteId || !config?.blocoId || !config?.sequenciaId) {
      throw new Error('Selecione o bloco e a sequência de atividades do Revisa.');
    }
    return config;
  }

  function renderRevisaCatalog(catalog = null) {
    const box = getRevisaPanel();
    if (!box) return;

    S.revisaCatalog = catalog && typeof catalog === 'object' ? catalog : { disponivel: false, materiais: [] };
    const toggle = box.querySelector('#tm-gpt-revisa-enabled');
    const body = box.querySelector('#tm-gpt-revisa-body');
    const materialInfo = box.querySelector('#tm-gpt-revisa-material-info');
    const materialSelect = box.querySelector('#tm-gpt-revisa-material');
    const blockSelect = box.querySelector('#tm-gpt-revisa-block');
    const sequenceSelect = box.querySelector('#tm-gpt-revisa-sequence');
    const saved = S.revisaSelection?.contextKey === getRevisaContextKey() ? S.revisaSelection : null;

    if (S.revisaSelection?.contextKey && !saved) {
      S.revisaEnabled = false;
    }

    if (!S.revisaCatalog.disponivel || !Array.isArray(S.revisaCatalog.materiais) || !S.revisaCatalog.materiais.length) {
      setRevisaPanelVisible(false);
      if (toggle) {
        toggle.checked = false;
        toggle.disabled = true;
      }
      S.revisaEnabled = false;
      if (body) body.hidden = true;
      if (materialInfo) materialInfo.textContent = 'Nenhum Revisa cadastrado para esta série e disciplina.';
      setRevisaStatus('Planejamento normal disponível.', 'muted');
      ST.saveState();
      return;
    }

    setRevisaPanelVisible(true);

    if (toggle) {
      toggle.disabled = false;
      toggle.checked = !!S.revisaEnabled;
    }

    createSelectOptions(
      materialSelect,
      S.revisaCatalog.materiais,
      item => item.material.id,
      item => `${item.material.titulo}${item.material.edicao ? ` — ${item.material.edicao}` : ''}`,
      saved?.materialId
    );

    const renderBlocks = () => {
      const materialEntry = getSelectedRevisaMaterial();
      const blocks = Array.isArray(materialEntry?.blocos) ? materialEntry.blocos : [];
      createSelectOptions(blockSelect, blocks, item => item.id, item => item.titulo, saved?.blocoId);

      if (materialInfo && materialEntry) {
        const seriesLabel = String(materialEntry.material.serie_rotulo || '').trim()
          || `${materialEntry.material.serie_ano}º ano`;
        materialInfo.textContent = `${materialEntry.material.titulo} • ${seriesLabel} • ${materialEntry.componente.disciplina} • ${materialEntry.material.bimestre}º bimestre/${materialEntry.material.ano_letivo}`;
      }

      const renderSequences = () => {
        const block = getSelectedRevisaBlock(materialEntry);
        const sequences = Array.isArray(block?.sequencias) ? block.sequencias : [];
        createSelectOptions(
          sequenceSelect,
          sequences,
          item => item.id,
          item => `${item.nome}${item.titulo ? ` — ${item.titulo}` : ''}`,
          saved?.sequenciaId
        );
        renderRevisaActivityControls(getSelectedRevisaSequence(block), saved);
        saveRevisaSelectionFromUi();
      };

      sequenceSelect.onchange = () => {
        renderRevisaActivityControls(getSelectedRevisaSequence(), null);
        saveRevisaSelectionFromUi();
      };
      renderSequences();
    };

    materialSelect.onchange = () => {
      renderBlocks();
      saveRevisaSelectionFromUi();
    };
    blockSelect.onchange = () => {
      const block = getSelectedRevisaBlock();
      createSelectOptions(
        sequenceSelect,
        Array.isArray(block?.sequencias) ? block.sequencias : [],
        item => item.id,
        item => `${item.nome}${item.titulo ? ` — ${item.titulo}` : ''}`
      );
      renderRevisaActivityControls(getSelectedRevisaSequence(block), null);
      saveRevisaSelectionFromUi();
    };
    renderBlocks();

    setRevisaSelectionMode(saved?.modoSelecao || 'sequencia');
    const usage = box.querySelector('#tm-gpt-revisa-usage');
    if (usage) usage.value = saved?.modoUso || 'principal';
    const continueEl = box.querySelector('#tm-gpt-revisa-continue');
    if (continueEl) continueEl.checked = saved ? !!saved.continuar : true;
    if (body) body.hidden = !toggle?.checked;
    setRevisaStatus(toggle?.checked ? 'Revisa pronto para planejar.' : 'Ative para usar o material nesta geração.', toggle?.checked ? 'ready' : 'muted');
    syncRevisaLessonCount();
    saveRevisaSelectionFromUi();
    setRevisaLoading(false);
  }

  async function refreshRevisaCatalog(options = {}) {
    const box = getRevisaPanel();
    if (!box || !A?.loadRevisaCatalog) return null;
    const currentContext = options.context || window.SIAPContext?.getCurrentContext?.() || {};
    const contextKey = getRevisaContextKey(currentContext);
    if (!options.force && contextKey && contextKey === revisaLastContextKey && S.revisaCatalog) {
      return S.revisaCatalog;
    }

    const loadId = ++revisaLoadSequence;
    revisaLastContextKey = contextKey;
    S.revisaCatalog = null;
    setRevisaPanelVisible(false);
    setRevisaLoading(true);
    setRevisaStatus('Consultando materiais disponíveis...', 'loading');

    try {
      const catalog = await A.loadRevisaCatalog(currentContext);
      if (loadId !== revisaLoadSequence) return null;
      renderRevisaCatalog(catalog);
      return catalog;
    } catch (err) {
      if (loadId !== revisaLoadSequence) return null;
      S.revisaCatalog = null;
      setRevisaPanelVisible(false);
      const toggle = box.querySelector('#tm-gpt-revisa-enabled');
      if (toggle) {
        toggle.checked = false;
        toggle.disabled = true;
      }
      const body = box.querySelector('#tm-gpt-revisa-body');
      if (body) body.hidden = true;
      setRevisaStatus(err?.message || 'Não foi possível consultar o Revisa.', 'error');
      L.log(`[Revisa] Consulta indisponível: ${err?.message || err}`);
      return null;
    } finally {
      if (loadId === revisaLoadSequence) setRevisaLoading(false);
    }
  }

  function startRevisaWatcher() {
    if (revisaContextWatcher) return;
    revisaContextWatcher = setInterval(() => {
      const currentKey = getRevisaContextKey();
      if (!currentKey || currentKey === revisaLastContextKey || S.isRunning) return;
      refreshRevisaCatalog({ force: true }).catch(() => {});
    }, 2200);
  }

  function buildPanel() {
    if (document.querySelector('#tm-gpt-panel')) return;
    const panel = document.createElement('div');
    panel.id = 'tm-gpt-panel';
    panel.innerHTML = `<div id="tm-gpt-header"><span>Planejamento com IA</span><button id="tm-gpt-minimize" type="button" title="Minimizar">−</button></div><div class="tm-gpt-server-info">Licença ativa detectada. A geração usa a IA configurada no servidor.</div><label class="tm-gpt-label">Quantidade de aulas</label><input id="tm-gpt-qtd" type="number" min="1" value="1"><label class="tm-gpt-label">Conteúdo para enviar à API</label><textarea id="tm-gpt-content" placeholder="Cole aqui o conteúdo, tema, orientações e observações."></textarea><label class="tm-gpt-label">Upload de arquivo texto</label><input id="tm-gpt-file" type="file" accept=".txt,.md,.json,.csv"><section id="tm-gpt-revisa-box" hidden aria-hidden="true" style="display:none!important"><div class="tm-gpt-revisa-header"><div class="tm-gpt-revisa-title"><span aria-hidden="true">▤</span> Planejar com Revisa</div><label class="tm-gpt-switch" title="Ativar Planejar com Revisa"><input type="checkbox" id="tm-gpt-revisa-enabled" disabled><span></span></label></div><div id="tm-gpt-revisa-material-info">Consultando material da turma...</div><select id="tm-gpt-revisa-material" hidden></select><div id="tm-gpt-revisa-body" hidden><label class="tm-gpt-revisa-label" for="tm-gpt-revisa-block">Bloco do material</label><select id="tm-gpt-revisa-block"></select><label class="tm-gpt-revisa-label" for="tm-gpt-revisa-sequence">Sequência de atividades</label><select id="tm-gpt-revisa-sequence"></select><label class="tm-gpt-revisa-label">Usar</label><div class="tm-gpt-revisa-modes" role="group" aria-label="Forma de seleção"><button type="button" class="tm-gpt-revisa-mode is-active" data-mode="sequencia" aria-pressed="true">Sequência</button><button type="button" class="tm-gpt-revisa-mode" data-mode="atividades" aria-pressed="false">Atividades</button><button type="button" class="tm-gpt-revisa-mode" data-mode="paginas" aria-pressed="false">Páginas</button></div><div id="tm-gpt-revisa-activity-range" class="tm-gpt-revisa-range" hidden><label>Da atividade <select id="tm-gpt-revisa-activity-from"></select></label><span>até</span><label><select id="tm-gpt-revisa-activity-to"></select></label></div><div id="tm-gpt-revisa-page-range" class="tm-gpt-revisa-range" hidden><label>Da página <select id="tm-gpt-revisa-page-from"></select></label><span>até</span><label><select id="tm-gpt-revisa-page-to"></select></label></div><label class="tm-gpt-revisa-label" for="tm-gpt-revisa-usage">Como usar o material</label><select id="tm-gpt-revisa-usage"><option value="principal">Sequência principal</option><option value="apoio">Como apoio</option><option value="combinado">Revisa + orientação do professor</option></select><div class="tm-gpt-revisa-distribute">Distribuir em <input id="tm-gpt-revisa-qtd" type="number" value="1" readonly> aula(s)</div><label class="tm-gpt-revisa-continue"><input id="tm-gpt-revisa-continue" type="checkbox" checked> Continuar de onde a turma parou</label><div id="tm-gpt-revisa-progress"></div></div><div id="tm-gpt-revisa-status" class="tm-gpt-revisa-status tm-gpt-revisa-loading">Consultando materiais disponíveis...</div></section><div class="tm-gpt-section-title">Opções</div><label class="tm-gpt-check"><input type="checkbox" id="tm-gpt-enable-custom-content"> Gerar conteúdo personalizado no campo de texto livre</label><div class="tm-gpt-help">Quando marcado, a IA também gera o texto para o campo de conteúdo personalizado do SIAP.</div><label class="tm-gpt-check"><input type="checkbox" id="tm-gpt-replicate-to-other-class"> Replicar aula para a outra turma</label><div class="tm-gpt-help">Quando marcado, a automação tenta clicar em <b>Replicar</b> antes de salvar e avançar. A turma de destino deve estar pronta no SIAP.</div><div class="tm-gpt-buttons"><button id="tm-gpt-generate">Gerar planejamentos</button><button id="tm-gpt-apply">Aplicar próxima aula</button><button id="tm-gpt-auto">Aplicar todas</button><button id="tm-gpt-stop">Parar</button></div><div id="tm-gpt-status">Aguardando ação...</div><div class="tm-gpt-section-title">Reaproveitar aulas salvas</div><div id="tm-gpt-reuse-box"><em>Verificando lotes salvos...</em></div><div class="tm-gpt-section-title">Prévia</div><div id="tm-gpt-preview"><em>Nenhum planejamento carregado.</em></div><div class="tm-gpt-section-title">Log</div><div id="tm-gpt-log"></div>`;

    const progress = document.createElement('div');
    progress.id = 'tm-gpt-generation-progress';
    progress.hidden = true;
    progress.setAttribute('role', 'progressbar');
    progress.setAttribute('aria-live', 'polite');
    progress.innerHTML = `<div class="tm-gpt-progress-heading"><span id="tm-gpt-progress-icon" class="tm-gpt-progress-icon tm-gpt-progress-spinning"></span><span id="tm-gpt-progress-label">Planejando suas aulas...</span><strong id="tm-gpt-progress-percent">Processando</strong></div><div class="tm-gpt-progress-track"><div id="tm-gpt-progress-bar"></div></div><div id="tm-gpt-progress-detail">Aguarde enquanto a IA prepara os planejamentos.</div>`;

    const stopButton = panel.querySelector('#tm-gpt-stop');
    if (stopButton) stopButton.before(progress);

    document.body.appendChild(panel);

    const qtdEl = panel.querySelector('#tm-gpt-qtd');
    const contentEl = panel.querySelector('#tm-gpt-content');
    const fileInput = panel.querySelector('#tm-gpt-file');
    const customContentEl = panel.querySelector('#tm-gpt-enable-custom-content');
    const replicateEl = panel.querySelector('#tm-gpt-replicate-to-other-class');
    const revisaToggle = panel.querySelector('#tm-gpt-revisa-enabled');
    const revisaBody = panel.querySelector('#tm-gpt-revisa-body');

    qtdEl.value = sessionStorage.getItem(K.QTD) || '1';
    contentEl.value = sessionStorage.getItem(K.PASTED_TEXT) || '';
    customContentEl.checked = !!S.enableCustomContent;
    replicateEl.checked = !!S.replicateToOtherClass;

    qtdEl.addEventListener('input', () => {
      syncRevisaLessonCount();
      ST.saveState();
    });
    contentEl.addEventListener('input', ST.saveState);
    customContentEl.addEventListener('change', () => {
      S.enableCustomContent = !!customContentEl.checked;
      ST.saveState();
      L.log(`Conteúdo personalizado ${S.enableCustomContent ? 'ativado' : 'desativado'}.`);
    });
    replicateEl.addEventListener('change', () => {
      S.replicateToOtherClass = !!replicateEl.checked;
      ST.saveState();
      L.log(`Replicação para outra turma ${S.replicateToOtherClass ? 'ativada' : 'desativada'}.`);
    });
    fileInput.addEventListener('change', async function (e) {
      const file = e.target.files?.[0];
      if (!file) return;
      const text = await file.text();
      S.uploadedText = text;
      ST.saveState();
      L.log(`Arquivo carregado: ${file.name} (${text.length} caracteres)`);
    });

    revisaToggle.addEventListener('change', () => {
      S.revisaEnabled = !!revisaToggle.checked;
      if (revisaBody) revisaBody.hidden = !S.revisaEnabled;
      setRevisaStatus(
        S.revisaEnabled ? 'Revisa pronto para planejar.' : 'Ative para usar o material nesta geração.',
        S.revisaEnabled ? 'ready' : 'muted'
      );
      saveRevisaSelectionFromUi();
      L.log(`Planejar com Revisa ${S.revisaEnabled ? 'ativado' : 'desativado'}.`);
    });

    panel.querySelectorAll('.tm-gpt-revisa-mode').forEach(button => {
      button.addEventListener('click', () => {
        setRevisaSelectionMode(button.dataset.mode || 'sequencia');
        saveRevisaSelectionFromUi();
      });
    });

    const rangePairs = [
      ['#tm-gpt-revisa-activity-from', '#tm-gpt-revisa-activity-to'],
      ['#tm-gpt-revisa-page-from', '#tm-gpt-revisa-page-to']
    ];
    for (const [fromSelector, toSelector] of rangePairs) {
      const from = panel.querySelector(fromSelector);
      const to = panel.querySelector(toSelector);
      from?.addEventListener('change', () => {
        if (to && Number(to.value || 0) < Number(from.value || 0)) to.value = from.value;
        saveRevisaSelectionFromUi();
      });
      to?.addEventListener('change', () => {
        if (from && Number(to.value || 0) < Number(from.value || 0)) from.value = to.value;
        saveRevisaSelectionFromUi();
      });
    }
    panel.querySelector('#tm-gpt-revisa-usage')?.addEventListener('change', saveRevisaSelectionFromUi);
    panel.querySelector('#tm-gpt-revisa-continue')?.addEventListener('change', saveRevisaSelectionFromUi);

    panel.querySelector('#tm-gpt-generate').addEventListener('click', E.generatePlans);
    panel.querySelector('#tm-gpt-apply').addEventListener('click', E.applyNextPlan);
    panel.querySelector('#tm-gpt-auto').addEventListener('click', E.applyAllPlans);
    panel.querySelector('#tm-gpt-stop').addEventListener('click', E.stopAutomation);

    const minimizeBtn = panel.querySelector('#tm-gpt-minimize');
    minimizeBtn.addEventListener('click', () => {
      panel.classList.toggle('tm-gpt-minimized');
      minimizeBtn.textContent = panel.classList.contains('tm-gpt-minimized') ? '+' : '−';
      minimizeBtn.title = panel.classList.contains('tm-gpt-minimized') ? 'Expandir' : 'Minimizar';
    });

    if (!document.querySelector('#tm-gpt-style')) {
      const style = document.createElement('style');
      style.id = 'tm-gpt-style';
      style.textContent = `#tm-gpt-panel{position:fixed;top:70px;right:20px;width:430px;max-height:85vh;overflow:auto;z-index:999999;background:#fff;border:1px solid #cfcfcf;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.18);padding:14px;font-family:Arial,sans-serif;color:#222}#tm-gpt-header{font-size:18px;font-weight:bold;margin-bottom:12px;color:#1f3b5b;display:flex;align-items:center;justify-content:space-between;gap:10px}#tm-gpt-minimize{width:28px;height:28px;border:none;border-radius:8px;background:#eef4ff;color:#1f3b5b;font-size:20px;line-height:1;cursor:pointer;font-weight:bold}#tm-gpt-minimize:hover{filter:brightness(.96)}#tm-gpt-panel.tm-gpt-minimized{width:auto;max-height:none;overflow:hidden;padding:10px 12px}#tm-gpt-panel.tm-gpt-minimized #tm-gpt-header{margin-bottom:0}#tm-gpt-panel.tm-gpt-minimized #tm-gpt-header span{white-space:nowrap}#tm-gpt-panel.tm-gpt-minimized > *:not(#tm-gpt-header){display:none!important}.tm-gpt-label,.tm-gpt-section-title{display:block;margin-top:10px;margin-bottom:6px;font-weight:bold;font-size:13px}#tm-gpt-qtd,#tm-gpt-file,#tm-gpt-content{width:100%;box-sizing:border-box;margin-bottom:8px}#tm-gpt-qtd{height:34px;padding:6px}.tm-gpt-server-info{background:#e9f1ff;border:1px solid #b7cdf6;color:#33507a;padding:10px 12px;border-radius:8px;font-size:12px;line-height:1.4;margin-bottom:12px}#tm-gpt-content{min-height:120px;resize:vertical;padding:8px}.tm-gpt-check{display:flex;align-items:center;gap:8px;margin-top:10px;font-size:13px;font-weight:bold;line-height:1.25}.tm-gpt-check input[type="checkbox"]{margin:0;width:14px;height:14px;flex:0 0 auto}.tm-gpt-help{font-size:12px;line-height:1.4;color:#52606d;margin:4px 0 10px 22px}.tm-gpt-buttons,.tm-gpt-reuse-buttons{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.tm-gpt-buttons button,.tm-gpt-reuse-buttons button{flex:1;min-width:120px;border:none;border-radius:8px;background:#2d6cdf;color:white;padding:10px 12px;cursor:pointer;font-weight:bold}.tm-gpt-buttons button:hover,.tm-gpt-reuse-buttons button:hover{filter:brightness(.95)}.tm-gpt-buttons button:disabled,.tm-gpt-reuse-buttons button:disabled{opacity:.6;cursor:not-allowed}#tm-gpt-stop{background:#c44949}#tm-gpt-status{margin-top:10px;padding:8px;background:#f3f6fa;border-radius:8px;font-size:12px}#tm-gpt-reuse-box{margin-top:8px;background:#f8fbff;border:2px solid #9fc2ff;border-radius:8px;padding:10px;font-size:12px;line-height:1.5}.tm-gpt-reuse-card b{color:#1f3b5b}.tm-gpt-reuse-empty{color:#5b6773}#tm-gpt-preview{margin-top:8px;max-height:240px;overflow:auto;background:#fafafa;border:1px solid #e5e5e5;border-radius:8px;padding:8px}#tm-gpt-log{margin-top:8px;background:#101418;color:#d7f0ff;border-radius:8px;padding:8px;font-size:11px;font-family:Consolas,monospace;max-height:180px;overflow-y:auto}.tm-gpt-log-line{margin-bottom:6px;white-space:pre-wrap;word-break:break-word}.tm-gpt-card{border:1px solid #e5e5e5;border-radius:8px;padding:8px;margin-bottom:8px;background:#fff;font-size:12px;line-height:1.45}.tm-gpt-card.active{border-color:#2d6cdf;background:#eef4ff}.tm-gpt-card.done{opacity:.7;background:#f5fff5}.tm-gpt-card-title{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:6px}.tm-gpt-edit-plan{border:none;border-radius:7px;background:#1f7a4d;color:#fff;padding:5px 8px;font-size:11px;font-weight:bold;cursor:pointer;white-space:nowrap}.tm-gpt-edit-plan:hover{filter:brightness(.95)}.tm-gpt-edited-badge{display:inline-block;margin-left:6px;padding:2px 6px;border-radius:999px;background:#fff0c2;color:#7a5200;font-size:10px;font-weight:bold}#tm-gpt-editor-modal{position:fixed;inset:0;z-index:1000000;font-family:Arial,sans-serif;color:#1f2933}.tm-gpt-editor-backdrop{position:absolute;inset:0;background:rgba(15,23,42,.55)}.tm-gpt-editor-window{position:absolute;inset:28px;max-width:1100px;margin:0 auto;background:#fff;border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,.35);padding:22px;display:flex;flex-direction:column;gap:12px;box-sizing:border-box}.tm-gpt-editor-header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;border-bottom:1px solid #e6edf5;padding-bottom:12px}.tm-gpt-editor-title{font-size:22px;font-weight:800;color:#17324d}.tm-gpt-editor-subtitle{font-size:13px;color:#52606d;margin-top:4px}.tm-gpt-editor-info{background:#f8fbff;border:1px solid #d8e6fb;border-radius:10px;padding:12px;font-size:13px;line-height:1.45}.tm-gpt-editor-label{font-weight:bold;font-size:14px;margin-top:4px}.tm-gpt-editor-window textarea{width:100%;box-sizing:border-box;border:1px solid #c9d4e1;border-radius:10px;padding:12px;font-size:14px;line-height:1.5;resize:vertical;font-family:Arial,sans-serif}.tm-gpt-editor-window #tm-gpt-editor-metodologia{min-height:210px;flex:1}.tm-gpt-editor-window #tm-gpt-editor-avaliacao{min-height:150px;flex:1}.tm-gpt-editor-actions{display:flex;justify-content:flex-end;gap:10px;border-top:1px solid #e6edf5;padding-top:12px}.tm-gpt-editor-actions button,#tm-gpt-editor-close{border:none;border-radius:10px;padding:10px 14px;font-weight:bold;cursor:pointer}#tm-gpt-editor-close{background:#f1f5f9;color:#1f2933;font-size:24px;line-height:1;padding:6px 12px}#tm-gpt-editor-cancel{background:#e9eef5;color:#1f2933}#tm-gpt-editor-save{background:#2d6cdf;color:#fff}@media(max-width:760px){.tm-gpt-editor-window{inset:10px;padding:14px;border-radius:12px}.tm-gpt-editor-title{font-size:18px}.tm-gpt-editor-window #tm-gpt-editor-metodologia{min-height:180px}.tm-gpt-editor-window #tm-gpt-editor-avaliacao{min-height:130px}.tm-gpt-editor-actions{flex-direction:column}.tm-gpt-editor-actions button{width:100%}}`;
      style.textContent += `#tm-gpt-generation-progress[hidden]{display:none!important}#tm-gpt-generation-progress{flex:1 0 100%;box-sizing:border-box;margin:0;padding:10px 11px;border:1px solid #b7cdf6;border-radius:9px;background:#f4f8ff;color:#1f3b5b;overflow:hidden}#tm-gpt-stop{flex:1 0 100%}.tm-gpt-progress-heading{display:flex;align-items:center;gap:7px;font-size:12px;font-weight:700}.tm-gpt-progress-heading #tm-gpt-progress-label{flex:1;min-width:0}.tm-gpt-progress-heading strong{font-size:11px;white-space:nowrap;color:#2d6cdf}.tm-gpt-progress-icon{width:14px;height:14px;box-sizing:border-box;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;flex:0 0 14px;font-size:11px;font-weight:900}.tm-gpt-progress-spinning{border:2px solid #b7cdf6;border-top-color:#2d6cdf;animation:tm-gpt-spin .8s linear infinite}.tm-gpt-progress-track{height:9px;margin-top:8px;background:#dbe7fa;border-radius:999px;overflow:hidden;position:relative}#tm-gpt-progress-bar{height:100%;width:0;background:linear-gradient(90deg,#2d6cdf,#58a6ff);border-radius:999px;transition:width .35s ease}.tm-gpt-progress-indeterminate #tm-gpt-progress-bar{position:relative;left:-34%;width:34%!important;animation:tm-gpt-progress-slide 1.15s ease-in-out infinite}.tm-gpt-progress-complete{border-color:#8fd3ae!important;background:#effbf4!important;color:#17653d!important}.tm-gpt-progress-complete #tm-gpt-progress-bar{background:#21a366}.tm-gpt-progress-complete .tm-gpt-progress-heading strong{color:#17653d}.tm-gpt-progress-complete .tm-gpt-progress-icon{background:#21a366;color:#fff}.tm-gpt-progress-error{border-color:#e7a5a5!important;background:#fff3f3!important;color:#8b2727!important}.tm-gpt-progress-error #tm-gpt-progress-bar{background:#c44949}.tm-gpt-progress-error .tm-gpt-progress-heading strong{color:#8b2727}.tm-gpt-progress-error .tm-gpt-progress-icon{background:#c44949;color:#fff}#tm-gpt-progress-detail{margin-top:6px;font-size:11px;line-height:1.35;color:#52606d}@keyframes tm-gpt-spin{to{transform:rotate(360deg)}}@keyframes tm-gpt-progress-slide{0%{left:-34%}100%{left:100%}}`;
      style.textContent += `#tm-gpt-revisa-box[hidden],#tm-gpt-revisa-box[aria-hidden="true"]{display:none!important}#tm-gpt-revisa-box{margin:10px 0 12px;padding:11px;border:1.5px solid #8cb8ff;border-radius:10px;background:linear-gradient(135deg,#f7fbff,#edf5ff);box-sizing:border-box}.tm-gpt-revisa-header{display:flex;align-items:center;justify-content:space-between;gap:10px}.tm-gpt-revisa-title{display:flex;align-items:center;gap:7px;color:#204f8f;font-size:15px;font-weight:800}.tm-gpt-revisa-title span{font-size:20px;line-height:1}.tm-gpt-switch{position:relative;width:42px;height:24px;flex:0 0 42px}.tm-gpt-switch input{position:absolute;opacity:0;pointer-events:none}.tm-gpt-switch span{position:absolute;inset:0;border-radius:999px;background:#c7d2df;cursor:pointer;transition:.2s}.tm-gpt-switch span:after{content:"";position:absolute;width:18px;height:18px;left:3px;top:3px;border-radius:50%;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.3);transition:.2s}.tm-gpt-switch input:checked+span{background:#2d6cdf}.tm-gpt-switch input:checked+span:after{transform:translateX(18px)}.tm-gpt-switch input:disabled+span{opacity:.55;cursor:not-allowed}#tm-gpt-revisa-material-info{margin-top:6px;color:#31547d;font-size:11px;line-height:1.35}.tm-gpt-revisa-label{display:block;margin:9px 0 4px;font-size:11px;font-weight:800;color:#27384a}#tm-gpt-revisa-body select,#tm-gpt-revisa-body input[type="number"]{box-sizing:border-box;border:1px solid #c2cfdd;border-radius:7px;background:#fff;color:#263442;font-size:12px;padding:7px}#tm-gpt-revisa-block,#tm-gpt-revisa-sequence,#tm-gpt-revisa-usage{width:100%}.tm-gpt-revisa-modes{display:grid;grid-template-columns:repeat(3,1fr);border:1px solid #b9c8d8;border-radius:7px;overflow:hidden;background:#fff}.tm-gpt-revisa-mode{border:0;border-right:1px solid #cbd5e1;background:#fff;color:#31547d;padding:7px 4px;font-size:11px;font-weight:700;cursor:pointer}.tm-gpt-revisa-mode:last-child{border-right:0}.tm-gpt-revisa-mode.is-active{background:#2d6cdf;color:#fff}.tm-gpt-revisa-range{display:flex;align-items:end;gap:7px;margin-top:8px;font-size:11px;color:#43566a}.tm-gpt-revisa-range[hidden]{display:none!important}.tm-gpt-revisa-range label{display:flex;flex:1;flex-direction:column;gap:3px}.tm-gpt-revisa-range select{width:100%}.tm-gpt-revisa-range>span{padding-bottom:8px}.tm-gpt-revisa-distribute{display:flex;align-items:center;gap:6px;margin-top:9px;font-size:12px;color:#344a61}.tm-gpt-revisa-distribute input{width:54px;text-align:center}.tm-gpt-revisa-continue{display:flex;align-items:center;gap:7px;margin-top:9px;color:#31547d;font-size:12px;font-weight:700}.tm-gpt-revisa-continue input{margin:0}#tm-gpt-revisa-progress{margin-top:6px;color:#2465c5;font-size:11px;font-weight:700;line-height:1.35}.tm-gpt-revisa-status{margin-top:7px;font-size:10px;line-height:1.35;color:#5f6f80}.tm-gpt-revisa-ready{color:#147443}.tm-gpt-revisa-error{color:#a42f2f}.tm-gpt-revisa-loading{color:#31547d}.tm-gpt-revisa-loading select,.tm-gpt-revisa-loading button{cursor:wait}.tm-gpt-card-revisa{margin:5px 0;padding:5px 6px;border-radius:6px;background:#eef5ff;color:#28558d}`;
      document.head.appendChild(style);
    }

    syncRevisaLessonCount();
    refreshRevisaCatalog({ force: true }).catch(() => {});
    startRevisaWatcher();
  }

  return {
    buildPanel,
    renderPreview,
    renderSavedPlanMatch,
    openPlanEditor,
    closePlanEditor,
    updateGenerationProgress,
    startGenerationProgress,
    setGenerationProgress,
    completeGenerationProgress,
    failGenerationProgress,
    refreshRevisaCatalog,
    getRevisaGenerationConfig,
    saveRevisaSelectionFromUi
  };
})();
