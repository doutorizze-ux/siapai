
(function () {
    'use strict';

    const PEI_PAGE = 'PlanoEducacionalIndividualizadoPEIProfessorEdicao.aspx';

    function normalizarPlano(valor) {
        return String(valor || '')
            .toUpperCase()
            .replace(/[‐‑‒–—−]/g, '-')
            .replace(/_/g, '-')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function planoPermitePei(valor) {
        const plano = normalizarPlano(valor);
        return /(?:^|[^A-Z0-9])P\s*-?\s*(?:IV|V)(?=$|[^A-Z0-9])/.test(plano);
    }

    function lerAuthRuntime() {
        const direto = window.SIAP_SAAS_AUTH || globalThis.SIAP_SAAS_AUTH;
        if (direto && typeof direto === 'object') return direto;

        const fontes = [];
        try { fontes.push(sessionStorage.getItem('SIAP_SAAS_AUTH')); } catch {}
        try { fontes.push(localStorage.getItem('SIAP_SAAS_AUTH')); } catch {}
        try {
            fontes.push(document.querySelector('[data-runtime-key="SIAP_SAAS_AUTH"]')?.getAttribute('content'));
        } catch {}

        for (const valor of fontes) {
            if (!valor) continue;
            try {
                const auth = JSON.parse(valor);
                if (auth && typeof auth === 'object') return auth;
            } catch {}
        }

        return null;
    }

    function primeiroValor(...valores) {
        for (const valor of valores) {
            if (valor !== undefined && valor !== null && String(valor).trim() !== '') {
                return String(valor).trim();
            }
        }
        return '';
    }

    function obterEstadoDoPlano() {
        const auth = lerAuthRuntime();
        const licenca = auth?.license || {};
        const card = document.getElementById('siap-referral-card');
        const textoPainel = document.getElementById('siap-referral-plan')?.textContent || '';
        const nomePlano = primeiroValor(
            licenca.plan,
            licenca.plan_name,
            licenca.nome_plano,
            licenca.plano,
            licenca.plan_code,
            licenca.codigo_plano
        );

        const planoConhecido = Boolean(nomePlano || textoPainel);
        const planoPermitido = planoPermitePei(nomePlano) || planoPermitePei(textoPainel);
        const acessoAtivo = auth?.accessGranted === true;
        const acessoInativo = auth?.accessGranted === false;
        const painelAtivo = Boolean(
            card?.classList.contains('status-active') ||
            card?.classList.contains('status-warning')
        );
        const painelExpirado = Boolean(card?.classList.contains('status-expired'));

        if (planoPermitido && (acessoAtivo || painelAtivo) && !painelExpirado) {
            return { pronto: true, permitido: true };
        }

        if (acessoInativo || painelExpirado) {
            return { pronto: true, permitido: false };
        }

        if (planoConhecido && !planoPermitido && (acessoAtivo || painelAtivo)) {
            return { pronto: true, permitido: false };
        }

        return { pronto: false, permitido: false };
    }

    async function isPlanoPermitido(timeoutMs = 15000) {
        const inicio = Date.now();

        do {
            const estado = obterEstadoDoPlano();
            if (estado.pronto) return estado.permitido;
            await new Promise(resolve => setTimeout(resolve, 250));
        } while (Date.now() - inicio < timeoutMs);

        return false;
    }

    function mostrarAvisoBloqueado() {
        if (document.getElementById('siap-pei-bloqueado')) return;

        const box = document.createElement('div');
        box.id = 'siap-pei-bloqueado';
        box.style.position = 'fixed';
        box.style.top = '90px';
        box.style.right = '22px';
        box.style.zIndex = '999999';
        box.style.width = '340px';
        box.style.background = '#fff';
        box.style.border = '1px solid #fecaca';
        box.style.borderRadius = '12px';
        box.style.boxShadow = '0 10px 28px rgba(0,0,0,.18)';
        box.style.fontFamily = 'Arial, sans-serif';
        box.style.overflow = 'hidden';

        box.innerHTML = `
            <div style="background:#991b1b;color:#fff;padding:13px 15px;font-weight:700;font-size:15px;">
                PEI com IA indisponível
            </div>
            <div style="padding:13px 15px;color:#374151;font-size:13px;line-height:1.4;">
                Este módulo está disponível apenas para planos <strong>P-IV</strong> ou <strong>P-V</strong> com licença ativa.
            </div>
        `;

        document.body.appendChild(box);

        setTimeout(() => {
            box.remove();
        }, 7000);
    }

    async function init() {
        if (!location.href.includes(PEI_PAGE)) return;

        console.log('[SIAP PEI] 3.2.21 painel iniciado');

        if (!(await isPlanoPermitido())) {
            console.warn('[SIAP PEI] bloqueado: plano não permitido ou licença inativa');
            mostrarAvisoBloqueado();
            return;
        }

        if (!window.SIAPPEIApi || !window.SIAPPEIUI) {
            console.warn('[SIAP PEI] dependências ausentes');
            return;
        }

        window.SIAPPEIUI.injectStyles();

        window.SIAPPEIUI.createPanel(async () => {
            try {
                window.SIAPPEIUI.setLoading(true);

                const payload = window.SIAPPEIApi.collectPayload();
                console.log('[SIAP PEI] payload:', payload);

                const response = await window.SIAPPEIApi.generate(payload);

                await window.SIAPPEIApi.fillAndSave(response.data);
                window.SIAPPEIUI.toast('PEI gerado e salvo com confirmação do SIAP.', 'success');

            } catch (error) {
                console.error('[SIAP PEI] erro:', error);
                window.SIAPPEIUI.toast(error.message || 'Erro ao gerar PEI.', 'error');
            } finally {
                window.SIAPPEIUI.setLoading(false);
            }
        });

        setTimeout(() => {
            window.SIAPPEIUI.setInfo(window.SIAPPEIApi.collectPayload());
        }, 500);
    }

    window.SIAPPEI = { init };
    setTimeout(init, 1000);
})();
