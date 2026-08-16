
(function () {
    'use strict';

    window.SIAPPEIUI = {
        injectStyles() {
            if (document.getElementById('siap-pei-style')) return;

            const style = document.createElement('style');
            style.id = 'siap-pei-style';
            style.innerHTML = `
                #siap-pei-panel {
                    position: fixed;
                    top: 68px;
                    right: 18px;
                    width: 390px;
                    max-height: calc(100vh - 90px);
                    overflow-y: auto;
                    z-index: 999999;
                    background: #fff;
                    border: 1px solid #d8e0ea;
                    border-radius: 14px;
                    box-shadow: 0 10px 30px rgba(0,0,0,.22);
                    font-family: Arial, sans-serif;
                    color: #111827;
                }

                #siap-pei-panel * { box-sizing: border-box; }

                .siap-pei-header {
                    background: linear-gradient(135deg, #0b4f97, #073b73);
                    color: #fff;
                    padding: 16px 18px;
                    border-radius: 14px 14px 0 0;
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    gap: 10px;
                }

                .siap-pei-title {
                    font-size: 18px;
                    font-weight: 700;
                    margin: 0;
                    line-height: 1.2;
                }

                .siap-pei-subtitle {
                    font-size: 12px;
                    opacity: .9;
                    margin-top: 4px;
                }

                .siap-pei-close {
                    width: 30px;
                    height: 30px;
                    border: 1px solid rgba(255,255,255,.35);
                    background: rgba(255,255,255,.15);
                    color: #fff;
                    border-radius: 8px;
                    cursor: pointer;
                    font-size: 18px;
                    line-height: 1;
                }

                .siap-pei-body { padding: 14px; }

                .siap-pei-card {
                    border: 1px solid #dce3ec;
                    border-radius: 10px;
                    background: #f9fbfe;
                    padding: 12px;
                    margin-bottom: 12px;
                }

                .siap-pei-card h4 {
                    margin: 0 0 8px 0;
                    color: #003366;
                    font-size: 14px;
                    font-weight: 700;
                }

                .siap-pei-info-grid {
                    display: grid;
                    grid-template-columns: 82px 1fr;
                    gap: 6px 8px;
                    font-size: 12px;
                    line-height: 1.3;
                }

                .siap-pei-info-grid strong { color: #111827; }
                .siap-pei-info-grid span { color: #374151; }

                .siap-pei-help {
                    font-size: 12px;
                    color: #6b7280;
                    margin: 2px 0 8px 0;
                    line-height: 1.35;
                }

                #siap-pei-comando {
                    width: 100%;
                    min-height: 108px;
                    resize: vertical;
                    border: 1px solid #cfd8e3;
                    border-radius: 8px;
                    padding: 10px;
                    font-size: 13px;
                    line-height: 1.35;
                    outline: none;
                    background: #fff;
                    color: #111827;
                }

                #siap-pei-comando:focus {
                    border-color: #2563eb;
                    box-shadow: 0 0 0 3px rgba(37,99,235,.12);
                }

                .siap-pei-counter {
                    margin-top: 4px;
                    text-align: right;
                    font-size: 11px;
                    color: #6b7280;
                }

                .siap-pei-privacy {
                    background: #e8f4ff;
                    border: 1px solid #b8dcff;
                    color: #164e7a;
                    border-radius: 9px;
                    padding: 10px 12px;
                    font-size: 12px;
                    line-height: 1.35;
                    margin-bottom: 12px;
                }

                .siap-pei-privacy strong { color: #0b4f97; }

                #siap-pei-generate {
                    width: 100%;
                    background: linear-gradient(135deg, #16a34a, #0f9f43);
                    color: #fff;
                    border: none;
                    padding: 13px 14px;
                    border-radius: 9px;
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: 700;
                    box-shadow: 0 5px 14px rgba(22,163,74,.28);
                }

                #siap-pei-generate:disabled {
                    opacity: .72;
                    cursor: wait;
                }

                #siap-pei-minibar {
                    position: fixed;
                    top: 90px;
                    right: 22px;
                    z-index: 999998;
                    display: none;
                }

                #siap-pei-open {
                    background: linear-gradient(135deg, #7c3aed, #2563eb);
                    color: #fff;
                    border: none;
                    padding: 13px 18px;
                    border-radius: 12px;
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: 700;
                    box-shadow: 0 8px 22px rgba(37,99,235,.35);
                }

                #siap-pei-toast {
                    position: fixed;
                    top: 160px;
                    right: 25px;
                    z-index: 1000000;
                    max-width: 380px;
                    padding: 13px 16px;
                    border-radius: 10px;
                    color: #fff;
                    font-family: Arial, sans-serif;
                    font-size: 13px;
                    font-weight: 600;
                    box-shadow: 0 8px 22px rgba(0,0,0,.22);
                    display: none;
                }

                #siap-pei-toast.success { background: #16a34a; }
                #siap-pei-toast.error { background: #dc2626; }
            `;
            document.head.appendChild(style);
        },

        createPanel(onClick) {
            if (document.getElementById('siap-pei-panel')) return;

            const panel = document.createElement('div');
            panel.id = 'siap-pei-panel';
            panel.innerHTML = `
                <div class="siap-pei-header">
                    <div>
                        <div class="siap-pei-title">PEI com IA</div>
                        <div class="siap-pei-subtitle">Plano Educacional Individualizado</div>
                    </div>
                    <button type="button" class="siap-pei-close" title="Minimizar">×</button>
                </div>

                <div class="siap-pei-body">
                    <div class="siap-pei-card">
                        <h4>Dados identificados</h4>
                        <div class="siap-pei-info-grid">
                            <strong>Turma:</strong><span id="siap-pei-info-turma">-</span>
                            <strong>Bimestre:</strong><span id="siap-pei-info-bimestre">-</span>
                            <strong>Disciplina:</strong><span id="siap-pei-info-disciplina">-</span>
                            <strong>Denominação/Laudo:</strong><span id="siap-pei-info-deficiencia">-</span>
                        </div>
                    </div>

                    <div class="siap-pei-card">
                        <h4>Comando para IA (opcional)</h4>
                        <div class="siap-pei-help">Digite instruções adicionais para orientar a geração do PEI.</div>
                        <textarea id="siap-pei-comando" maxlength="1000" placeholder="Exemplo: use linguagem simples, foque em estratégias práticas, considere atividades de leitura e produção textual..."></textarea>
                        <div class="siap-pei-counter"><span id="siap-pei-count">0</span>/1000</div>
                    </div>

                    <div class="siap-pei-privacy">
                        <strong>Observação:</strong> para manter a privacidade do estudante, o nome dele não é enviado para a API. A IA recebe apenas os dados pedagógicos necessários para gerar o PEI.
                    </div>

                    <button type="button" id="siap-pei-generate">✨ Gerar PEI com IA</button>
                </div>
            `;

            const minibar = document.createElement('div');
            minibar.id = 'siap-pei-minibar';
            minibar.innerHTML = `<button type="button" id="siap-pei-open">✨ PEI com IA</button>`;

            const toast = document.createElement('div');
            toast.id = 'siap-pei-toast';

            document.body.appendChild(panel);
            document.body.appendChild(minibar);
            document.body.appendChild(toast);

            panel.querySelector('.siap-pei-close').addEventListener('click', () => {
                panel.style.display = 'none';
                minibar.style.display = 'block';
            });

            document.getElementById('siap-pei-open').addEventListener('click', () => {
                panel.style.display = 'block';
                minibar.style.display = 'none';
            });

            document.getElementById('siap-pei-generate').addEventListener('click', onClick);

            const comando = document.getElementById('siap-pei-comando');
            const count = document.getElementById('siap-pei-count');
            comando.addEventListener('input', () => count.textContent = String(comando.value.length));
        },

        setInfo(payload) {
            const values = {
                'siap-pei-info-turma': payload.turma || '-',
                'siap-pei-info-bimestre': payload.bimestre || '-',
                'siap-pei-info-disciplina': payload.disciplina || '-',
                'siap-pei-info-deficiencia': payload.deficiencia || '-',
            };

            Object.entries(values).forEach(([id, value]) => {
                const el = document.getElementById(id);
                if (el) el.textContent = value;
            });
        },

        getComando() {
            const el = document.getElementById('siap-pei-comando');
            return el ? String(el.value || '').trim() : '';
        },

        setLoading(isLoading) {
            const btn = document.getElementById('siap-pei-generate');
            if (!btn) return;
            btn.disabled = !!isLoading;
            btn.innerHTML = isLoading ? '⏳ Gerando PEI...' : '✨ Gerar PEI com IA';
        },

        toast(message, type = 'success') {
            const toast = document.getElementById('siap-pei-toast');
            if (!toast) return alert(message);

            toast.className = type;
            toast.textContent = message;
            toast.style.display = 'block';

            clearTimeout(window.__siapPeiToastTimer);
            window.__siapPeiToastTimer = setTimeout(() => toast.style.display = 'none', 4500);
        }
    };

    console.log('[SIAP PEI] ui 3.2.11 carregada');
})();
