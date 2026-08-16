# Diagnóstico 16/08 (sessão da tarde)

## Fatos confirmados
- IA em produção ATIVA: /api/ai/generate.php com token válido da Rozana gerou aula completa (Gemini via LLM_API_KEY do Coolify, chave AQ.Ab8RN6K1Pum1LxJsSJSfLfEV_IS-6RzuRJ7FQqR6ZZ6_sWlg, base https://generativelanguage.googleapis.com/v1beta/openai).
- Token inválido -> 401 token_invalido (comportamento correto).
- /api/ping-extensao -> HTML?? (curl retornou HTML da home para ping — pode ter sido redirecionado). Confirmar: rota POST /api/ping-extension.
- Usuário atualizou para v5.7.1 (rodapé mostra 5.7.1).

## Erros reportados pelo usuário em sequência
1. "Failed to fetch" (v5.7.0/5.7.1) — antes da chave Gemini.
2. "Could not establish connection. Receiving end does not exist." — service worker morto/desatualizado, instruí remoção completa + reinício do Chrome.
3. Após remover/reinstalar/reabrir Chrome: voltou "Failed to fetch" (mensagem antiga v5.7.0?? rodapé ainda mostra v5.7.1) — 10:50.

## Hipóteses restantes (a investigar)
- A v5.7.1 pode não ter a correção de mensagem no caminho do PLANNING_PREPARE: o generatePlan faz engine('PLANNING_PREPARE') que exige aba https://siap.educacao.go.gov.br/ — mas o SIAP do usuário é siap.educacao.go.gov.br/PlanejamentoProfessor/... — VERIFICAR se a URL do usuário bate com o prefixo (aba anterior mostrava siap.educacao.go.gov.br — ok).
- O erro "Failed to fetch" com a nova v5.7.1 pode vir do background.js doFetch: se a resposta do servidor for HTML (por ex. 500 com página HTML), JSON.parse lança "Resposta inválida do servidor" — NÃO é o caso do Failed to fetch bruto.
- "Failed to fetch" bruto só acontece quando fetch não retorna (CORS, DNS, rede). A extensão faz tudo via service worker — service worker não sofre CSP da página. Possível causa: rede do usuário bloqueando siapai.online no service worker OU CORS faltando para preflight.
- IMPORTANTE: checar headers CORS de siapai.online para OPTIONS/POST (preflight do fetch com Authorization exige CORS). Verificar Access-Control-Allow-Origin em produção.
- Outro candidato: /ai/generate.php demora > 120s com 10 aulas + conteúdo longo -> AbortError -> nossa mensagem "demorou mais que o limite" deveria aparecer, não "Failed to fetch". O print com 10 aulas mostrou "Failed to fetch" — então não é timeout.

## Próximo passo
- Testar CORS em produção: curl -X OPTIONS com headers Authorization + Content-Type.
- Verificar se o usuário pode alcançar https://siapai.online do navegador dele (ping/diagnostico no navegador real via browser tool My Browser).
- Se CORS OK e rede OK, investigar response do /ai/generate.php para payload REAL que a extensão envia (prompt longo pode causar 400/413 e o error handler do doFetch converte em erro legível — Failed to fetch não vem daqui).

## Contexto usuário
- Usuário: codex7864@gmail.com, admin do site. Licença teste: 02376222117@siapai.com.br (Rozana, até 31/12/2026).
- Testes dele: tela 2ª Série EM, Língua Portuguesa, turma 2A, aula 90, material REVISA/LETRUS/VEM ENEM.
- Ele já tem LLM_API_KEY no Coolify, Redeploy feito (site novo visível).

## Fluxo exato de generatePlan (sidepanel.js linha 288)
1. refreshLicense() -> /license/check.php (licença valida OK no print do usuário)
2. engine('PLANNING_PREPARE', options, 'planejamento', 30000) -> chrome.tabs.sendMessage pro content script
3. request '/ai/generate.php' -> background doFetch
4. engine('PLANNING_STORE', ...)

## Pontos-chave do diagnóstico
- background.js doFetch: erros de rede viram "Não foi possível conectar ao servidor https://siapai.online/api..." — NÃO viram "Failed to fetch" bruto.
- "Failed to fetch" bruto no output do usuário = rejeição do chrome.runtime.sendMessage (chrome.runtime.lastError.message === "Could not establish connection" ou similar) OU o error handler cai no `error.message` genérico... 
- ATENÇÃO: no print v5.7.1 do usuário apareceu "Failed to fetch" sem prefixo — mas background só gera "Failed to fetch" se `!err.status && (err.message inclui 'fetch'/'Failed'/'network')` -> mensagem = "Não foi possível conectar..." (não bate).
- Conclusão: "Failed to fetch" está vindo do chrome.runtime.sendMessage: chrome.runtime.lastError = {message: "Could not establish connection. Receiving end does not exist."}... não, esse também não bate.
- Hipótese forte: o background.js NO PACOTE v5.7.1 do usuário é o ANTIGO (sem tratamento de erro) — ZIP v5.7.1 foi feito com background.js modificado? VERIFICAR: o sed atualizou manifest + rodapé, mas a correção do background.js foi feita ANTES do empacotamento v5.7.1? Confirmar git: commit da correção do background.js vs commit do empacotamento.
- Alternativa: a aba do SIAP pode ter carregado content script antigo (caching). "Failed to fetch" literal pode vir de sidepanel.js request() quando sendMessage falha com lastError = "Could not establish connection"? Não.
- MELHOR CAMINHO: verificar no navegador real (My Browser conectado) o chrome://extensions / inspect do service worker e do content script da extensão instalada, e testar fetch do service worker diretamente via devtools.

## CORS em produção
- OPTIONS /api/ai/generate.php = 200 (sem headers Access-Control visíveis no grep, mas 200)
- POST 401 esperado. background.js NÃO usa credentials mode, envia Authorization -> preflight OK.

## 11:02 — NOVA DESCOBERTA (print do console do usuário, pronto para logar no SIAP)
- Console da página do SIAP mostra: `[Siap Saas] sessão encerrada manualmente. content.js:1603`
  - → SIAP ESTÁ DESLOGADO na sessão do usuário (a navegação para login.aspx encerrou a sessão)
- `Denying load of chrome-extension://dcimoccbaficodimlcoceifgekcgkmmch/...config.js` — extensão do usuário é a ID dcimoccb... (pasta Desktop\siapai2)
- `Failed to load resource: net::ERR_FAILED chrome-extension://invalid:1`
- Hipótese principal agora: "Failed to fetch" ocorre porque a cadeia de geração exige o SIAP logado; com sessão encerrada, content.js não consegue ler contexto e a mensagem de erro chega crua
- Próximo passo: usuário logar no SIAP (captcha kBmTHlv2) e retestar; se persistir, melhorar mensagens de erro para "Sessão do SIAP encerrada"

## 11:05 — CAUSA RAIZ CONFIRMADA (print KZcq3J do usuário, SIAP logado)
- URL real da página no SIAP do usuário: `PlanejamentoProfessor-toJulaEdicao.aspx` (com "toJula" minúsculo — variação não padrão da URL).
- Console mostra repetidamente: `Denying load of chrome-extension://dcimoccbaficodimlcoceifgekcgkmmch/.../planejamento/...` com mensagem "Resources must be listed in the web_accessible_resources manifest key in order to be loaded by pages outside the extension".
- `GET chrome-extension://invalid/ net::ERR_FAILED content.js:1406` → content.js está construindo um URL de recurso usando o nome da página ASPX como sufixo (ex.: `chrome-extension://.../planejamento/...toJulaEdicao.aspx.1`) — falha porque o recurso não está em web_accessible_resources.
- IMPORTANTE: o arquivo ASPX "PlanejamentoProfessor-toJulaEdicao.aspx" é do site do SIAP; o content.js o trata como nome de recurso da extensão (bug no mapeamento página→módulo).
- A cadeia quebra ANTES do fetch ao servidor → "Failed to fetch" no painel.
- Painel lateral mostra "Edição de aula aberta" com dados lidos corretamente (eixo, disciplina, ano base 2026, bimestre 3, semestre 2, replicação PRÓXIMA) → leitura de contexto funciona.
- Correção necessária: content.js deve (1) mapear páginas por padrão regex flexível aceitando variações de case/nome, (2) não usar o nome da página como parte de URL de recurso chrome-extension://, (3) ou manter recursos listados e carregados via message passing.
- Usuário logado como Rozana da Silva Queiroz Dias, Cepi Divino Pai Eterno, 2ª Série EM, Língua Portuguesa, turma 2A, aula 90.

## 11:10 — DESCOBERTA CRÍTICA (print KZcq3J, sessão SIAP ATIVA)

Fatos confirmados no console do usuário:
1. A página do SIAP do usuário é `https://siap.educacao.go.gov.br/PlanejamentoProfessor/PlanejamentoAulaEdicao.aspx` (URL padrão, NÃO a toJula — a referência "PlanejamentoProfessor-toJulaEdicao.aspx" no console é o arquivo ASPX do SIAP que ele tenta usar como contexto/sourceURL).
2. A sessão SIAP está ATIVA (painel mostra dados lidos corretamente, "Edição de aula aberta", licença ativa 31/12/2026).
3. Erros repetidos no console: `Denying load of chrome-extension://dcimoccbaficodimlcoceifgekcgkmmch/... Planejament-oProfessor-toJulaEdicao.aspx.1` com "Resources must be listed in the web_accessible_resources manifest key" + `GET chrome-extension://invalid/ net::ERR_FAILED content.js:1406`.
4. O conteúdo do `summary` no topo do painel está BRUTO/COM BUG: "ct00S-ct00Sph Funcionalidade$ph Campos$ddl Eixo: 95389449 - ct00S-ct00Sph Funcionalidade$ph Campos$ddl Bimestre: 3 - ct00S-ct00Sddl Ano Base: 2026 - ..." — os seletores de campos do SIAP estão pegando atributos errados (aria-label com IDs internos ct00S-).
5. `content.js:1612` loga "autenticação concluída sem injeção de interface na página" → carregamento local funciona, a "1 Issue" no console provavelmente é a violação unload (ruixitagent.js = antivírus/sistema da máquina, irrelevante).

Hipótese atual sobre a causa do "Failed to fetch":
- Os erros "Denying load" mostram que ALGO (provavelmente main_bridge.js injetado ou o próprio content.js) usa sourceURL/nome de arquivo derivado de `document.title` ou URL do SIAP (PlanejamentoProfessor-toJulaEdicao.aspx.1 → o ".1" é sufixo sequencial de sourceURL duplicado), e esse recurso não está em web_accessible_resources do manifest.
- O manifest v5.7.1 precisa listar `planejamento/*.js`, `frequencia/*.js`, `conteudo/*.js`, `pei/*.js` em `web_accessible_resources` + background.js/sidepanel.js.
- O `chrome-extension://invalid` é o fallback quando o script tenta getURL com caminho inválido (linha 1401-1405 do content.js é 1406 no build).

Ação de correção (v5.8.0):
1. manifest.json: adicionar web_accessible_resources amplo (todos os módulos).
2. content.js: sanitizar sourceName passado a injectScriptCode (não usar nome ASPX/URL da página diretamente; usar apenas o path do módulo).
3. Investigar main_bridge.js por uso de document.title ou location.href como nome de arquivo/contexto.
4. sidepanel.js: sanitizar labels de contexto (getSidePanelContext usa aria-label que no SIAP do usuário retorna "ct00S-..." — usar textContent dos labels associados ou fallback 'Sem título').
5. Manter tratamento de erro com mensagem clara ("Falha de rede com siapai.online" vs erro interno).

Estado do servidor (11:00): geração em produção OK com chave Gemini do usuário (testada via curl). Site OK. Admin login corrigido no repo (commit 9e79256) aguardando Redeploy do usuário.
Próximos: corrigir extensão → empacotar v5.8.0 → push GitHub → entregar + instrução de reinstalação.


## 11:15 — CONCLUSÃO DO DIAGNÓSTICO (causa raiz da pasta do usuário)

A pasta do usuário é `~\Desktop\siapai2` carregada como "Extensão descompactada".
O erro `Denying load of chrome-extension://dcimoccbaficodimlcoceifgekcgkmmch/.../PlanejamentoProfessor-toJulaEdicao.aspx.1` + `content.js:1406 GET chrome-extension://invalid/ net::ERR_FAILED` indica que o content.js rodando é de VERSÃO ANTIGA/ESTRANGEIRA à v5.7.1 oficial:

- Na v5.7.1 oficial de /home/ubuntu/siapai-repo/extensao, content.js tem getLocalModulePaths com paths fixos (`planejamento/salvar.js` etc.) e `injectScriptCode(trimmed, url)` com url = chrome.runtime.getURL(path) → nunca gera ".aspx.1"
- O padrão "nome-da-pagina.aspx.1" é o `sourceName` sequencial de carregamento de módulos da EXTENSÃO ORIGINAL do fornecedor (PlanejaPRO 3.2.40) ou de uma versão intermediária
- Ou seja: a pasta Desktop\siapai2 é uma MESCLA: rodapé atualizado (v5.7.1 do sidepanel.html) mas content.js e/ou main_bridge.js antigos do fornecedor

AÇÃO DE CORREÇÃO DEFINITIVA:
1. Corrigir content.js oficial: sanitizar nome de página (tolerar qualquer variação ASPX) e garantir sourceName de injectScriptCode usa SOMENTE o path do módulo, nunca document.title/location
2. Adicionar todos os módulos em web_accessible_resources no manifest
3. Sanitizar contexto no sidepanel (aria-label "ct00S-..." → fallback legível)
4. Empacotar v5.8.0 e instruir: APAGAR pasta siapai2, extrair ZIP NOVO, carregar de novo


## 11:19 — Print R5PkSt: "Recurso local inválido (planejamento/config.js). Reinstale a extensão para garantir os arquivos corretos."

### Análise do print
- URL: `PlanejamentoProfessor/PlanejamentoAulaEdicao.aspx` — rota reconhecida OK, painel v5.8.0 aberto, licença ativa 31/12/2026 OK
- Erro: exatamente a mensagem do CHECK que EU adicionei na v5.8.0: `chrome.runtime.getURL(path)` retornou URL que não começa com `https://`
- BUG MEU: recursos de extensão SEMPRE retornam `chrome-extension://<id>/<path>` em getURL — meu check `^https://` é FALSO para TODOS os módulos → a validação que criei para proteger está BLOQUEANDO o carregamento normal
- Verificado: ZIP v5.8.0 contém planejamento/config.js corretamente (41 arquivos íntegros)

### Correção (v5.8.1)
- content.js loadLocalExtensionModules: aceitar URL `chrome-extension://` válida (não vazia, sem `/invalid`) em vez de exigir https://
- Bump manifest + sidepanel.html para 5.8.1, rezipar, push, entregar


## 16/08 11:27 — Print 630dzq: GERAÇÃO COMPLETOU, falha na APLICAÇÃO do conteúdo personalizado

Estado confirmado pelo print: v5.8.1 rodando; "Gerando 10 aula(s)..." concluiu ("10 aula(s) gerada(s)"); prévia com aulas completas (habilidades, metodologia, avaliação OK). O botao mudou para "Preparando..." / "Aplicando...".

Alerta do SIAP: "Erro no processamento automático: Conteúdo personalizado aguardando: nenhum conteúdo padrão foi confirmado no SIAP."

Interpretação: o módulo salvar.js/aplicar procurou um "conteúdo padrão confirmado" na página (checkbox/estado de algum conteúdo nativo) antes de escrever no campo de conteúdo personalizado, e não achou. Provável causa: seletor do campo de conteúdo do SIAP do usuário difere (ou o fluxo exige clicar/confirmar o conteúdo nativo primeiro). Também pode ser o módulo aguardando o evento "conteúdo confirmado" do bootstrap da página original.

Próximo: localizar a string "Conteúdo personalizado aguardando" / "conteúdo padrão foi confirmado" no código do módulo salvar.js/executor.js para entender a condição e torná-la tolerante.


## 16/08 11:30 — Print Br3nTq: campo "Objetivos de Conhecimentos/Conteúdos" ficou vazio na aplicação

Observação da esposa do usuário: tudo aplicado (Habilidades com X, Matriz SAEB D1, Metodologia, Avaliação, Unidade Temática), MAS o painel "Objetivos de Conhecimentos/ Conteúdos" (árvore à direita) está VAZIO.

Diagnóstico: no fluxo fillPlanOnPage, o executor adiciona habilidades via addHabilidadeByText, depois conteúdos via CT.addConteudoByText (que clica nos nós da árvore). O print mostra os conteúdos marcados na área central ("Conteúdos" — preenchido), mas a ÁRVORE de "Objetivos de Conhecimentos/ Conteúdos" em si não recebeu nada.

Interpretação correta: no SIAP, a árvore "Objetivos de Conhecimentos/ Conteúdos" é o mesmo componente que as habilidades? NÃO — habilidades são do painel "Habilidades"; o painel "Objetivos de Conhecimentos/ Conteúdos" é alimentado pelos CT.addConteudoByText (itens clicados viram caixinha na área central). No print do usuário o painel "Conteúdos" APARECE preenchido (X vermelho), então os conteúdos foram adicionados — mas o texto da prévia mostra "Conteúdos: —" em várias aulas (conteudo array VAZIO no retorno da API para essas aulas).

Conclusão mais provável: a IA retornou `conteudos: []` vazio para várias aulas (o print mostra "Conteúdos: —" na prévia), então nada foi clicado na árvore. Isso é comportamento da GERAÇÃO, não da aplicação. O campo do SIAP está vazio porque a IA não produziu conteúdos.

Ação v5.8.3: ajustar o PROMPT/validação no api.js para exigir conteudos não-vazios (ou fallback: usar títulos/habilidades como conteúdo), e validarAndFixPlan deve preencher conteudos mínimos se vazio.



## 16/08 11:35 — Diagnóstico técnico do conteúdo vazio (print Br3nTq)

A prévia do painel mostra "Conteúdos: —" em várias aulas. A árvore "Objetivos de Conhecimentos/ Conteúdos" do SIAP fica vazia porque o `aula.conteudos` voltou VAZIO da geração.

Fluxo do validateAndFixPlan (api.js ~1602-1706):
1. Se `resolution.conteudos` (conteúdos do catálogo resolvidos via bootstrap) existe → garante 1 conteúdo por aula via rotação: `aula.conteudos = [conteudoObrigatorio]`
2. Senão, se `todosConteudosValidos` (conteudosDisponiveis da árvore) existe → corrige os conteúdos retornados pela IA contra a lista válida
3. MAS: se o catálogo NÃO retornou `instructionResolution.conteudos` E a árvore retornou conteudosDisponiveis vazios OU a IA retornou `conteudos: []` vazio → `aula.conteudos` fica `[]` (caso do print)

No caso do usuário: Língua Portuguesa EM, material REVISA — a árvore do SIAP provavelmente tem poucos/nenhum "conteúdo" no catálogo, então o catálogo não resolveu conteudosExatos e a árvore tinha itens mas a IA retornou array vazio que não passou pela correção (o loop roda sobre aula.conteudos || [] = vazio → nada a corrigir → continua vazio).

Correção planejada (v5.8.3): em validateAndFixPlan, quando aula.conteudos estiver vazio no final E todosConteudosValidos.length > 0, rotacionar um conteúdo da árvore igual ao padrão usado para habilidades: `aula.conteudos = [todosConteudosValidos[aulaIndex % todosConteudosValidos.length]]`. Isso garante que TODO conteúdo tenha ao menos 1 item clicável da árvore, como o original garantia para habilidades.

Notas: callOpenAI usa sistema "Você responde apenas JSON válido..." e buildPrompt envia seções da árvore (habilidades/conteúdos disponíveis). A matriz SAEB já tem fallback análogo (`if (!matrizCorrigida.length && matrizValidos.length) matrizCorrigida = [matrizValidos[0]]`). Falta o mesmo para conteudos.


## 16/08 14:45 — Bug v7: /admin em produção mostra "Acesso restrito" sem tela de login

Usuário: acessa https://siapai.online/admin → vê "Acesso restrito" + botão "Fazer login", mas o botão NÃO direciona.

Diagnóstico: o Admin.tsx mostra "Acesso restrito" quando !isAuthenticated (papel admin ausente/not logged). O botão "Fazer login" chama startLogin() de client/src/const.ts. O fix do login (checkpoint 92564439) usa valores padrão manus.im quando VITE_OAUTH_PORTAL_URL/VITE_APP_ID estão vazios no build do Coolify. Suspeita: produção rodando build ANTIGO (sem o fix) — precisa de Redeploy no Coolify. Verificar commit mais recente do repo e o guia de deploy; o deploy do usuário vem via GitHub (doutorizze-ux/siapai).

Arquivos-chave: client/src/pages/Admin.tsx (tela restrita), client/src/const.ts (startLogin), guia docs/GUIA-COOLIFY.md (deploy).

Extensão atual: v5.8.4 zipada e push d179ba4. Fluxo planejamento validado pelo usuário. Próximos testes do usuário: Frequência, Conteúdo, PEI.


## 16/08 14:55 — Bug v7 RESOLVIDO: login local do administrador implementado

Implementação completa (deploy externo sem OAuth Manus):
- server/_core/localAdmin.ts: verificação ADMIN_EMAIL + ADMIN_PASSWORD (texto plano ou bcrypt $2) via env; emite JWT HS256 com JWT_SECRET compatível com o cookie do template (openId=local_admin_<email>, appId="local", name, exp 1 ano). Cookie = app_session_id (mesmo do OAuth), então adminProcedure/ctx.user continuam iguais.
- server/routers.ts: auth.localLogin (publicProcedure, zod) → upsertUser role=admin/loginMethod=local → res.cookie(COOKIE_NAME, token, 365d) → {ok, user}.
- client/src/pages/Admin.tsx: LocalAdminForm (e-mail + senha, useMutation + mutateAsync) exibido na tela "Acesso restrito" + botão Manus como fallback.
- server/localAdmin.test.ts: 6 testes vitest PASSANDO (JWT compatível, bcrypt, plano, openId, cookie nome padrão).
- tsc OK. Dev preview: /admin renderiza painel completo com sessão dev (preço R$59,90 produção, licenças OK).

Para produção (Coolify): usuário deve adicionar envs ADMIN_EMAIL e ADMIN_PASSWORD (ex.: admin@siapai.online + senha forte) e fazer Redeploy.
Falta: checkpoint, push GitHub (siapai-repo), instruções ao usuário.
