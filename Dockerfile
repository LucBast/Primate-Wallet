# Imagem do backend (@ff/api) para o Cloud Run.
#
# O contexto é a RAIZ do monorepo, não `apps/api`: o backend importa
# `@ff/domain`, `@ff/validation` e `@ff/api-contracts` como workspaces npm, e
# esses pacotes precisam ser compilados junto. Por isso o Dockerfile vive aqui.
#
# Duas etapas, por um motivo prático: a compilação precisa de TypeScript, de
# `node-pg-migrate` e de tudo que é devDependency; a imagem que vai para
# produção não pode carregar nada disso. A etapa `builder` compila, a etapa
# final instala só as dependências de runtime e recebe apenas os `dist/`.

# ---------------------------------------------------------------------------
# Etapa 1 — compilar
# ---------------------------------------------------------------------------
FROM node:22-alpine AS builder
WORKDIR /app

# Manifestos primeiro, código depois: enquanto as dependências não mudam, o
# Docker reaproveita a camada do `npm ci`, que é a parte cara.
#
# Os manifestos de TODOS os workspaces entram, inclusive o do app mobile. Não é
# desperdício: o npm lê a árvore inteira para resolver o package-lock, e um
# workspace declarado mas ausente derruba o `npm ci`. Só o manifesto entra — o
# React Native não é instalado, por causa dos filtros `--workspace` abaixo.
COPY package.json package-lock.json ./
COPY packages/api-contracts/package.json   packages/api-contracts/
COPY packages/domain/package.json          packages/domain/
COPY packages/validation/package.json      packages/validation/
COPY packages/test-fixtures/package.json   packages/test-fixtures/
COPY apps/api/package.json                 apps/api/
COPY apps/mobile/package.json              apps/mobile/

RUN npm ci --include-workspace-root \
      --workspace @ff/api \
      --workspace @ff/api-contracts \
      --workspace @ff/domain \
      --workspace @ff/validation \
      --workspace @ff/test-fixtures

COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps/api ./apps/api

# `tsc -b` segue as project references: compila os três pacotes e depois a API.
RUN npm run build --workspace @ff/api

# ---------------------------------------------------------------------------
# Etapa 2 — runtime
# ---------------------------------------------------------------------------
FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY packages/api-contracts/package.json   packages/api-contracts/
COPY packages/domain/package.json          packages/domain/
COPY packages/validation/package.json      packages/validation/
COPY packages/test-fixtures/package.json   packages/test-fixtures/
COPY apps/api/package.json                 apps/api/
COPY apps/mobile/package.json              apps/mobile/

# Sem devDependencies. `@ff/test-fixtures` fica de fora: é dependência de teste.
RUN npm ci --omit=dev --include-workspace-root \
      --workspace @ff/api \
      --workspace @ff/api-contracts \
      --workspace @ff/domain \
      --workspace @ff/validation \
  && npm cache clean --force

COPY --from=builder /app/packages/api-contracts/dist packages/api-contracts/dist
COPY --from=builder /app/packages/domain/dist        packages/domain/dist
COPY --from=builder /app/packages/validation/dist    packages/validation/dist
COPY --from=builder /app/apps/api/dist               apps/api/dist

# O Cloud Run injeta PORT=8080 e espera que o container escute nele. A API lê
# API_PORT (config/env.ts), então o valor é fixado aqui — e não no serviço, onde
# alguém poderia trocá-lo sem perceber que o Cloud Run não vai acompanhar.
ENV API_HOST=0.0.0.0
ENV API_PORT=8080
EXPOSE 8080

# Sem root. A imagem node:alpine já traz o usuário `node`.
USER node

# `dist/main.js` resolve a raiz do repositório subindo três níveis, e é dela que
# o dotenv tentaria ler um `.env`. Não existe nenhum na imagem, de propósito:
# em produção as variáveis vêm da configuração do Cloud Run.
CMD ["node", "apps/api/dist/main.js"]
