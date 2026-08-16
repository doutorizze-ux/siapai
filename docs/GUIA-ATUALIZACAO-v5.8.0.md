# Guia de atualização — SiapAI v5.8.0

Este guia resolve o erro **"Failed to fetch"** e os avisos `chrome-extension://invalid` / `.aspx.1` que apareceram no console do seu Chrome.

## Por que isso aconteceu

A pasta que estava no seu Desktop (`siapai2`) era uma mistura de arquivos: o rodapé do painel estava novo (v5.7.1), mas os scripts internos ainda eram da extensão antiga, que tentava carregar módulos usando o nome da página do SIAP como endereço — o que o Chrome bloqueia. Com a v5.8.0 isso foi corrigido por dentro e não pode mais acontecer.

## Instalação (fazer na ordem)

1. **Remover a antiga:**
   - Abra `chrome://extensions`
   - Encontre a extensão **SiapAI** carregada da pasta `siapai2` e clique em **Remover**
   - **APAGUE a pasta `siapai2` do seu Desktop** (não adianta só atualizar — os arquivos precisam ser trocados)
2. **Instalar a nova:**
   - Baixe o `siapai-extension-v5.8.0.zip`
   - Descompacte em uma pasta nova, por exemplo `C:\Users\SeuUsuario\Desktop\siapai-v580`
   - Em `chrome://extensions`, ative o **Modo do desenvolvedor** (canto superior direito)
   - Clique em **Carregar sem compactação** e selecione a pasta `siapai-v580`
   - O rodapé do painel deve mostrar **v5.8.0**
3. **Fechar e reabrir o Chrome** (importante: o navegador precisa registrar os novos recursos)
4. **Testar:** abra o SIAP, entre na edição de uma aula, abra o painel lateral do SiapAI (ícone da extensão), valide o e-mail da licença (02376222117@siapai.com.br) e clique em **Gerar planejamentos**

## Conferir

- Painel mostra "Edição de aula aberta" com os dados da turma (sem códigos estranhos `ct00S-`)
- Geração conclui sem "Failed to fetch"
- NENHUM aviso `chrome-extension://invalid` no console

## Sobre o site (Coolify)

Como o seu Coolify está ligado ao GitHub, o site pode puxar o código novo sozinho — mas se quiser garantir a versão mais recente, faça um **Redeploy** da aplicação `weary-walrus` no painel do Coolify. O login do admin (`/admin`) e a IA já foram testados em produção e estão funcionando.
