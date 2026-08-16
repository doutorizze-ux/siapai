
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
        out_procedimentos: 'cphFuncionalidade_cphCampos_txtNecessidadesProcedimentos'
    };

    function getValue(id) {
        const el = document.getElementById(id);
        return el ? String(el.value || '').trim() : '';
    }

    function setValue(id, value) {
        const el = document.getElementById(id);
        if (!el) {
            console.warn('[SIAP PEI] campo não encontrado:', id);
            return;
        }

        el.value = value || '';
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
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
            setValue(IDS.out_expectativas, data.txtPotencialidadesExpectativas);
            setValue(IDS.out_conteudo, data.txtPotencialidadesConteudo);
            setValue(IDS.out_estrategias, data.txtNecessidadesExtratageias);
            setValue(IDS.out_procedimentos, data.txtNecessidadesProcedimentos);
        }
    };

    console.log('[SIAP PEI] api 3.2.21 carregada');
})();
