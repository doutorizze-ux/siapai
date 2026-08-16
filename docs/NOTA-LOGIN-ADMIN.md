# Nota — botão "Fazer login" da página /admin (16/08)

## Problema reportado
Usuário clica em "Fazer login" em https://siapai.online/admin e nada acontece (não redireciona para o login da Manus).

## Código atual (client/src/pages/Admin.tsx)
- `import { startLogin } from "@/const";`
- `<Button onClick={() => startLogin()}>Fazer login</Button>`
- O `startLogin` chama o helper de login OAuth da Manus (via OAUTH_SERVER_URL /api/oauth/login redirect).

## Diagnóstico provável
1. Em produção o botão roda `startLogin()` mas pode estar disparando erro silenciado (useAuth/startLogin depende de VITE_OAUTH_PORTAL_URL etc.).
2. Verificar console do navegador do usuário; alternativamente navegar diretamente para `https://siapai.online/api/oauth/login` (rota do template Manus OAuth).
3. Verificar se `useAdminAccess` ou algum wrapper bloqueia (ex.: `useAuth().login` vs `startLogin`).

## Correção aplicada (a verificar)
- Adicionar fallback: se `startLogin()` falhar/não redirecionar em ~2s, navegar para `/api/oauth/login`.
- Verificar client/src/const.ts implementação de startLogin.

## Estado geral
- /admin em produção retorna 200; painel renderiza (preço R$ 59,90, licenças listadas) — confirmado via screenshot no dev preview.
- Admin único: codex7864@gmail.com (role admin na tabela users).
- Licenças: 02376222117@siapai.com.br ativa (admin) e 00076078140@siapai.com.br ativa até 31/12/2026.
