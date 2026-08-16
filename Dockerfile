# SiapAI — imagem para deploy no Coolify
# Base: Node 22 (Debian 12). O app é um fullstack React + Express + tRPC.
FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Instalar pnpm via corepack (versão pinada no package.json)
RUN npm install -g corepack@latest && corepack enable

COPY package.json pnpm-lock.yaml ./
COPY patches ./patches
RUN corepack pnpm install

COPY . .

# Build completo: vite (frontend em dist/public) + esbuild (server em dist/index.js)
RUN corepack pnpm run build

ENV NODE_ENV=production

# O app escuta em process.env.PORT (padrão 3000)
EXPOSE 3000

CMD ["node", "dist/index.js"]
