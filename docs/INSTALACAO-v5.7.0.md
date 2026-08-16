# Instalação controlada — SiapAI v5.7.0

Esta versão usa o **painel lateral nativo do Chrome**. Nenhum menu, cartão, cabeçalho ou botão do SiapAI deve aparecer dentro da página do SIAP.

## Substituição única da extensão

1. Feche todas as páginas do SIAP.
2. Abra `chrome://extensions` e remova a instalação anterior do SiapAI. A remoção evita que duas versões operem na mesma página.
3. Extraia `siapai-extension-v5.7.0.zip` em uma pasta nova.
4. Ative o **Modo do desenvolvedor**, clique em **Carregar sem compactação** e selecione a pasta extraída chamada `extensao`.
5. Confirme que o cartão da extensão informa a versão **5.7.0** e que não há erros exibidos.

## Teste controlado de segurança visual

1. Abra a edição de uma aula no SIAP e aguarde a página terminar de carregar.
2. Verifique que a página continua visualmente igual ao SIAP normal. Não deve haver painel, botão, selo, barra ou sobreposição do SiapAI dentro dela.
3. Clique no ícone do SiapAI na barra do Chrome. O Chrome deve abrir um painel lateral fora da página do SIAP.
4. Confirme no painel lateral que a licença está ativa e que o status identifica a tela aberta.

## Teste dos módulos

| Módulo | Tela necessária no SIAP | Teste inicial seguro |
|---|---|---|
| Planejamento | Edição de aula | Gere **1 aula**, confira a prévia e somente então use **Aplicar próxima aula**. |
| Frequência | Frequência | Marque apenas **um mês** e teste o comando de iniciar. |
| Conteúdo programático | Aba Conteúdos | Marque apenas **um mês**, mantenha a aba Conteúdos ativa e inicie. |
| PEI | Tela de PEI | Gere o texto e revise os campos preenchidos antes de salvar no SIAP. |

> Durante o teste, mantenha apenas uma aba do SIAP aberta para o módulo que estiver utilizando. Caso apareça qualquer elemento visual do SiapAI dentro da página do SIAP, pare o teste, não salve a página e envie uma captura junto da seção **Erros** exibida em `chrome://extensions`.
