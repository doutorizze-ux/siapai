
(function () {
    'use strict';

    const API_URL = 'https://siapai.online/api/pei_generate.php';

    const IDS = {
        deficiencia: 'cphFuncionalidade_cphCampos_txtNomeNecessidadeEspecial',
        turma: 'cphFuncionalidade_cphCampos_txtTurma',
        bimestre: 'cphFuncionalidade_cphCampos_txtBimestre',
        disciplina: 'cphFuncionalidade_cphCampos_txtDisciplina',
        potencialidades_cognitivas: 'cphFuncionalidade_cphCampos_txtPotencialidadesCognitivas',
        potencialidades_habilidades: 'cphFuncionalidade_cphCampos_txtPotencialidadesHabilidades',
        necessidades_cognitivas: 'cphFuncionalidade_cphCampos_txtNecessidadesCognitivas',
        necessidades_habilidades: 'cphFuncionalidade_cphCampos_txtNecessidadesHabilidades',
        out_expectativas: 'cphFuncionalidade_cphCampos_txtPotencialidadesExpectativas',
        out_conteudo: 'cphFuncionalidade_cphCampos_txtPotencialidadesConteudo',
        out_estrategias: 'cphFuncionalidade_cphCampos_txtNecessidadesExtratageias',
        out_procedimentos: 'cphFuncionalidade_cphCampos_txtNecessidadesProcedimentos',
        salvar: 'cphFuncionalidade_btnAlterar'
    };

    function getValue(id) {
        const el = document.getElementById(id);
        return el ? String(el.value || '').trim() : '';
    }

    function setValue(id, value) {
        const el = document.getElementById(id);
        if (!el) {
            console.warn('[SIAP PEI] campo não encontrado:', id);
            return false;
        }

        el.value = value || '';
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
        return true;
    }

    function normalizeText(value) {
        return String(value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
    }

    function isVisible(el) {
        if (!el) return false;
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    }

    function isSiteBusy() {
        try {
            const manager = window.Sys?.WebForms?.PageRequestManager?.getInstance?.();
            if (manager?.get_isInAsyncPostBack?.()) return true;
        } catch (_) {}

        return ['#UpdateProgress1', '#updateProgress', '.updateProgress', '.modalAguarde', '.aguarde', '.loading', '#divAguarde']
            .some(selector => isVisible(document.querySelector(selector)));
    }

    function getPageMessage() {
        return normalizeText(document.querySelector('#painelMensagem')?.textContent || '');
    }

    function hasSaveFailureMessage() {
        return /erro ao salvar|falha ao salvar|nao foi possivel salvar|não foi possível salvar/.test(getPageMessage());
    }

    function fieldSnapshot() {
        return [IDS.out_expectativas, IDS.out_conteudo, IDS.out_estrategias, IDS.out_procedimentos]
            .map(id => document.getElementById(id))
            .filter(Boolean)
            .map(el => `${el.id}:${String(el.value || '')}`)
            .join('|');
    }

    function wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async function waitForSaveConfirmation(before, timeoutMs = 16000) {
        const startedAt = Date.now();
        let sawBusy = false;

        while (Date.now() - startedAt < timeoutMs) {
            if (isSiteBusy()) sawBusy = true;
            if (hasSaveFailureMessage()) {
                throw new Error('O SIAP informou uma falha ao salvar o PEI. Revise os campos e tente novamente.');
            }

            if (sawBusy && !isSiteBusy()) {
                return { saved: true, confirmedBy: 'postback' };
            }

            await wait(350);
        }

        const after = fieldSnapshot();
        if (after !== before && !hasSaveFailureMessage()) {
            return { saved: true, confirmedBy: 'campos-preservados' };
        }

        throw new Error('O SIAP não confirmou o salvamento do PEI. Nenhum sucesso foi informado.');
    }

    function clickSaveButton() {
        const button = document.getElementById(IDS.salvar);
        if (!button || button.disabled) {
            throw new Error('Botão Salvar do PEI não está disponível.');
        }

        try { button.focus(); } catch (_) {}
        button.click();
    }

    window.SIAPPEIApi = {
        collectPayload() {
            const comando = window.SIAPPEIUI?.getComando?.() || '';

            return {
                action: 'pei_generate',
                deficiencia: getValue(IDS.deficiencia),
                turma: getValue(IDS.turma),
                bimestre: getValue(IDS.bimestre),
                disciplina: getValue(IDS.disciplina),
                potencialidades_cognitivas: getValue(IDS.potencialidades_cognitivas),
                potencialidades_habilidades: getValue(IDS.potencialidades_habilidades),
                necessidades_cognitivas: getValue(IDS.necessidades_cognitivas),
                necessidades_habilidades: getValue(IDS.necessidades_habilidades),
                comando_ia: comando
            };
        },

        async generate(payload) {
            const res = await fetch(API_URL, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                credentials: 'omit',
                body: JSON.stringify(payload)
            });

            const text = await res.text();
            let json;

            try {
                json = JSON.parse(text);
            } catch (e) {
                console.error('[SIAP PEI] resposta bruta:', text);
                throw new Error('A API retornou uma resposta inválida.');
            }

            if (!res.ok || !json.success) {
                throw new Error(json.message || 'Erro ao gerar PEI.');
            }

            return json;
        },

        fillFields(data) {
            const results = [
                setValue(IDS.out_expectativas, data.txtPotencialidadesExpectativas),
                setValue(IDS.out_conteudo, data.txtPotencialidadesConteudo),
                setValue(IDS.out_estrategias, data.txtNecessidadesExtratageias),
                setValue(IDS.out_procedimentos, data.txtNecessidadesProcedimentos)
            ];

            if (results.some(result => !result)) {
                throw new Error('Um ou mais campos pedagógicos do PEI não foram encontrados no SIAP.');
            }

            return { filled: true, fieldCount: results.length };
        },

        async saveFields() {
            const before = fieldSnapshot();
            clickSaveButton();
            return await waitForSaveConfirmation(before);
        },

        async fillAndSave(data) {
            const filled = this.fillFields(data);
            const saved = await this.saveFields();
            return { ...filled, ...saved };
        }
    };

    console.log('[SIAP PEI] api 3.2.21 carregada');
})();
