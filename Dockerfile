# syntax=docker/dockerfile:1

# ---- Courtnotes ---------------------------------------------------------------------------
# Multi-stage build: compile the SvelteKit app, then ship only the server, its production
# dependencies and the CLI scripts in a small non-root image.
#
#   docker build -t courtnotes .
#   docker run -p 3000:3000 -e WATCHER_ACCESS_CODE=change-me courtnotes
# ---------------------------------------------------------------------------------------------

# Override to build from a registry mirror, e.g. mirror.gcr.io/library/node:22-bookworm-slim
ARG NODE_IMAGE=node:22-bookworm-slim

FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund

FROM deps AS build
COPY . .
ARG BUILD_NUMBER=docker
ARG COMMIT_SHA=unknown
ENV BUILD_NUMBER=${BUILD_NUMBER} COMMIT_SHA=${COMMIT_SHA}
RUN npx svelte-kit sync && npm run build && npm prune --omit=dev --ignore-scripts

FROM ${NODE_IMAGE} AS runtime
ARG BUILD_NUMBER=docker
ARG COMMIT_SHA=unknown
LABEL org.opencontainers.image.title="Courtnotes" \
      org.opencontainers.image.description="Offline-first data collection for court watch programs" \
      org.opencontainers.image.source="https://github.com/lobojoel2003/Courtnotes" \
      org.opencontainers.image.licenses="AGPL-3.0-or-later" \
      org.opencontainers.image.revision="${COMMIT_SHA}" \
      io.courtnotes.build-number="${BUILD_NUMBER}"

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    # Volunteers can upload a few hundred records at once after a day offline.
    BODY_SIZE_LIMIT=6M

WORKDIR /app
COPY --from=build --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/build ./build
# CLI scripts (migrate, seed, create-coordinator) and the modules and schema they import.
COPY --from=build --chown=node:node /app/scripts ./scripts
COPY --from=build --chown=node:node /app/src/lib ./src/lib
COPY --from=build --chown=node:node /app/schema ./schema
RUN mkdir -p /app/.data && chown node:node /app/.data

USER node
# Used only by the embedded PGlite database when DATABASE_URL is not set.
VOLUME ["/app/.data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "build"]
