(function () {
  'use strict';

  const ROOT_ID = 'siapai-turma-panel';
  const STYLE_ID = 'siapai-turma-panel-style';
  const PAGE_NAME = 'PlanejamentoProfessorTurmaEdicao.aspx';

  function clean(value) {
    return String(value || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function readValue(selector) {
    const element = document.querySelector(selector);
    return clean(element && (element.value || element.textContent));
  }

  function getContext() {
    return {
      serie: readValue('#cphFuncionalidade_cphCampos_txtSerie, #txtSerie, input[id$="txtSerie"]'),
      turma: readValue('#cphFuncionalidade_cphCampos_txtTurma, #txtTurma, input[id$="txtTurma"]'),
      disciplina: readValue('#cphFuncionalidade_cphCampos_txtDisciplina, #txtDisciplina, input[id$="txtDisciplina"]'),
      composicao: readValue('#cphFuncionalidade_cphCampos_txtComposicaoEnsino, #txtComposicaoEnsino, input[id$="txtComposicaoEnsino"]'),
      ano: readValue('#cphFuncionalidade_cphCampos_txtAnoLetivo, #txtAnoLetivo, input[id$="txtAnoLetivo"]')
    };
  }

  function getRuntimeValue(name) {
    try {
      if (window[name]) return String(window[name]);
    } catch (_) {}
    for (const storage of [window.sessionStorage, window.localStorage]) {
      try {
        const value = storage.getItem(name);
        if (value) return String(value);
      } catch (_) {}
    }
    const meta = document.getElementById('siap-runtime-' + String(name).toLowerCase());
    return clean(meta && meta.getAttribute('content'));
  }

  function serverCall(path, method, data, token) {
    const requestId = 'siapai-turma-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
    return new Promise(function (resolve, reject) {
      const timeout = window.setTimeout(function () {
        window.removeEventListener('message', onResponse);
        reject(new Error('A geração demorou mais que o esperado. Tente novamente.'));
      }, 120000);

      function onResponse(event) {
        const response = event && event.data;
        if (!response || response.source !== 'SIAP_SAAS_CONTENT_SERVER' || response.requestId !== requestId) return;
        window.clearTimeout(timeout);
        window.removeEventListener('message', onResponse);
        if (response.ok) {
          resolve(response.payload && response.payload.data);
        } else {
          reject(new Error((response.payload && (response.payload.message || response.payload.error)) || 'Não foi possível gerar as sugestões.'));
        }
      }

      window.addEventListener('message', onResponse);
      window.postMessage({
        source: 'SIAP_SAAS_MAIN_BRIDGE_SERVER',
        requestId: requestId,
        action: 'serverCall',
        payload: { path: path, method: method, data: data, token: token }
      }, '*');
    });
  }

  function buildPrompt(context, instruction, quantity) {
    return [
      'Crie ' + quantity + ' planejamento(s) de aula prático(s) e detalhado(s).',
      'Contexto da turma: ' + [context.composicao, context.serie, context.turma, context.disciplina, context.ano ? 'ano letivo ' + context.ano : ''].filter(Boolean).join(' | ') + '.',
      'Inclua título, objetivos, conteúdo, metodologia e avaliação para cada aula.',
      'Não invente códigos de habilidades. Quando não houver código confirmado, descreva a habilidade em linguagem pedagógica.',
      instruction ? 'Orientação do professor: ' + instruction : 'Orientação do professor: proponha uma sequência coerente para a turma.'
    ].join('\n');
  }

  function parseLessons(response) {
    const content = response && response.data && response.data.choices && response.data.choices[0] && response.data.choices[0].message && response.data.choices[0].message.content;
    if (!content) throw new Error('O servidor não retornou as sugestões de planejamento.');
    const parsed = typeof content === 'string' ? JSON.parse(content) : content;
    const lessons = Array.isArray(parsed && parsed.aulas) ? parsed.aulas : [];
    if (!lessons.length) throw new Error('A IA não retornou aulas válidas. Tente novamente.');
    return lessons;
  }

  function formatLesson(lesson, index) {
    const lines = [
      'AULA ' + (index + 1) + ': ' + clean(lesson.titulo || ('Aula ' + (index + 1))),
      lesson.conteudoPersonalizado ? 'CONTEÚDO:\n' + clean(lesson.conteudoPersonalizado) : '',
      lesson.metodologia ? 'METODOLOGIA:\n' + clean(lesson.metodologia) : '',
      lesson.avaliacao ? 'AVALIAÇÃO:\n' + clean(lesson.avaliacao) : ''
    ].filter(Boolean);
    return lines.join('\n\n');
  }

  async function copyText(text, button) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (_) {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    }
    const previous = button.textContent;
    button.textContent = 'Copiado';
    window.setTimeout(function () { button.textContent = previous; }, 1600);
  }

  function renderResults(root, lessons) {
    const target = root.querySelector('#siapai-turma-results');
    target.innerHTML = lessons.map(function (lesson, index) {
      const text = formatLesson(lesson, index);
      return '<article class="siapai-turma-lesson">' +
        '<div class="siapai-turma-lesson-title"><strong>Aula ' + (index + 1) + '</strong><button type="button" data-copy-index="' + index + '">Copiar</button></div>' +
        '<h3>' + escapeHtml(clean(lesson.titulo || ('Aula ' + (index + 1)))) + '</h3>' +
        (lesson.conteudoPersonalizado ? '<p><b>Conteúdo</b><br>' + escapeHtml(clean(lesson.conteudoPersonalizado)) + '</p>' : '') +
        (lesson.metodologia ? '<p><b>Metodologia</b><br>' + escapeHtml(clean(lesson.metodologia)) + '</p>' : '') +
        (lesson.avaliacao ? '<p><b>Avaliação</b><br>' + escapeHtml(clean(lesson.avaliacao)) + '</p>' : '') +
        '<textarea class="siapai-turma-copy-source" data-copy-source="' + index + '" aria-hidden="true">' + escapeHtml(text) + '</textarea>' +
      '</article>';
    }).join('');

    target.querySelectorAll('[data-copy-index]').forEach(function (button) {
      button.addEventListener('click', function () {
        const index = button.getAttribute('data-copy-index');
        const source = target.querySelector('[data-copy-source="' + index + '"]');
        copyText(source ? source.value : '', button);
      });
    });
  }

  function setStatus(root, message, type) {
    const status = root.querySelector('#siapai-turma-status');
    status.textContent = message;
    status.className = 'siapai-turma-status ' + (type || '');
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '#' + ROOT_ID + '{position:fixed;right:18px;top:72px;z-index:999998;width:380px;max-height:calc(100vh - 95px);overflow:auto;background:#fff;border:1px solid #d6e5dc;border-radius:16px;box-shadow:0 18px 48px rgba(16,70,50,.24);font-family:Arial,sans-serif;color:#17372b}',
      '#' + ROOT_ID + ' .siapai-turma-head{padding:17px;background:linear-gradient(135deg,#047857,#0b9b6d);color:#fff;border-radius:15px 15px 0 0}',
      '#' + ROOT_ID + ' .siapai-turma-head-row{display:flex;justify-content:space-between;gap:12px;align-items:center}',
      '#' + ROOT_ID + ' h2{font-size:17px;margin:0;font-weight:800}',
      '#' + ROOT_ID + ' .siapai-turma-head p{margin:5px 0 0;font-size:12px;line-height:1.35;color:#e7fff5}',
      '#' + ROOT_ID + ' .siapai-turma-close{border:0;background:rgba(255,255,255,.18);color:#fff;width:28px;height:28px;border-radius:8px;font-size:20px;cursor:pointer}',
      '#' + ROOT_ID + ' .siapai-turma-body{padding:14px}',
      '#' + ROOT_ID + ' .siapai-turma-context{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 12px}',
      '#' + ROOT_ID + ' .siapai-turma-context span{background:#ecfdf5;border:1px solid #cdeedc;border-radius:999px;padding:5px 8px;font-size:11px;font-weight:700;color:#156345}',
      '#' + ROOT_ID + ' label{display:block;margin:10px 0 6px;font-size:12px;font-weight:700;color:#315348}',
      '#' + ROOT_ID + ' select,#' + ROOT_ID + ' textarea{box-sizing:border-box;width:100%;border:1px solid #bfd8cb;border-radius:9px;padding:9px;font:13px Arial,sans-serif;color:#17372b;background:#fff}',
      '#' + ROOT_ID + ' textarea{min-height:92px;resize:vertical;line-height:1.4}',
      '#' + ROOT_ID + ' .siapai-turma-generate{width:100%;margin-top:12px;border:0;border-radius:10px;padding:11px;background:#087f5b;color:#fff;font-weight:800;cursor:pointer}',
      '#' + ROOT_ID + ' .siapai-turma-generate:disabled{opacity:.65;cursor:wait}',
      '#' + ROOT_ID + ' .siapai-turma-status{min-height:18px;margin:10px 0 0;font-size:12px;line-height:1.35;color:#526c61}',
      '#' + ROOT_ID + ' .siapai-turma-status.error{color:#b42318}',
      '#' + ROOT_ID + ' .siapai-turma-note{margin:12px 0 0;padding:9px 10px;background:#f5fbf8;border-left:3px solid #0b9b6d;color:#45665a;font-size:11px;line-height:1.4}',
      '#' + ROOT_ID + ' .siapai-turma-lesson{margin-top:12px;padding:11px;border:1px solid #d9e8e0;border-radius:11px;background:#fbfefc;font-size:12px;line-height:1.45}',
      '#' + ROOT_ID + ' .siapai-turma-lesson-title{display:flex;justify-content:space-between;align-items:center;color:#087f5b}',
      '#' + ROOT_ID + ' .siapai-turma-lesson-title button{border:1px solid #b8ddca;border-radius:7px;background:#fff;color:#087f5b;font-size:11px;font-weight:700;padding:5px 7px;cursor:pointer}',
      '#' + ROOT_ID + ' .siapai-turma-lesson h3{margin:8px 0 6px;font-size:13px;color:#17372b}',
      '#' + ROOT_ID + ' .siapai-turma-lesson p{margin:7px 0;white-space:pre-wrap}',
      '#' + ROOT_ID + ' .siapai-turma-copy-source{position:absolute;left:-10000px;top:auto;width:1px;height:1px;opacity:0;pointer-events:none}'
    ].join('');
    document.head.appendChild(style);
  }

  function init() {
    if (!location.href.includes(PAGE_NAME)) return;
    injectStyles();
    const existing = document.getElementById(ROOT_ID);
    if (existing) return;

    const context = getContext();
    const root = document.createElement('aside');
    root.id = ROOT_ID;
    root.setAttribute('aria-label', 'SiapAI Planejamento por turma');
    const chips = [context.composicao, context.serie, context.turma, context.disciplina].filter(Boolean);
    root.innerHTML =
      '<div class="siapai-turma-head"><div class="siapai-turma-head-row"><div><h2>SiapAI · Planejamento</h2><p>Sugestões para a turma aberta no SIAP.</p></div><button type="button" class="siapai-turma-close" aria-label="Fechar painel">×</button></div></div>' +
      '<div class="siapai-turma-body">' +
        '<div class="siapai-turma-context">' + (chips.length ? chips.map(function (item) { return '<span>' + escapeHtml(item) + '</span>'; }).join('') : '<span>Contexto da turma em carregamento</span>') + '</div>' +
        '<label for="siapai-turma-qtd">Quantidade de aulas</label><select id="siapai-turma-qtd"><option value="1">1 aula</option><option value="2">2 aulas</option><option value="3">3 aulas</option><option value="4">4 aulas</option><option value="5">5 aulas</option></select>' +
        '<label for="siapai-turma-instruction">Orientação para a IA</label><textarea id="siapai-turma-instruction" placeholder="Ex.: trabalhar arte urbana com atividade prática e avaliação formativa."></textarea>' +
        '<button type="button" class="siapai-turma-generate" id="siapai-turma-generate">Gerar sugestões</button>' +
        '<div id="siapai-turma-status" class="siapai-turma-status" role="status"></div>' +
        '<div class="siapai-turma-note">As sugestões desta tela não alteram calendário, aulas ou dados do SIAP. Copie o plano que desejar e abra a aula individual apenas quando quiser preencher os campos.</div>' +
        '<section id="siapai-turma-results" aria-live="polite"></section>' +
      '</div>';
    document.body.appendChild(root);

    root.querySelector('.siapai-turma-close').addEventListener('click', function () { root.remove(); });
    root.querySelector('#siapai-turma-generate').addEventListener('click', async function () {
      const button = root.querySelector('#siapai-turma-generate');
      const currentContext = getContext();
      const quantity = Number(root.querySelector('#siapai-turma-qtd').value || 1);
      const instruction = clean(root.querySelector('#siapai-turma-instruction').value);
      const token = getRuntimeValue('SIAP_SAAS_TOKEN');
      if (!token) {
        setStatus(root, 'Sua sessão não foi localizada. Feche e reabra a página após entrar na extensão.', 'error');
        return;
      }
      if (!currentContext.disciplina || !currentContext.turma) {
        setStatus(root, 'Não foi possível identificar turma e disciplina nesta página. Recarregue o SIAP e tente novamente.', 'error');
        return;
      }
      button.disabled = true;
      setStatus(root, 'Gerando sugestões de planejamento…');
      try {
        const response = await serverCall('/ai/generate.php', 'POST', {
          model: 'siapai-gemini',
          temperature: 0.3,
          max_tokens: Math.max(3500, quantity * 900),
          lesson_count: quantity,
          messages: [{ role: 'user', content: buildPrompt(currentContext, instruction, quantity) }]
        }, token);
        const lessons = parseLessons(response);
        renderResults(root, lessons);
        setStatus(root, lessons.length + ' sugestão(ões) pronta(s). Use “Copiar” para aproveitar o texto.', 'success');
      } catch (error) {
        setStatus(root, clean(error && error.message) || 'Não foi possível gerar as sugestões.', 'error');
      } finally {
        button.disabled = false;
      }
    });
  }

  window.SIAPTurmaPanel = { init: init };
})();
