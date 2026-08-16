# Guia de deploy do SiapAI no Coolify

Este guia explica como conectar o projeto **SiapAI** (código completo com backend, site e extensão) ao seu servidor **Coolify** para obter um endereço fixo. O repositório GitHub que você vai conectar contém o código pronto, com Dockerfile incluído.

## Visão geral do deploy

O deploy usa **Docker Compose** no Coolify com dois serviços: o banco MySQL e o aplicativo Node.js. O Coolify gerencia o build da imagem a partir do Dockerfile do repositório e injeta as variáveis de ambiente que você configurar.

| Item | Valor |
|---|---|
| Repositório | `https://github.com/<seu-usuario>/siapai` (privado) |
| Build | Dockerfile (na raiz do repositório) |
| Porta do app | 3000 |
| Banco | MySQL 8 no próprio Coolify |

## Passo a passo no Coolify

### 1. Conectar o GitHub

No Coolify: **Settings → Security → GitHub → New GitHub App** (ou use o botão **Authorize**). Depois, ao criar o recurso, escolha **GitHub App** como fonte e selecione o repositório `siapai`.

### 2. Criar o recurso como Docker Compose

1. Escolha o **Project** e o **Environment** desejados e clique em **New Resource → Docker Compose Empty**.
2. No editor do `docker-compose.yml`, cole o arquivo `docker-compose.coolify.yml` que acompanha este guia (você o encontrará também na raiz do repositório como referência).
3. Na aba **Environment Variables**, confirme as variáveis listadas abaixo.
4. Clique em **Deploy**.

### 3. Variáveis de ambiente necessárias

| Variável | Valor | Obrigatória? |
|---|---|---|
| `DATABASE_URL` | `mysql://siapai:SENHA_FORTE_AQUI@mysql:3306/siapai_db` (mesma senha do compose) | Sim |
| `JWT_SECRET` | Qualquer texto longo aleatório (gera com: `openssl rand -hex 32`) | Sim |
| `SIAPAI_JWT_SECRET_FIXED` | **O MESMO valor de JWT_SECRET** (mantém as sessões da extensão estáveis) | Sim |
| `NODE_ENV` | `production` | Sim |
| `PORT` | `3000` | Sim |
| `ASAAS_API_URL` | `https://sandbox.asaas.com/api/v3` (mude para produção depois) | Recomendada |
| `ASAAS_API_KEY` | Token do Asaas (sandbox por enquanto) | Recomendada |
| `LLM_API_KEY` | Chave de API de IA externa (ver seção abaixo) | Somente para IA |
| `LLM_API_BASE` | Base da API (ex.: `https://generativelanguage.googleapis.com/v1beta/openai` para Gemini) | Somente para IA |

> **Nota sobre a geração de IA:** o servidor foi atualizado para aceitar chaves de IA externas (qualquer API compatível com OpenAI: Google Gemini, OpenRouter, Groq, OpenAI). Se `LLM_API_KEY` não estiver configurada, login, licença, extensão, checkout e webhook continuam funcionando normalmente; apenas o botão "Gerar" da IA retornará erro como `OPENAI_API_KEY is not configured`.

### Erro conhecido e correção

Se a extensão mostrar erro ao gerar planejamento em produção, a causa mais comum é a ausência de `LLM_API_KEY`/`LLM_API_BASE` no Coolify. Siga a seção "Como ativar a IA com chave gratuita" abaixo e clique em **Redeploy**.

### Como ativar a IA com chave gratuita (Google Gemini)

1. Acesse https://aistudio.google.com/apikey e faça login com sua conta Google.
2. Clique em **Create API Key**, aceite os termos e copie a chave gerada (começa com `AIza...`).
3. No plano gratuito, o Gemini permite 15 requisições por minuto e 1.500 por dia — suficiente para uso pessoal do SiapAI.
4. No Coolify, abra o serviço do app → aba **Environment Variables** e adicione:

```
LLM_API_KEY=AIza...  (sua chave copiada)
LLM_API_BASE=https://generativelanguage.googleapis.com/v1beta/openai
```

5. Clique em **Redeploy**.

Alternativa gratuita: a [OpenRouter](https://openrouter.ai/keys) oferece modelos gratuitos (ex.: `google/gemini-flash-1.5-free`, `openai/gpt-4o-mini`) — use `LLM_API_KEY=<chave_openrouter>` e `LLM_API_BASE=https://openrouter.ai/api/v1`.

### 4. Inicializar o banco

Após o MySQL subir, execute o script `db-init.sql` (na raiz do repositório, dentro da pasta `db/`) no container do MySQL — por exemplo, pelo painel do Coolify no serviço MySQL → **Execute Command**:

```
mysql -u root -p$MYSQL_ROOT_PASSWORD siapai_db < /tmp/db-init.sql
```

(Opcional: copie o conteúdo do arquivo pelo terminal SSH do servidor.)

Isso cria as tabelas `licenses` e `product_settings` e a licença de teste da Rozana.

### 5. Verificar

Com o deploy concluído, acesse `http://SEU_IP:PORTA/api/ping-extensao` (o Coolify mostra o endpoint). Deve responder:

```
{"ok":true,"timestamp":...}
```

Depois me informe o endereço (ex.: `http://82.29.62.95:PORTA`) para eu configurar a extensão apontando para ele.

## Após o deploy

Assim que o endereço fixo estiver no ar, eu atualizo a extensão SiapAI (arquivos `content.js`, `popup.js` e `manifest.json`) para o seu servidor e te entrego o ZIP final. O site, o checkout Pix, o admin de licenças e os módulos da extensão (Planejamento com IA, Frequência, Conteúdo, PEI) funcionam nesse endereço.
