# syntax=docker/dockerfile:1.7

# --- builder: install deps (incl. better-sqlite3 native binding) + compile TS ---
FROM node:22-slim AS builder
WORKDIR /app

# better-sqlite3 ships prebuilt binaries for linux-x64, but keep a toolchain
# available so the build still succeeds if the prebuild is ever missing for the
# running ABI rather than failing the whole image.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# Lockfile-only layer so dependency installs cache across source changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json ./
COPY src ./src
RUN pnpm build

# Drop dev dependencies; compiled native bindings in node_modules are preserved.
RUN pnpm prune --prod

# --- runtime: compiled output + production deps only ---
FROM node:22-slim AS runtime
WORKDIR /app

# Enables the production auth guard: index.ts refuses to serve HTTP without
# MCP_AUTH_TOKEN when NODE_ENV=production.
ENV NODE_ENV=production \
    PORT=4114 \
    SEO_DB_PATH=/app/data/seo.db

COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./

# The archive (rank history, index cache) lives here and must be a mounted
# volume — it is the one thing in this container that cannot be rebuilt, since
# Search Console's window rolls and deletes.
RUN mkdir -p /app/data && chown -R node:node /app/data
VOLUME ["/app/data"]

USER node
EXPOSE 4114

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4114)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js", "serve"]
