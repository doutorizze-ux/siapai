# Arquitetura de recuperação funcional — SiapAI

## Princípio

O **painel lateral nativo do Chrome** é a única interface visível da extensão. A página do SIAP não recebe caixas, botões, badges, estilos ou sobreposições da extensão. Os motores recuperados podem apenas ler campos nativos do SIAP e executar os preenchimentos que o professor solicitar no painel lateral.

## Camadas

| Camada | Responsabilidade | Proibido |
|---|---|---|
| `sidepanel.*` | Formulários, prévias, status, seleção de meses e comandos do professor | Consultar ou alterar o DOM do SIAP diretamente |
| `content.js` | Autenticação, leitura de contexto, carregamento dos motores e retransmissão de comandos | Criar interface visual na página do SIAP |
| `main_bridge.js` | Executar operações controladas no contexto da página, usando os motores já existentes | Criar painéis, botões ou estilos de interface |
| Módulos recuperados | Ler/escrever exclusivamente os campos nativos necessários para a automação solicitada | Construir os painéis antigos na página |

## Comandos planejados

| Módulo | Comandos no painel lateral | Motor preservado |
|---|---|---|
| Planejamento | gerar, editar prévia, aplicar próxima, aplicar todas, parar, reaproveitar | `planejamento/*`, com renderização antiga desativada |
| Frequência | selecionar meses, iniciar e parar | `frequencia/2.js`, com painel antigo desativado |
| Conteúdo | selecionar meses e materiais, iniciar e parar | `conteudo/conteudo.js`, com painel antigo desativado |
| PEI | gerar conteúdo orientado e preencher campos nativos | `pei/pei-api.js`, sem `pei-ui.js` |

## Regra de validação

Cada entrega deve comprovar que não existem chamadas que criem elementos de interface no SIAP para os módulos recuperados, como `appendChild(panel)`, `appendChild(style)`, `innerHTML` em contêineres criados pela extensão ou classes de painel antigo. A única inserção técnica permitida é o carregamento transitório da ponte de execução, que é removida após carregar e não possui interface visível.
