# Instalação controlada — SiapAI v5.6.0

Esta versão substitui a interface inserida dentro do SIAP por um **painel lateral nativo do Chrome**. Assim, a tela do SIAP não deve receber menus, barras, cartões ou botões adicionais.

## Substituição única da extensão

1. Feche as páginas abertas do SIAP.
2. Abra `chrome://extensions` e remova a extensão SiapAI instalada anteriormente. Não use somente **Atualizar**, pois a arquitetura mudou de popup para painel lateral.
3. Extraia o arquivo `siapai-extension-v5.6.0.zip` em uma pasta nova.
4. Com o **Modo do desenvolvedor** ativo, escolha **Carregar sem compactação** e selecione a pasta extraída.
5. Confirme que a versão exibida no cartão da extensão é **5.6.0**.

## Teste controlado

1. Abra novamente a tela de turma do SIAP.
2. Confirme primeiro que a página está visualmente igual ao SIAP normal; o SiapAI não deve criar nenhum painel dentro dela.
3. Clique no ícone do SiapAI na barra do Chrome. O Chrome abrirá um painel lateral próprio, fora da página.
4. Confira o status de licença e a mensagem **Turma de planejamento aberta**.
5. Escolha **Planejamento**, informe uma orientação e clique em **Gerar sugestões**.

> Não use a extensão se a página do SIAP receber qualquer alteração visual. Nesse caso, feche a extensão e reporte somente um print da página e da seção **Erros** em `chrome://extensions`.
