# syntax=docker/dockerfile:1.7

# --- builder: install deps + compile TypeScript ---
# No native toolchain needed: the store uses `pg`, which is pure JavaScript.
FROM node:22-slim AS builder
WORKDIR /app

# pnpm 11 to match CI and the repo's pnpm-workspace.yaml, which is where the
# security `overrides` (brace-expansion CVE pins) live. pnpm 9 ignores that
# file's overrides and silently drops the pins from the lockfile.
RUN corepack enable && corepack prepare pnpm@11.21.0 --activate

# Lockfile-only layer so dependency installs cache across source changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json ./
COPY src ./src
# scripts/ holds copy-static.mjs, which the build script invokes to place the
# UI's HTML/CSS/JS into dist/ (tsc only emits JavaScript).
COPY scripts ./scripts
RUN pnpm build

RUN pnpm prune --prod

# --- runtime: compiled output + production deps only ---
FROM node:22-slim AS runtime
WORKDIR /app

# NODE_ENV=production enables the auth guard: index.ts refuses to serve HTTP
# without MCP_AUTH_TOKEN, rather than silently publishing an open endpoint.
ENV NODE_ENV=production \
    PORT=4114

COPY --from=builder --chown=node:node /app/node_modules ./node_modules
# dist/ includes web/public, the browser-side bundle copied in by the build.
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./

USER node
EXPOSE 4114

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4114)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js", "serve"]
