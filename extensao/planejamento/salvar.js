(function (window, document) {
    'use strict';

    if (window.__SIAP_SALVAR_ABRIR_PROXIMA_LOADED__) return;
    window.__SIAP_SALVAR_ABRIR_PROXIMA_LOADED__ = true;

    const KEY_NEXT_AULA = 'siap_next_aula_after_save';
    const IDS = {
        numeroAula: 'cphFuncionalidade_cphCampos_txtNumeroAula',
        btnSalvar: 'cphFuncionalidade_btnAlterar',
        btnPainel: 'siap_btn_salvar_abrir_proxima'
    };

    const POSTBACK_TARGET_CALENDARIO =
        'ctl00$ctl00$cphFuncionalidade$cphCampos$CalendarioPlanejamento';

    let hooksRegistrados = false;
    let tentativaAberturaEmAndamento = false;

    function log() {
        try {
            console.log('[SIAP salvar->turma->proxima]', ...arguments);
        } catch (_) {}
    }

    function isPaginaEdicaoAula() {
        return /PlanejamentoProfessorPlanejamentoAulaEdicao\.aspx/i.test(window.location.href)
            || !!document.querySelector('form[action*="PlanejamentoProfessorPlanejamentoAulaEdicao.aspx"]');
    }

    function isPaginaTurma() {
        return /PlanejamentoProfessorTurmaEdicao\.aspx/i.test(window.location.href)
            || !!document.querySelector('form[action*="PlanejamentoProfessorTurmaEdicao.aspx"]');
    }

    function isPaginaRelevante() {
        return isPaginaEdicaoAula() || isPaginaTurma();
    }

    function getNumeroAulaAtual() {
        const el = document.getElementById(IDS.numeroAula);
        if (!el) return NaN;
        return parseInt((el.value || '').trim(), 10);
    }

    function getBtnSalvar() {
        return document.getElementById(IDS.btnSalvar);
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function getPRM() {
        return window.Sys?.WebForms?.PageRequestManager?.getInstance?.() || null;
    }

    async function esperarFimAsync(timeout) {
        timeout = timeout || 15000;

        const prm = getPRM();
        if (!prm) return true;

        const inicio = Date.now();
        while (prm.get_isInAsyncPostBack()) {
            if (Date.now() - inicio > timeout) return false;
            await sleep(120);
        }
        return true;
    }

    function salvarProximaAulaNoStorage(numero) {
        window.sessionStorage.setItem(KEY_NEXT_AULA, String(numero));
    }

    function lerProximaAulaDoStorage() {
        const valor = window.sessionStorage.getItem(KEY_NEXT_AULA);
        return valor ? parseInt(valor, 10) : NaN;
    }

    function limparStorage() {
        window.sessionStorage.removeItem(KEY_NEXT_AULA);
    }

    async function salvarEAguardarRedirecionamento() {
        const atual = getNumeroAulaAtual();
        if (isNaN(atual)) {
            window.alert('Não foi possível ler o número da aula atual.');
            return;
        }

        const btnSalvar = getBtnSalvar();
        if (!btnSalvar) {
            window.alert('Botão Salvar não encontrado.');
            return;
        }

        const ok = await esperarFimAsync();
        if (!ok) {
            window.alert('A página ainda está processando.');
            return;
        }

        const proxima = atual + 1;
        salvarProximaAulaNoStorage(proxima);
        log('Aula atual:', atual, '| Próxima salva no storage:', proxima);

        btnSalvar.click();
    }

    function abrirAulaNoCalendario(numero) {
        if (!numero || Number.isNaN(numero)) return false;

        const seletor = '[numeroaula="' + numero + '"]';
        const bloco = document.querySelector(seletor);

        if (bloco) {
            log('Abrindo aula pelo bloco do calendário:', numero);
            bloco.click();
            return true;
        }

        if (typeof window.__doPostBack === 'function') {
            log('Abrindo aula via __doPostBack:', numero);
            window.__doPostBack(POSTBACK_TARGET_CALENDARIO, String(numero));
            return true;
        }

        return false;
    }

    async function tentarAbrirProximaAoEntrarNaPaginaTurma() {
        if (!isPaginaTurma()) return;
        if (tentativaAberturaEmAndamento) return;

        const proxima = lerProximaAulaDoStorage();
        if (isNaN(proxima)) return;

        tentativaAberturaEmAndamento = true;

        try {
            await sleep(500);
            const ok = await esperarFimAsync();
            if (!ok) return;

            const abriu = abrirAulaNoCalendario(proxima);
            if (abriu) {
                limparStorage();
            } else {
                log('Não consegui abrir a próxima aula:', proxima);
            }
        } finally {
            window.setTimeout(function () {
                tentativaAberturaEmAndamento = false;
            }, 1000);
        }
    }

    function injetarEstilo() {
        if (document.getElementById('siap-style-salvar-abrir-proxima')) return;
        if (!document.head) return;

        const style = document.createElement('style');
        style.id = 'siap-style-salvar-abrir-proxima';
        style.textContent = [
            '#' + IDS.btnPainel + ' {',
            '  margin-left: 8px;',
            '  padding: 6px 12px;',
            '  border: 1px solid #64B65D;',
            '  background: #64B65D;',
            '  color: white;',
            '  border-radius: 4px;',
            '  cursor: pointer;',
            '  font-size: 12px;',
            '  vertical-align: middle;',
            '}',
            '#' + IDS.btnPainel + ':hover {',
            '  opacity: 0.92;',
            '}',
            '#' + IDS.btnPainel + ':disabled {',
            '  opacity: 0.7;',
            '  cursor: wait;',
            '}'
        ].join('\n');

        document.head.appendChild(style);
    }

    function criarBotaoPainel() {
        if (!isPaginaEdicaoAula()) return;

        let btn = document.getElementById(IDS.btnPainel);
        if (btn) {
            if (!btn.dataset.siapBindOk) {
                btn.addEventListener('click', salvarEAguardarRedirecionamento);
                btn.dataset.siapBindOk = '1';
            }
            return;
        }

        btn = document.createElement('button');
        btn.type = 'button';
        btn.id = IDS.btnPainel;
        btn.textContent = 'Salvar e abrir próxima';
        btn.title = 'Salva a aula atual e, na página da turma, abre a próxima aula';
        btn.addEventListener('click', salvarEAguardarRedirecionamento);
        btn.dataset.siapBindOk = '1';

        const blocoBotoes = document.querySelector('p.botoes');
        if (blocoBotoes) {
            blocoBotoes.appendChild(btn);
            return;
        }

        const inputNumero = document.getElementById(IDS.numeroAula);
        if (inputNumero) {
            inputNumero.insertAdjacentElement('afterend', btn);
        }
    }

    function init() {
        if (!isPaginaRelevante()) return;
        injetarEstilo();
        criarBotaoPainel();
        tentarAbrirProximaAoEntrarNaPaginaTurma();
    }

    function registrarHooksAspNet() {
        if (hooksRegistrados) return;
        hooksRegistrados = true;

        const prm = getPRM();
        if (prm && typeof prm.add_endRequest === 'function') {
            prm.add_endRequest(function () {
                window.setTimeout(init, 250);
            });
            return;
        }

        if (window.Sys?.Application?.add_load) {
            window.Sys.Application.add_load(function () {
                window.setTimeout(init, 250);
            });
        }
    }

    function bootstrap() {
        if (!isPaginaRelevante()) return;
        init();
        registrarHooksAspNet();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
    } else {
        bootstrap();
    }

    window.SIAPSalvarAbrirProxima = {
        init: init,
        salvarEAguardarRedirecionamento: salvarEAguardarRedirecionamento,
        tentarAbrirProximaAoEntrarNaPaginaTurma: tentarAbrirProximaAoEntrarNaPaginaTurma
    };
})(window, document);
