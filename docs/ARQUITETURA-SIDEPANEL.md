# Arquitetura segura dos módulos SiapAI

## Problema isolado

A extensão anterior carregava scripts que criavam elementos dentro da tela `PlanejamentoProfessorTurmaEdicao.aspx`. Essa página pertence ao SIAP e sua estrutura não é estável para injeções visuais. A consequência relatada foi interferência no painel original do sistema.

## Decisão

> A interface dos módulos será exibida no painel lateral nativo do Chrome, e não dentro do DOM do SIAP.

O `content.js` continuará apenas com duas responsabilidades: manter a autenticação/licença e ler, sob demanda, o contexto visível da página. Não poderá criar menus, cartões, botões, barras ou sobreposições na tela do SIAP. O `background.js` continuará como proxy das chamadas ao servidor, protegido contra a política CSP da página.

| Camada | Responsabilidade | Não faz |
|---|---|---|
| Painel lateral Chrome | Exibir Planejamento, Frequência, Conteúdo e PEI; solicitar ações do usuário | Alterar a estrutura visual do SIAP |
| Service worker | Chamar a API SiapAI e abrir/gerenciar o painel | Inserir componentes no SIAP |
| Content script | Ler contexto e executar apenas ações automáticas explicitamente pedidas | Criar painéis ou badges na página |
| Página SIAP | Fonte de contexto e destino das ações | Hospedar a interface SiapAI |

## Primeiro recorte funcional

O painel lateral precisa reconhecer a página de turma, apresentar os quatro módulos e permitir gerar sugestões de planejamento usando a API já existente. Frequência, Conteúdo e PEI devem abrir/operar apenas nas respectivas páginas do SIAP, sem interfaces sobrepostas. A aplicação automática nas páginas específicas continuará uma etapa separada e só será habilitada após validação controlada.
