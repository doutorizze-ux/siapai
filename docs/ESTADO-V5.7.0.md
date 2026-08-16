# Estado da extensão SiapAI v5.7.0 (16/08)

## O que está pronto
- Painel lateral nativo do Chrome com 4 módulos completos recuperados da extensão de referência (planeja-pro-siap-3.2.40):
  - **Planejamento com IA**: quantidade de aulas (1–10), texto livre, upload de arquivo de apoio (até 500 KB), opções "conteúdo personalizado no texto livre" e "replicar para outra turma", botões Gerar / Aplicar próxima aula / Aplicar todas / Parar, prévia dos planejamentos e reaproveitamento de lotes salvos (`PLANNING_LOAD_SAVED`).
  - **Frequência**: grid de 12 meses (Todos/Limpar), iniciar/parar (`FREQUENCY_CONFIGURE`/`START`/`STOP`), respeita estados do motor original (siap_freq_v51_*).
  - **Conteúdo programático**: meses, leitura nativa dos materiais da página (`CONTENT_MATERIAL_OPTIONS` no grid #cphFuncionalidade_cphCampos_GrdMaterialApoio), aula dupla, texto livre "Outros" (tm_executor_conteudo_other_material_text_v13), iniciar/parar.
  - **PEI com IA**: coleta payload nativo (`PEI_COLLECT`), gera via /api/pei_generate.php e preenche campos nativos (`PEI_FILL`).
- Autenticação fora do SIAP: formulário de e-mail fica no painel lateral (`SIAP_AUTH_CONTEXT`/`SIAP_AUTH_APPLY`); `ensureLogin` não mostra mais overlay na página do SIAP (retorna needsLogin).
- UI antigas bloqueadas no modo lateral: `ui.js`, `frequencia/2.js`, `conteudo/conteudo.js` retornam cedo quando `window.__SIAP_SAAS_HEADLESS__` está definido.
- Manifest: web_accessible_resources (main_bridge.js, pei/pei-api.js), versão 5.7.0, side_panel default_path sidepanel.html.
- Testes passando: `tests/extension-sidepanel.test.mjs` (contrato v5.7.0, sem injeção no SIAP) e `tests/main-bridge-headless.test.mjs` (simulação headless dos 4 motores).

## Bug 16/08 "Failed to fetch" (v5.7.1)
- CAUSA RAIZ CONFIRMADA: geração /api/ai/generate.php em produção retorna 401/erro `OPENAI_API_KEY is not configured` — o Coolify NÃO tem LLM_API_KEY/LLM_API_BASE definidos. /api/auth/validate-email e /api/ping-extensao OK.
- Correção na extensão (background.js): erros AbortError e network agora viram mensagens legíveis em pt-BR (v5.7.1).
- v5.7.1: manifest/sidepanel rodapé 5.7.1, testes OK, ZIP em /home/ubuntu/siapai-extension-v5.7.1.zip (42 arquivos).
- PENDENTE: (1) usuário cria chave Gemini grátis em https://aistudio.google.com/apikey e adiciona no Coolify: LLM_API_KEY=AIza... + LLM_API_BASE=https://generativelanguage.googleapis.com/v1beta/openai, depois Redeploy; (2) push da v5.7.1 ao GitHub; (3) entregar ZIP v5.7.1 ao usuário com teste de 1 aula; (4) webhook Asaas ainda não cadastrado pelo usuário (https://siapai.online/api/webhook/asaas, evento PAYMENT_RECEIVED).

## Pendências antes da entrega
1. Empacotar `/home/ubuntu/siapai-extension-v5.7.0.zip` (zip -qr da pasta extensao).
2. Push para GitHub (doutorizze-ux/siapai, branch main) — usuário faz Redeploy no Coolify se desejado.
3. Entregar ZIP + `docs/INSTALACAO-v5.7.0.md` ao usuário com instruções de teste controlado.
4. Usuário confirma no SIAP real: página intacta + cada automação responde na tela correta.

## Backend/produção
- Produção: https://siapai.online (Coolify, MySQL, dbInit no boot). Imagens no CDN público. Checkout Asaas produção OK. Webhook /api/webhook/asaas pronto; usuário ainda precisa cadastrar no painel Asaas (evento PAYMENT_RECEIVED).
- Licença de teste: 02376222117@siapai.com.br (Rozana, ativa até 31/12/2026).

## Instalação controlada (resumo para o usuário)
1. Fechar SIAP, remover extensão antiga em chrome://extensions (não usar só Atualizar).
2. Extrair ZIP, carregar sem compactação com Modo do desenvolvedor; confirmar versão 5.7.0.
3. Abrir SIAP: página deve ficar idêntica ao normal, nada do SiapAI injetado.
4. Clicar no ícone da extensão → painel lateral: validar e-mail da licença, depois testar módulos (1 aula / 1 mês por teste).
