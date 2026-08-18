(function () {
    'use strict';

    const API_BASE = 'https://siapai.online/api';
    const APP_BASE = API_BASE.replace(/\/api\/?$/, '');
    const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
    const CACHE_PREFIX = 'siap_saas_cache__';
    const LICENSE_REFRESH_MS = 5 * 60 * 1000;

    const KEYS = {
        auth: 'auth',
        loginHints: 'login_hints',
        deviceSeed: 'device_seed',
        manualLogout: 'manual_logout'
    };

    const PAGE_ROUTES = [
        {
            key: 'planejamento',
            match: (url) => /PlanejamentoProfessor[^a-zA-Z0-9]*[Tt]o?[Jj]ulaEdicao\.aspx/i.test(url) || /PlanejamentoProfessor(?:[/.-_]|Aula)?Edicao\.aspx/i.test(url) || /PlanejamentoProfessor.*AulaEdicao\.aspx/i.test(url),
            requiredGlobals: [
                'SIAPMatcher', 'SIAPConfig', 'SIAPState', 'SIAPStorage', 'SIAPLogger',
                'SIAPUtils', 'SIAPContext', 'SIAPApi', 'SIAPHabilidades', 'SIAPConteudos',
                'SIAPValidation', 'SIAPEixo', 'SIAPBimestre', 'SIAPMatrizSaeb',
                'SIAPExecutor', 'SIAPUI', 'SIAPBootstrap'
            ],
            init() {
                const bootstrap = getGlobalValue('SIAPBootstrap');
                if (typeof bootstrap?.init !== 'function') {
                    throw new Error('SIAPBootstrap.init não está disponível.');
                }
                bootstrap.init();
            }
        },
        {
            key: 'planejamento_turma',
            match: (url) => /PlanejamentoProfessor(?:Turma|Professor)?Edicao\.aspx/i.test(url) || url.includes('AcompanhamentoPlanejamentoProfessorListagem.aspx'),
            requiredGlobals: [],
            init() {
                if (typeof window.SIAPSalvarAbrirProxima?.init === 'function') {
                    window.SIAPSalvarAbrirProxima.init();
                }
            }
        },
        {
            key: 'frequencia',
            match: (url) => url.includes('FrequenciaAlunoEdicao.aspx'),
            requiredGlobals: ['SIAPFrequencia'],
            init() {
                const mod = getGlobalValue('SIAPFrequencia');
                if (typeof mod?.init !== 'function') {
                    throw new Error('SIAPFrequencia.init não está disponível.');
                }
                mod.init();
            }
        },
        {
            key: 'conteudo',
            match: (url) => url.includes('ConteudoProgramaticoEdicao.aspx'),
            // O bundle de conteúdo pode expor SIAPExecutorConteudo OU SIAPValidarConteudo.
            // Por isso a validação obrigatória fica dentro do inicializador da página,
            // com espera curta, em vez de travar antes do alias de compatibilidade.
            requiredGlobals: [],
            init() {
                const mod = getGlobalValue('SIAPExecutorConteudo') || getGlobalValue('SIAPValidarConteudo');
                if (typeof mod?.init !== 'function') {
                    throw new Error('Módulo de conteúdo não está disponível.');
                }
                mod.init();
            }
        },
        {
            key: 'pei',
            match: (url) => /PlanoEducacionalIndividualizado|PEI/i.test(url),
            requiredGlobals: ['SIAPPEIApi'],
            init() {
                const mod = getGlobalValue('SIAPPEIApi');
                if (typeof mod?.collectPayload !== 'function') {
                    throw new Error('Módulo de PEI não está disponível.');
                }
            }
        }
    ];

    let LICENSE_REFRESH_INTERVAL = null;
    let startedPageKey = null;

    function getGlobalRoot() {
        return window;
    }

    function getGlobalValue(name) {
        const root = getGlobalRoot();
        return window[name] || root[name] || globalThis[name];
    }

    function mirrorGlobals(names) {
        const root = getGlobalRoot();
        for (const name of names || []) {
            if (!window[name] && root && root[name]) {
                try { window[name] = root[name]; } catch {}
            }
        }
    }

    function setSharedGlobal(name, value) {
        const root = getGlobalRoot();
        try { window[name] = value; } catch {}
        try { globalThis[name] = value; } catch {}
        try {
            if (root && root !== window) {
                root[name] = value;
            }
        } catch {}
    }

    function setRuntimeStorage(name, value) {
        const serialized = value == null ? '' : String(value);
        try { localStorage.setItem(name, serialized); } catch {}
        try { sessionStorage.setItem(name, serialized); } catch {}
        try {
            let el = document.getElementById('siap-runtime-' + name.toLowerCase());
            if (!el) {
                el = document.createElement('meta');
                el.id = 'siap-runtime-' + name.toLowerCase();
                el.setAttribute('data-runtime-key', name);
                document.documentElement.appendChild(el);
            }
            el.setAttribute('content', serialized);
        } catch {}
    }

    function clearRuntimeStorage(name) {
        try { localStorage.removeItem(name); } catch {}
        try { sessionStorage.removeItem(name); } catch {}
        try {
            const el = document.getElementById('siap-runtime-' + name.toLowerCase());
            if (el) el.remove();
        } catch {}
    }

    function clearRuntimeAuthGlobals() {
        setSharedGlobal('SIAP_SAAS_TOKEN', '');
        setSharedGlobal('SIAP_SAAS_API_BASE', API_BASE);
        setSharedGlobal('SIAP_SAAS_APP_BASE', APP_BASE);
        setSharedGlobal('SIAP_SAAS_AUTH', null);
        clearRuntimeStorage('SIAP_SAAS_TOKEN');
        setRuntimeStorage('SIAP_SAAS_API_BASE', API_BASE);
        setRuntimeStorage('SIAP_SAAS_APP_BASE', APP_BASE);
        clearRuntimeStorage('SIAP_SAAS_AUTH');
    }

    function exposeRuntimeAuthGlobals(auth) {
        const runtimeAuth = auth ? {
            email: auth.email || '',
            user: auth.user || null,
            license: auth.license || null,
            accessGranted: !!auth.accessGranted
        } : null;

        setSharedGlobal('SIAP_SAAS_TOKEN', auth?.token || '');
        setSharedGlobal('SIAP_SAAS_API_BASE', API_BASE);
        setSharedGlobal('SIAP_SAAS_APP_BASE', APP_BASE);
        setSharedGlobal('SIAP_SAAS_AUTH', runtimeAuth);

        if (auth?.token) {
            setRuntimeStorage('SIAP_SAAS_TOKEN', auth.token);
        } else {
            clearRuntimeStorage('SIAP_SAAS_TOKEN');
        }
        setRuntimeStorage('SIAP_SAAS_API_BASE', API_BASE);
        setRuntimeStorage('SIAP_SAAS_APP_BASE', APP_BASE);
        if (runtimeAuth) {
            setRuntimeStorage('SIAP_SAAS_AUTH', JSON.stringify(runtimeAuth));
        } else {
            clearRuntimeStorage('SIAP_SAAS_AUTH');
        }
    }

    function now() {
        return Date.now();
    }

    function isLoginPage() {
        return /login\.aspx/i.test(location.href);
    }

    function escapeHtml(value) {
        return String(value || '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
    }

    async function chromeGet(key) {
        return new Promise((resolve) => {
            try {
                chrome.storage.local.get([key], (result) => resolve(result?.[key] ?? null));
            } catch {
                resolve(null);
            }
        });
    }

    async function chromeSet(key, value) {
        return new Promise((resolve) => {
            try {
                chrome.storage.local.set({ [key]: value }, resolve);
            } catch {
                resolve();
            }
        });
    }

    async function chromeDelete(key) {
        return new Promise((resolve) => {
            try {
                chrome.storage.local.remove([key], resolve);
            } catch {
                resolve();
            }
        });
    }

    function localGet(key) {
        try {
            return localStorage.getItem(CACHE_PREFIX + key);
        } catch {
            return null;
        }
    }

    function localSet(key, value) {
        try {
            localStorage.setItem(CACHE_PREFIX + key, value);
        } catch {}
    }

    function localDelete(key) {
        try {
            localStorage.removeItem(CACHE_PREFIX + key);
        } catch {}
    }

    async function cacheSet(key, value, ttlMs = ONE_YEAR_MS) {
        const payload = JSON.stringify({
            value,
            savedAt: now(),
            expiresAt: now() + ttlMs
        });

        await chromeSet(CACHE_PREFIX + key, payload);
        localSet(key, payload);
    }

    async function cacheGet(key) {
        let raw = await chromeGet(CACHE_PREFIX + key);
        if (!raw) raw = localGet(key);
        if (!raw) return null;

        try {
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') {
                await cacheDelete(key);
                return null;
            }

            if (parsed.expiresAt && parsed.expiresAt < now()) {
                await cacheDelete(key);
                return null;
            }

            return parsed.value ?? null;
        } catch {
            await cacheDelete(key);
            return null;
        }
    }

    async function cacheDelete(key) {
        await chromeDelete(CACHE_PREFIX + key);
        localDelete(key);
    }

    function stripAuth(auth) {
        if (!auth || typeof auth !== 'object') {
            return {
                email: null,
                token: null,
                refreshToken: null,
                user: null,
                license: null,
                renewal: null,
                accessGranted: false,
                message: ''
            };
        }

        return {
            email: auth.email || null,
            token: auth.token || null,
            refreshToken: auth.refreshToken || null,
            user: auth.user || null,
            license: auth.license || null,
            renewal: auth.renewal || null,
            accessGranted: !!auth.accessGranted,
            message: auth.message || ''
        };
    }

    async function getAuth() {
        const auth = await cacheGet(KEYS.auth);
        return stripAuth(auth);
    }

    async function setAuth(data) {
        await cacheSet(KEYS.auth, stripAuth(data), ONE_YEAR_MS);
    }

    async function clearAuth() {
        await cacheDelete(KEYS.auth);
    }

    async function isManualLogout() {
        return !!(await cacheGet(KEYS.manualLogout));
    }

    async function setManualLogout(value) {
        if (value) {
            await cacheSet(KEYS.manualLogout, true, ONE_YEAR_MS);
        } else {
            await cacheDelete(KEYS.manualLogout);
        }
    }

    async function getLoginHints() {
        return (await cacheGet(KEYS.loginHints)) || {};
    }

    async function setLoginHints(data) {
        await cacheSet(KEYS.loginHints, data, ONE_YEAR_MS);
    }

    async function getDeviceSeed() {
        let value = await cacheGet(KEYS.deviceSeed);
        if (!value) {
            value = Math.random().toString(36).slice(2) + Date.now().toString(36);
            await cacheSet(KEYS.deviceSeed, value, ONE_YEAR_MS);
        }
        return value;
    }

    function stopLicenseRefresh() {
        if (LICENSE_REFRESH_INTERVAL) {
            clearInterval(LICENSE_REFRESH_INTERVAL);
            LICENSE_REFRESH_INTERVAL = null;
        }
    }

    async function requestViaBackground(path, method, data, token) {
        return new Promise((resolve, reject) => {
            try {
                chrome.runtime.sendMessage(
                    {
                        type: 'SIAP_REQUEST',
                        path: String(path),
                        method: String(method || 'POST'),
                        data: data === undefined ? null : data,
                        token: String(token || '')
                    },
                    (response) => {
                        if (chrome.runtime.lastError) {
                            return reject(new Error(chrome.runtime.lastError.message));
                        }
                        if (!response || response.ok === false) {
                            return reject(new Error(response?.error || 'Falha de comunicação com o servidor.'));
                        }
                        resolve(response.data || {});
                    }
                );
            } catch (err) {
                reject(err);
            }
        });
    }

    async function request(path, method = 'POST', data = null, token = '', responseType = 'json') {
        let lastError = null;
        try {
            return await requestViaBackground(path, method, data, token);
        } catch (bgErr) {
            lastError = bgErr;
            console.warn('[SIAP SaaS] service worker indisponível, usando fallback direto:', bgErr?.message);
        }
        try {
            return await requestDirect(path, method, data, token, responseType);
        } catch (directErr) {
            throw lastError instanceof Error ? lastError : directErr;
        }
    }

    const PAGE_PROXY_ALLOWED_PATHS = new Set(['/catalogo-siap.php', '/revisa.php']);

    window.addEventListener('message', (event) => {
        if (event.source !== window || event.origin !== window.location.origin) return;
        const data = event?.data;
        if (!data || data.source !== 'SIAP_SAAS_PAGE_PROXY_REQUEST') return;
        const path = String(data.path || '');
        const method = String(data.method || 'POST').toUpperCase();
        const requestId = String(data.requestId || '');
        if (!requestId || !PAGE_PROXY_ALLOWED_PATHS.has(path) || method !== 'POST') return;

        requestViaBackground(path, method, data.payload === undefined ? null : data.payload, data.token || '')
            .then((payload) => {
                window.postMessage({
                    source: 'SIAP_SAAS_PAGE_PROXY_RESPONSE',
                    requestId,
                    ok: true,
                    payload
                }, window.location.origin);
            })
            .catch((err) => {
                window.postMessage({
                    source: 'SIAP_SAAS_PAGE_PROXY_RESPONSE',
                    requestId,
                    ok: false,
                    message: err?.message || 'Falha ao consultar o servidor SiapAI.'
                }, window.location.origin);
            });
    });

    function injectOverlayStyles() {
        if (document.getElementById('siap-saas-overlay-style')) return;

        const style = document.createElement('style');
        style.id = 'siap-saas-overlay-style';
        style.textContent = `
            #siap-saas-overlay,
            #siap-saas-overlay * {
                box-sizing: border-box !important;
                font-family: Arial, Helvetica, sans-serif !important;
            }
            #siap-saas-overlay {
                position: fixed;
                inset: 0;
                background: rgba(0, 0, 0, 0.45);
                z-index: 999999;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 16px;
            }
            #siap-saas-modal {
                width: 100%;
                max-width: 440px;
                background: #ffffff;
                border-radius: 14px;
                box-shadow: 0 15px 45px rgba(0,0,0,0.25);
                overflow: hidden;
            }
            #siap-saas-header {
                background: linear-gradient(135deg, #0b57d0, #1a73e8);
                color: #fff;
                padding: 16px 20px;
                font-size: 18px;
                font-weight: bold;
            }
            #siap-saas-body {
                padding: 18px 20px 20px;
            }
            .siap-saas-field {
                margin-bottom: 14px;
            }
            .siap-saas-field label {
                display: block;
                margin-bottom: 6px;
                font-size: 13px;
                font-weight: bold;
                color: #333;
            }
            .siap-saas-field input {
                width: 100%;
                padding: 11px 12px;
                border: 1px solid #cfd8dc;
                border-radius: 8px;
                font-size: 14px;
                outline: none;
                background: #fff;
            }
            .siap-saas-field input:focus {
                border-color: #1a73e8;
                box-shadow: 0 0 0 3px rgba(26,115,232,0.12);
            }
            #siap-saas-error {
                display: none;
                margin-bottom: 12px;
                padding: 10px 12px;
                background: #fdecea;
                color: #b3261e;
                border-radius: 8px;
                font-size: 13px;
                white-space: pre-line;
            }
            #siap-saas-actions {
                display: flex;
                gap: 10px;
                justify-content: flex-end;
                margin-top: 12px;
                flex-wrap: wrap;
            }
            .siap-saas-btn {
                border: none;
                border-radius: 8px;
                padding: 10px 16px;
                font-size: 14px;
                font-weight: bold;
                cursor: pointer;
            }
            .siap-saas-btn-secondary {
                background: #eceff1;
                color: #333;
            }
            .siap-saas-btn-primary {
                background: #1a73e8;
                color: #fff;
            }
            .siap-saas-btn-primary[disabled] {
                opacity: 0.7;
                cursor: wait;
            }
            #siap-saas-footer {
                margin-top: 10px;
                font-size: 12px;
                color: #666;
                line-height: 1.45;
            }
        `;
        document.head.appendChild(style);
    }

    async function showLoginOverlay() {
        injectOverlayStyles();

        const hints = await getLoginHints();
        const savedEmail = hints.email || '';

        return new Promise((resolve, reject) => {
            const oldOverlay = document.getElementById('siap-saas-overlay');
            if (oldOverlay) oldOverlay.remove();

            const overlay = document.createElement('div');
            overlay.id = 'siap-saas-overlay';
            overlay.innerHTML = `
                <div id="siap-saas-modal">
                    <div id="siap-saas-header">Validação de acesso</div>
                    <div id="siap-saas-body">
                        <div id="siap-saas-error"></div>
                        <div class="siap-saas-field">
                            <label for="siap-saas-email">E-mail</label>
                            <input type="email" id="siap-saas-email" placeholder="seuemail@dominio.com" value="${escapeHtml(savedEmail)}">
                        </div>
                        <div id="siap-saas-footer">
                            O acesso é liberado com a licença ativa no servidor após validar o e-mail cadastrado.
                        </div>
                        <div id="siap-saas-actions">
                            <button type="button" class="siap-saas-btn siap-saas-btn-secondary" id="siap-saas-cancelar">Cancelar</button>
                            <button type="button" class="siap-saas-btn siap-saas-btn-primary" id="siap-saas-validar">Validar</button>
                        </div>
                    </div>
                </div>
            `;

            document.body.appendChild(overlay);

            const emailInput = overlay.querySelector('#siap-saas-email');
            const btnValidar = overlay.querySelector('#siap-saas-validar');
            const btnCancelar = overlay.querySelector('#siap-saas-cancelar');
            const errorBox = overlay.querySelector('#siap-saas-error');

            function setError(message) {
                errorBox.textContent = message;
                errorBox.style.display = 'block';
            }

            function clearError() {
                errorBox.textContent = '';
                errorBox.style.display = 'none';
            }

            function finishCancel() {
                overlay.remove();
                reject(new Error('Validação cancelada.'));
            }

            async function submit() {
                clearError();
                const email = (emailInput.value || '').trim();

                if (!email) {
                    setError('Informe o e-mail.');
                    emailInput.focus();
                    return;
                }

                btnValidar.disabled = true;
                btnValidar.textContent = 'Validando...';

                await setLoginHints({ email });
                overlay.remove();
                resolve({ email });
            }

            btnValidar.addEventListener('click', submit);
            btnCancelar.addEventListener('click', finishCancel);
            overlay.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') finishCancel();
                if (e.key === 'Enter') submit();
            });

            setTimeout(() => emailInput.focus(), 50);
        });
    }

    function injectTopBarStyles() {
        if (document.getElementById('siap-topbar-style')) return;

        const style = document.createElement('style');
        style.id = 'siap-topbar-style';
        style.textContent = `
            .top .info {
                position: relative !important;
                min-height: 97px;
                padding-right: 420px !important;
                box-sizing: border-box;
            }
            #siap-license-panel,
            #siap-license-panel *,
            #siap-referral-overlay,
            #siap-referral-overlay * {
                box-sizing: border-box !important;
                font-family: Arial, Helvetica, sans-serif !important;
            }
            #siap-license-panel {
                position: absolute;
                top: 50%;
                right: 10px;
                transform: translateY(-50%);
                z-index: 9999;
                display: flex;
                align-items: center;
                gap: 10px;
                flex-wrap: nowrap;
                justify-content: flex-end;
                max-width: 650px;
            }
            #siap-license-status {
                display: none;
                align-items: center;
                gap: 8px;
                min-height: 46px;
                padding: 8px 11px;
                border: 1px solid rgba(27, 112, 54, 0.18);
                border-radius: 12px;
                background: rgba(255, 255, 255, 0.98);
                color: #176c2c;
                box-shadow: 0 6px 16px rgba(0, 0, 0, 0.12);
            }
            #siap-license-status.show { display: flex; }
            #siap-license-status strong { display: block; font-size: 12px; }
            #siap-license-status small { display: block; max-width: 190px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 10px; color: #49655a; }
            #siap-license-status .siap-license-dot { width: 8px; height: 8px; border-radius: 50%; background: #2f9a4b; box-shadow: 0 0 0 3px rgba(47,154,75,.12); }
            #siap-license-status.status-warning .siap-license-dot { background: #cc8400; }
            #siap-license-status.status-expired .siap-license-dot { background: #c13737; }
            #siap-referral-card {
                display: none;
                appearance: none;
                align-items: center;
                gap: 10px;
				margin-top: -10px;
                min-height: 70px;
                padding: 5px 5px;
                border: 1px solid rgba(27, 112, 54, 0.18);
                border-radius: 14px;
                background: rgba(255, 255, 255, 0.98);
                color: #176c2c;
                box-shadow: 0 7px 20px rgba(0, 0, 0, 0.16);
                cursor: pointer;
                text-align: left;
                transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease;
            }
            #siap-referral-card.show {
                display: flex;
            }
            #siap-referral-card:hover {
                transform: translateY(-2px);
                box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
                border-color: rgba(27, 112, 54, 0.34);
            }
            #siap-referral-card:focus-visible {
                outline: 3px solid rgba(255, 255, 255, 0.55);
                outline-offset: 3px;
            }
            #siap-referral-card .referral-visual {
                display: flex;
                align-items: center;
                gap: 6px;
                flex: 0 0 auto;
            }
            #siap-referral-card .referral-status-dot {
                width: 8px;
                height: 8px;
                flex: 0 0 8px;
                border-radius: 50%;
                background: #2f9a4b;
                box-shadow: 0 0 0 3px rgba(47, 154, 75, 0.12);
            }
            #siap-referral-card .referral-gift {
                position: relative;
                display: block;
                width: 36px;
                height: 38px;
                flex: 0 0 36px;
                filter: drop-shadow(0 3px 3px rgba(0, 0, 0, 0.16));
            }
            #siap-referral-card .gift-box {
                position: absolute;
                left: 4px;
                bottom: 2px;
                width: 27px;
                height: 21px;
                border-radius: 3px 3px 5px 5px;
                background: linear-gradient(145deg, #35a85a, #19783a);
                animation: siapGiftBox 3.8s ease-in-out infinite;
            }
            #siap-referral-card .gift-box::after {
                content: "";
                position: absolute;
                top: 0;
                bottom: 0;
                left: 11px;
                width: 5px;
                background: linear-gradient(180deg, #ffe18a, #f6bd3d);
            }
            #siap-referral-card .gift-lid {
                position: absolute;
                top: 7px;
                left: 1px;
                z-index: 2;
                width: 33px;
                height: 10px;
                border-radius: 4px;
                background: linear-gradient(145deg, #45b967, #228544);
                transform-origin: 28px 9px;
                animation: siapGiftOpen 3.8s ease-in-out infinite;
            }
            #siap-referral-card .gift-lid::after {
                content: "";
                position: absolute;
                top: 0;
                bottom: 0;
                left: 14px;
                width: 5px;
                background: linear-gradient(180deg, #ffe18a, #f6bd3d);
            }
            #siap-referral-card .gift-bow {
                position: absolute;
                top: -7px;
                left: 11px;
                z-index: 3;
                width: 11px;
                height: 9px;
            }
            #siap-referral-card .gift-bow::before,
            #siap-referral-card .gift-bow::after {
                content: "";
                position: absolute;
                top: 0;
                width: 9px;
                height: 7px;
                border: 2px solid #f8c54c;
                background: #fff5c9;
            }
            #siap-referral-card .gift-bow::before {
                right: 5px;
                border-radius: 10px 3px 8px 3px;
                transform: rotate(18deg);
            }
            #siap-referral-card .gift-bow::after {
                left: 5px;
                border-radius: 3px 10px 3px 8px;
                transform: rotate(-18deg);
            }
            @keyframes siapGiftOpen {
                0%, 52%, 100% { transform: translate(0, 0) rotate(0deg); }
                61% { transform: translate(-1px, -8px) rotate(-10deg); }
                70%, 78% { transform: translate(-4px, -13px) rotate(-22deg); }
                89% { transform: translate(-1px, -4px) rotate(-5deg); }
            }
            @keyframes siapGiftBox {
                0%, 52%, 100% { transform: scale(1); }
                66%, 82% { transform: scale(1.04); }
            }
            #siap-referral-card .referral-text {
                display: flex;
                min-width: 0;
                flex: 1 1 auto;
                flex-direction: column;
                line-height: 1.15;
            }
            #siap-referral-card .referral-main {
                display: block;
                margin-bottom: 4px;
                font-size: 14px;
                font-weight: 800;
                white-space: nowrap;
            }
            #siap-referral-card .referral-sub {
                display: block;
                font-size: 11px;
                font-weight: 700;
                white-space: nowrap;
            }
            #siap-referral-card .referral-plan {
                display: block;
                max-width: 245px;
                margin-top: 5px;
                padding-top: 4px;
                border-top: 1px solid #e8f1eb;
                color: #60766a;
                font-size: 10px;
                font-weight: 700;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            #siap-referral-card .referral-plan:empty {
                display: none;
            }
            #siap-referral-card.status-warning .referral-plan {
                color: #9a4b00;
            }
            #siap-referral-card.status-expired .referral-plan {
                color: #a32727;
            }
            @media (prefers-reduced-motion: reduce) {
                #siap-referral-card .gift-lid,
                #siap-referral-card .gift-box {
                    animation: none;
                }
            }
            .siap-header-auth-btn {
                border: none;
                border-radius: 4px;
                min-height: 30px;
                padding: 0 15px;
                font-size: 12px;
                font-weight: 800;
                cursor: pointer;
                color: #fff;
                box-shadow: 0 5px 14px rgba(0, 0, 0, 0.18);
                text-decoration: none;
                align-items: center;
                justify-content: center;
                transition: filter 150ms ease, transform 150ms ease;
            }
            .siap-header-auth-btn:hover { filter: brightness(1.06); transform: translateY(-1px); }
            .siap-header-auth-btn.entrar { background: rgba(20, 110, 210, 0.92); }
            .siap-header-auth-btn.sair { background: #c83535; }
            .siap-header-auth-btn.renovar { display: none; background: #ff9d00; }
            .siap-header-auth-btn.renovar.show { display: inline-flex; }
            .siap-header-auth-btn.suporte { background: #25d366; }
            .siap-header-auth-btn[disabled] { opacity: 0.45; cursor: default; }
            #siap-referral-overlay {
                position: fixed;
                inset: 0;
                z-index: 1000000;
                display: none;
                align-items: center;
                justify-content: center;
                padding: 18px;
                background: rgba(5, 23, 42, 0.56);
                backdrop-filter: blur(3px);
            }
            #siap-referral-overlay.show {
                display: flex;
            }
            #siap-referral-dialog {
                width: min(440px, 100%);
                overflow: hidden;
                border: 1px solid rgba(255, 255, 255, 0.4);
                border-radius: 18px;
                background: #fff;
                color: #17324d;
                box-shadow: 0 24px 65px rgba(0, 0, 0, 0.28);
                animation: siapReferralIn 180ms ease-out;
            }
            @keyframes siapReferralIn {
                from { opacity: 0; transform: translateY(8px) scale(0.985); }
                to { opacity: 1; transform: translateY(0) scale(1); }
            }
            #siap-referral-dialog-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 14px;
                padding: 18px 20px 15px;
                border-bottom: 1px solid #e9eef3;
                background: linear-gradient(135deg, #f5fff7, #ffffff);
            }
            #siap-referral-dialog-title {
                display: flex;
                align-items: center;
                gap: 10px;
                margin: 0;
                color: #176c2c;
                font-size: 19px;
                font-weight: 800;
            }
            #siap-referral-close {
                appearance: none;
                width: 32px;
                height: 32px;
                border: 0;
                border-radius: 50%;
                background: #eef3f6;
                color: #476174;
                cursor: pointer;
                font-size: 21px;
                line-height: 1;
            }
            #siap-referral-dialog-body {
                padding: 19px 20px 21px;
            }
            #siap-referral-dialog-body p {
                margin: 0 0 15px;
                color: #4b6477;
                font-size: 13px;
                line-height: 1.5;
            }
            #siap-referral-link-row {
                display: flex;
                gap: 8px;
            }
            #siap-referral-link {
                min-width: 0;
                flex: 1 1 auto;
                height: 42px;
                border: 1px solid #ccd8e2;
                border-radius: 10px;
                padding: 0 12px;
                background: #f8fafc;
                color: #17324d;
                font-size: 12px;
                outline: none;
            }
            #siap-referral-copy {
                flex: 0 0 auto;
                min-width: 86px;
                height: 42px;
                border: 0;
                border-radius: 10px;
                padding: 0 15px;
                background: #19743a;
                color: #fff;
                cursor: pointer;
                font-size: 12px;
                font-weight: 800;
            }
            #siap-referral-copy[disabled] {
                opacity: 0.55;
                cursor: wait;
            }
            #siap-referral-feedback {
                min-height: 18px;
                margin-top: 9px;
                color: #60798c;
                font-size: 12px;
            }
            #siap-referral-feedback.error {
                color: #b3261e;
            }
            @media (max-width: 1450px) {
                .top .info {
                    padding-right: 535px !important;
                }
                #siap-license-panel {
                    gap: 7px;
                }
                #siap-referral-card {
                    min-width: 285px;
                    padding-right: 11px;
                    padding-left: 11px;
                }
                #siap-referral-card .referral-gift {
                    transform: scale(0.9);
                    transform-origin: center;
                }
            }
            @media (max-width: 1180px) {
                .top .info {
                    min-height: 180px;
                    padding-right: 10px !important;
                    padding-bottom: 90px !important;
                }
                #siap-license-panel {
                    top: auto;
                    bottom: 10px;
                    right: 10px;
                    left: 10px;
                    transform: none;
                    justify-content: flex-end;
                    max-width: none;
                }
                #siap-referral-card {
                    min-width: 290px;
                }
            }
            @media (max-width: 720px) {
                .top .info {
                    min-height: 255px;
                    padding-bottom: 165px !important;
                }
                #siap-license-panel {
                    flex-wrap: wrap;
                    justify-content: stretch;
                }
                #siap-referral-card {
                    min-width: 0;
                    max-width: none;
                    flex: 1 1 100%;
                }
                .siap-header-auth-btn {
                    min-height: 42px;
                    flex: 1 1 100%;
                }
                #siap-referral-link-row {
                    flex-direction: column;
                }
                #siap-referral-copy {
                    width: 100%;
                }
            }
        `;
        document.head.appendChild(style);
    }

    async function waitForTopInfo(timeoutMs = 8000) {
        const startedAt = Date.now();
        while (Date.now() - startedAt < timeoutMs) {
            const el = document.querySelector('.top .info');
            if (el) return el;
            await new Promise(resolve => setTimeout(resolve, 250));
        }
        return null;
    }

    function getSiteUserName() {
        const el = document.querySelector('#lblNomeUsuario');
        return el ? (el.textContent || '').trim() : '';
    }

    async function waitForSiteUserName(timeoutMs = 10000) {
        const startedAt = Date.now();
        while (Date.now() - startedAt < timeoutMs) {
            const name = getSiteUserName();
            if (name) return name;
            await new Promise(resolve => setTimeout(resolve, 250));
        }
        return '';
    }

    function formatDateBR(value) {
        if (!value) return 'sem data';
        const normalized = String(value).replace(' ', 'T');
        const date = new Date(normalized);
        if (Number.isNaN(date.getTime())) {
            return String(value);
        }
        return date.toLocaleDateString('pt-BR');
    }

    function renderLicenseBadge(payload) {
        const statusCard = document.getElementById('siap-license-status');
        const title = document.getElementById('siap-license-title');
        const detail = document.getElementById('siap-license-detail');
        if (!statusCard || !title || !detail) return;

        if (!payload || !payload.license) {
            statusCard.classList.remove('show', 'status-active', 'status-warning', 'status-expired');
            return;
        }

        const license = payload.license || {};
        const warningDays = Number(payload.warning_days ?? 15);
        const daysRemaining = Number(payload.days_remaining ?? 9999);
        const expired = payload.expired === true || daysRemaining < 0;
        const warning = !expired && daysRemaining <= warningDays;
        const planName = String(license.plan || license.plan_name || license.nome_plano || payload.plan || 'SiapAI');
        const validity = payload.expires_at_br || formatDateBR(license.expires_at);

        statusCard.classList.remove('status-active', 'status-warning', 'status-expired');
        statusCard.classList.add('show', expired ? 'status-expired' : (warning ? 'status-warning' : 'status-active'));
        title.textContent = expired ? 'Licença vencida' : (warning ? 'Licença próxima do vencimento' : 'Licença ativa');
        detail.textContent = `${planName} · validade ${validity}`;
    }

    async function renderHeaderAuthButtons() {
        injectTopBarStyles();
        const topInfo = await waitForTopInfo();
        if (!topInfo) return;
        let panel = document.getElementById('siap-license-panel');
        if (panel) return;

        panel = document.createElement('div');
        panel.id = 'siap-license-panel';
        panel.innerHTML = `
            <div id="siap-license-status" aria-live="polite">
                <span class="siap-license-dot" aria-hidden="true"></span>
                <span>
                    <strong id="siap-license-title">Licença ativa</strong>
                    <small id="siap-license-detail"></small>
                </span>
            </div>
            <button type="button" class="siap-header-auth-btn entrar" id="siap-header-btn-entrar">ENTRAR</button>
            <button type="button" class="siap-header-auth-btn sair" id="siap-header-btn-sair">SAIR</button>
        `;
        topInfo.appendChild(panel);
        updateHeaderAuthButtonsState(false);

        const btnEntrar = panel.querySelector('#siap-header-btn-entrar');
        const btnSair = panel.querySelector('#siap-header-btn-sair');
        btnEntrar.addEventListener('click', async () => {
            btnEntrar.disabled = true;
            try { await menuActionEntrar(); } finally { btnEntrar.disabled = false; }
        });
        btnSair.addEventListener('click', async () => {
            if (btnSair.disabled) return;
            btnSair.disabled = true;
            try { await menuActionSair(); } finally { btnSair.disabled = false; }
        });
    }

    function updateHeaderAuthButtonsState(isLoggedIn) {
        const btnEntrar = document.getElementById('siap-header-btn-entrar');
        const btnSair = document.getElementById('siap-header-btn-sair');
        const statusCard = document.getElementById('siap-license-status');
        if (btnEntrar) {
            btnEntrar.style.display = isLoggedIn ? 'none' : 'inline-flex';
            btnEntrar.disabled = false;
        }
        if (btnSair) {
            btnSair.style.display = isLoggedIn ? 'inline-flex' : 'none';
            btnSair.disabled = false;
        }
        if (!isLoggedIn && statusCard) {
            statusCard.classList.remove('show', 'status-active', 'status-warning', 'status-expired');
        }
    }

    async function menuActionEntrar() {
        stopLicenseRefresh();
        clearRuntimeAuthGlobals();
        await clearAuth();
        await setManualLogout(false);
        location.reload();
    }

    async function menuActionSair() {
        stopLicenseRefresh();
        clearRuntimeAuthGlobals();
        await clearAuth();
        await setManualLogout(true);
        updateHeaderAuthButtonsState(false);
    }

    function extractUserFromResponse(result) {
        if (!result || typeof result !== 'object') return null;
        return result.user || result?.data?.user || result?.data || null;
    }

    async function validateEmailAccess(email, siteUserName) {
        const result = await request('/auth/validate-email.php', 'POST', {
            email: String(email || '').trim(),
            site_user_name: String(siteUserName || '').trim(),
            device_name: navigator.userAgent,
            device_seed: await getDeviceSeed(),
        });

        if (!result || result.ok !== true) {
            throw new Error(result?.error || result?.message || 'Falha ao validar o e-mail.');
        }

        const auth = {
            email: String(email || '').trim(),
            token: result.token || result?.data?.token || null,
            refreshToken: result.refresh_token || result?.data?.refresh_token || null,
            user: extractUserFromResponse(result),
            license: result.license || null,
            renewal: result.renewal || null,
            accessGranted: !!result.access_granted,
            message: result.message || ''
        };

        if (!auth.user) {
            throw new Error('A API não retornou os dados do usuário para este e-mail.');
        }

        return auth;
    }

    async function fetchLicenseStatus(token) {
        const result = await request('/license/check.php', 'GET', null, token || '');
        if (!result || result.ok !== true) {
            throw new Error(result?.error || result?.message || 'Falha ao consultar a licença.');
        }
        return result;
    }

    async function requireLiveLicense() {
        const auth = await getAuth();
        if (!auth?.token || auth.accessGranted !== true) {
            clearRuntimeAuthGlobals();
            throw new Error('Sua licença precisa ser validada no painel lateral antes de iniciar uma automação.');
        }

        let status;
        try {
            status = await fetchLicenseStatus(auth.token);
        } catch (_) {
            clearRuntimeAuthGlobals();
            throw new Error('Não foi possível revalidar sua licença. Confira a conexão e tente novamente.');
        }

        const accessGranted = status?.ok === true && status?.expired !== true;
        if (!accessGranted) {
            await clearAuth();
            clearRuntimeAuthGlobals();
            throw new Error('Sua licença não está ativa. Valide um e-mail com licença antes de usar os módulos.');
        }

        const freshAuth = {
            ...auth,
            user: status.user || auth.user || null,
            license: status.license || auth.license || null,
            renewal: status.renewal || auth.renewal || null,
            accessGranted: true,
            message: ''
        };
        await setAuth(freshAuth);
        exposeRuntimeAuthGlobals(freshAuth);
        return freshAuth;
    }

    async function refreshLicensePanel(auth) {
        if (!auth?.token) {
            updateHeaderAuthButtonsState(false);
            return null;
        }

        const status = await fetchLicenseStatus(auth.token);
        renderLicenseBadge(status);
        return status;
    }

    async function ensureLogin(siteUserName) {
        if (await isManualLogout()) {
            return {
                email: null,
                token: null,
                refreshToken: null,
                user: null,
                license: null,
                renewal: null,
                accessGranted: false,
                message: '',
                loggedOut: true
            };
        }

        const cachedAuth = await getAuth();
        if (cachedAuth && cachedAuth.email) {
            try {
                const refreshedAuth = await validateEmailAccess(cachedAuth.email, siteUserName);
                await setAuth(refreshedAuth);
                await setManualLogout(false);
                return refreshedAuth;
            } catch (err) {
                console.warn('[SIAP SaaS] falha ao revalidar e-mail salvo:', err);
                await clearAuth();
            }
        }

        return {
            email: null,
            token: null,
            refreshToken: null,
            user: null,
            license: null,
            renewal: null,
            accessGranted: false,
            message: 'Abra o painel lateral do SiapAI para validar o e-mail.',
            needsLogin: true
        };
    }

    function getCurrentProtectedPage() {
        const url = location.href;
        return PAGE_ROUTES.find((route) => route.match(url)) || null;
    }

    function ensureRequiredGlobals(requiredGlobals) {
        mirrorGlobals(requiredGlobals);
        const missing = [];
        for (const globalName of requiredGlobals) {
            if (!getGlobalValue(globalName)) {
                missing.push(globalName);
            }
        }
        if (missing.length) {
            throw new Error('Módulos ausentes: ' + missing.join(', '));
        }
    }

    function applyModuleCompatibilityAliases(pageKey) {
        const root = getGlobalRoot();

        if (pageKey === 'conteudo') {
            const executorConteudo = getGlobalValue('SIAPExecutorConteudo');
            const validarConteudo = getGlobalValue('SIAPValidarConteudo');

            if (!validarConteudo && executorConteudo) {
                try { window.SIAPValidarConteudo = executorConteudo; } catch {}
                try { globalThis.SIAPValidarConteudo = executorConteudo; } catch {}
                try { if (root && root !== window) root.SIAPValidarConteudo = executorConteudo; } catch {}
            }
        }
    }

    function shouldSilenceInitError(err) {
        const message = String(err?.message || err || '');
        return /Módulos ausentes:\s*(SIAPFrequencia|SIAPValidarConteudo|SIAPExecutorConteudo)/i.test(message);
    }

    function injectMainBridge() {
        return new Promise((resolve, reject) => {
            if (window.__SIAP_SAAS_BRIDGE_INJECTED__) {
                resolve();
                return;
            }

            const script = document.createElement('script');
            script.src = chrome.runtime.getURL('main_bridge.js');
            script.async = false;
            script.onload = () => {
                script.remove();
                window.__SIAP_SAAS_BRIDGE_INJECTED__ = true;
                resolve();
            };
            script.onerror = () => {
                script.remove();
                reject(new Error('Falha ao carregar a ponte principal da extensão.'));
            };
            (document.head || document.documentElement).appendChild(script);
        });
    }

    function bridgeRequest(action, payload = {}, timeoutMs = 12000) {
        return new Promise((resolve, reject) => {
            const requestId = 'siap_saas_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2);
            const timeout = setTimeout(() => {
                window.removeEventListener('message', onMessage);
                reject(new Error('Tempo esgotado na comunicação com a ponte da página.'));
            }, timeoutMs);

            function onMessage(event) {
                const data = event?.data;
                if (!data || data.source !== 'SIAP_SAAS_MAIN_BRIDGE' || data.requestId !== requestId) return;
                clearTimeout(timeout);
                window.removeEventListener('message', onMessage);
                if (data.ok) {
                    resolve(data.payload || {});
                } else {
                    reject(new Error(data.payload?.message || 'Erro retornado pela ponte da página.'));
                }
            }

            window.addEventListener('message', onMessage);
            window.postMessage({
                source: 'SIAP_SAAS_CONTENT',
                requestId,
                action,
                ...payload
            }, '*');
        });
    }

    async function ensureMainBridgeReady() {
        await injectMainBridge();
        await bridgeRequest('ping', {}, 5000);
    }

    function sanitizeSourceName(rawName) {
        const base = String(rawName || '').split('?')[0].split('#')[0];
        const lastPart = base.split('/').pop() || 'modulo';
        const safe = lastPart.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
        return safe || 'modulo.js';
    }

    async function injectScriptCode(jsText, sourceName) {
        const wrappedSource = `${String(jsText || '')}\n//# sourceURL=${sanitizeSourceName(sourceName)}`;
        await ensureMainBridgeReady();
        await bridgeRequest('executeCode', {
            code: wrappedSource,
            sourceName
        }, 15000);
    }

    async function runProtectedPageInitInPage(pageKey, requiredGlobals) {
        await ensureMainBridgeReady();
        await bridgeRequest('initPage', {
            pageKey,
            requiredGlobals: requiredGlobals || []
        }, 12000);
    }


    function getLocalModulePaths(pageKey) {
        if (pageKey === 'planejamento') {
            return [
                'planejamento/config.js',
                'planejamento/state.js',
                'planejamento/storage.js',
                'planejamento/logger.js',
                'planejamento/utils.js',
                'planejamento/matcher.js',
                'planejamento/matriz_saeb.js',
                'planejamento/context.js',
                'planejamento/api.js',
                'planejamento/habilidades.js',
                'planejamento/conteudos.js',
                'planejamento/validation.js',
                'planejamento/eixo.js',
                'planejamento/bimestre.js',
                'planejamento/salvar.js',
                'planejamento/executor.js',
                'planejamento/ui.js',
                'planejamento/bootstrap.js'
            ];
        }

        if (pageKey === 'planejamento_turma') {
            return ['planejamento/salvar.js'];
        }

        if (pageKey === 'conteudo') {
            return ['conteudo/conteudo.js'];
        }

        if (pageKey === 'frequencia') {
            return ['frequencia/2.js'];
        }

        return null;
    }

    async function loadLocalExtensionModules(pageKey) {
        const paths = getLocalModulePaths(pageKey);
        if (!paths || !paths.length) return false;

        for (const path of paths) {
            if (!window.chrome?.runtime?.getURL) {
                throw new Error('chrome.runtime.getURL não está disponível para carregar módulo local.');
            }

            const url = chrome.runtime.getURL(path);
            if (!/^chrome-extension:\/\//i.test(url) || /\/invalid(\/|$)/i.test(url)) {
                throw new Error(`Recurso local inválido (${path}). Remova a extensão antiga e carregue a pasta oficial da v5.8.1 em chrome://extensions.`);
            }
            const response = await fetch(url, { cache: 'no-store' });

            if (!response.ok) {
                throw new Error(`Falha ao carregar módulo local ${path}: HTTP ${response.status}`);
            }

            const jsText = await response.text();
            const trimmed = String(jsText || '').trim();

            if (!trimmed) {
                throw new Error(`Módulo local vazio: ${path}`);
            }

            await injectScriptCode(trimmed, url);
        }

        console.log(`[SiapAI] Módulo ${pageKey} carregado localmente pela extensão (${paths.length} arquivo(s)).`);
        return true;
    }

    async function loadProtectedModules(pageKey, token) {
        const loadedLocal = await loadLocalExtensionModules(pageKey);
        if (loadedLocal) return;

        const endpoint = `${API_BASE}/modules/bootstrap.php?page=${encodeURIComponent(pageKey)}`;
        const jsText = await request(`/modules/bootstrap.php?page=${encodeURIComponent(pageKey)}`, 'GET', null, token || '', 'text');
        const trimmed = String(jsText || '').trim();

        if (!trimmed) {
            throw new Error('O servidor não retornou código para o módulo protegido.');
        }

        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
            try {
                const parsed = JSON.parse(trimmed);
                if (parsed && typeof parsed === 'object' && (parsed.error || parsed.message || parsed.details)) {
                    throw new Error(parsed.error || parsed.message || parsed.details);
                }
            } catch (jsonError) {
                console.warn('[SIAP SaaS] Resposta suspeita do bundle protegido.', {
                    endpoint,
                    preview: trimmed.slice(0, 400),
                    jsonError
                });
            }
        }

        if (/^\s*</.test(trimmed)) {
            throw new Error('O endpoint dos módulos retornou HTML em vez de JavaScript.');
        }

        await injectScriptCode(trimmed, endpoint);
    }

    function getSidePanelContext() {
        const page = getCurrentProtectedPage();
        const labels = {
            planejamento_turma: 'Turma de planejamento aberta',
            planejamento: 'Edição de aula aberta',
            frequencia: 'Frequência aberta',
            conteudo: 'Conteúdo programático aberto',
            pei: 'PEI aberto'
        };
        const fields = [];
        function findAssociatedLabel(element, rawLabel) {
            if (rawLabel && !/^ct\d+[A-Z]*[-$]/i.test(rawLabel)) return rawLabel;
            const labelElements = element.closest?.('table, tr, td, div')?.querySelectorAll?.('label');
            if (labelElements?.length) {
                for (const labelEl of labelElements) {
                    const text = String(labelEl.textContent || '').trim();
                    if (text && text.length < 80 && !/^ct\d+[A-Z]*[-$]/i.test(text)) return text;
                }
            }
            const forId = element.id ? document.getElementById(element.id)?.previousElementSibling : null;
            if (forId && forId.tagName === 'LABEL') {
                const text = String(forId.textContent || '').trim();
                if (text && text.length < 80) return text;
            }
            if (rawLabel && /\w/.test(rawLabel)) return rawLabel.replace(/^ct\d+[A-Z]*[-$]/i, '');
            return null;
        }

        document.querySelectorAll('input[readonly], input:not([type]), select').forEach((element) => {
            const value = String(element.value || '').trim();
            if (!value || value.length > 120) return;
            const rawLabel = String(element.getAttribute('aria-label') || element.name || element.id || '');
            const label = findAssociatedLabel(element, rawLabel);
            if (label) {
            const name = String(label)
                .replace(/^(ct\d+[A-Z]*-|MainContent_|ctl\d+_)/i, '')
                .replace(/\$(ct\d+[A-Z]*-|MainContent_|ctl\d+_)/i, '$')
                .split(/\$|_/)
                .filter((part) => !/^ct\d+[A-Z]*$/i.test(part))
                .map((part) => part.replace(/^ph/, '').trim())
                .filter(Boolean)
                .join(' · ')
                .replace(/([A-Z])/g, ' $1')
                .replace(/\s+/g, ' ')
                .trim();
            if (name) fields.push(`${name}: ${value}`);
            }
        });
        return {
            page: page?.key || 'siap',
            label: labels[page?.key] || 'Página do SIAP reconhecida',
            summary: fields.slice(0, 8).join(' · ') || 'Página identificada. Selecione um módulo no painel lateral do SiapAI.',
            url: location.href
        };
    }

    async function ensureHeadlessEngine(page) {
        if (!page) throw new Error('Abra uma página compatível do SIAP antes de usar este módulo.');

        const auth = await requireLiveLicense();
        await ensureMainBridgeReady();
        await bridgeRequest('activateHeadless', {}, 5000);

        if (startedPageKey !== page.key) {
            if (page.key === 'pei') {
                const peiUrl = chrome.runtime.getURL('pei/pei-api.js');
                const source = await fetch(peiUrl).then((response) => {
                    if (!response.ok) throw new Error('Arquivo do módulo PEI não encontrado.');
                    return response.text();
                });
                await injectScriptCode(source, peiUrl);
            } else {
                await loadProtectedModules(page.key, auth.token);
            }
            await bridgeRequest('initHeadless', {
                pageKey: page.key,
                requiredGlobals: page.requiredGlobals || []
            }, 15000);
            startedPageKey = page.key;
            console.log(`[SIAP SaaS] motor iniciado no modo lateral: ${page.key}`);
        }
    }

    async function executeSidePanelCommand(message) {
        const detectedPage = getCurrentProtectedPage();
        // Algumas instalações do SIAP classificam a própria edição de aula como
        // "planejamento_turma". O Revisa precisa do motor completo de
        // Planejamento nessa tela; portanto, normalizamos somente os seus
        // comandos para a rota que carrega todos os módulos necessários.
        const isRevisaCommand = /^REVISA_/.test(String(message?.command || ''));
        const planningPage = PAGE_ROUTES.find((route) => route.key === 'planejamento');
        const page = isRevisaCommand && detectedPage?.key === 'planejamento_turma' && planningPage
            ? planningPage
            : detectedPage;
        if (!page) {
            throw new Error('Abra a tela correspondente do SIAP antes de executar este comando.');
        }
        if (message.expectedPage && page.key !== message.expectedPage) {
            throw new Error(`Este comando exige a tela: ${message.expectedPage}. A tela atual é: ${page.key}.`);
        }
        await ensureHeadlessEngine(page);
        return bridgeRequest('engineCommand', {
            command: message.command,
            payload: message.payload || {}
        }, Math.max(15000, Number(message.timeoutMs) || 15000));
    }

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
        if (message?.type === 'SIAP_READ_CONTEXT') {
            sendResponse({ ok: true, context: getSidePanelContext() });
            return false;
        }
        if (message?.type === 'SIAP_AUTH_CONTEXT') {
            Promise.all([waitForSiteUserName(3000), getDeviceSeed()])
                .then(([siteUserName, deviceSeed]) => sendResponse({ ok: true, data: { siteUserName: siteUserName || '', deviceSeed } }))
                .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
            return true;
        }
        if (message?.type === 'SIAP_AUTH_APPLY') {
            const auth = message.auth || null;
            Promise.resolve()
                .then(async () => {
                    if (!auth?.token) throw new Error('Sessão de licença inválida.');
                    await setAuth(auth);
                    await setManualLogout(false);
                    exposeRuntimeAuthGlobals(auth);
                    return { applied: true };
                })
                .then((data) => sendResponse({ ok: true, data }))
                .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
            return true;
        }
        if (message?.type !== 'SIAP_ENGINE_COMMAND') return false;

        executeSidePanelCommand(message)
            .then((data) => sendResponse({ ok: true, data }))
            .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
        return true;
    });

    async function bootProtectedPage(auth) {
        const page = getCurrentProtectedPage();
        if (!page) {
            console.log('[SIAP SaaS] página sem módulo protegido:', location.href);
            return;
        }

        if (startedPageKey === page.key) {
            return;
        }

        if (!auth?.token) {
            throw new Error('Token ausente para carregar o módulo protegido.');
        }

        await loadProtectedModules(page.key, auth.token);
        await runProtectedPageInitInPage(page.key, page.requiredGlobals);
        startedPageKey = page.key;
        console.log(`[SIAP SaaS] módulo protegido iniciado: ${page.key}`);
    }

    async function init() {
        if (isLoginPage()) {
            console.log('[SIAP SaaS] Página de login detectada. Validação adiada.');
            return;
        }

        const siteUserName = await waitForSiteUserName(10000);
        if (!siteUserName) {
            console.log('[SIAP SaaS] Nome do usuário no SIAP não disponível nesta página.');
            return;
        }

        const auth = await ensureLogin(siteUserName);
        exposeRuntimeAuthGlobals(auth);

        if (auth?.loggedOut || !auth?.email) {
            clearRuntimeAuthGlobals();
            console.log('[SIAP SaaS] sessão encerrada manualmente.');
            return;
        }

        if (!auth.accessGranted || !auth.token) {
            exposeRuntimeAuthGlobals(auth);
            console.warn('[SIAP SaaS] licença sem acesso:', auth.message || 'acesso indisponível');
            return;
        }
        console.log('[SIAP SaaS] autenticação concluída sem injeção de interface na página.');
    }

    function boot() {
        init().catch(err => {
            console.warn('[SIAP SaaS] inicialização interrompida sem alterar a página:', err);
        });
    }

    clearRuntimeAuthGlobals();

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot, { once: true });
    } else {
        boot();
    }
})();
