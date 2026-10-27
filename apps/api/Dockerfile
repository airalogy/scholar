ARG NODE_IMAGE=node:22.23.0-bookworm-slim@sha256:d9f850096136edbc402debdd8729579a288aac64574ada0ff4db26b6ae58b0b2

FROM ${NODE_IMAGE} AS base

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

FROM base AS dependencies

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /workspace

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

# Keep fetched packages in an ordinary layer so remote BuildKit caches include them.
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch --frozen-lockfile --ignore-scripts

COPY package.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/docs/package.json apps/docs/package.json
COPY apps/web/package.json apps/web/package.json
COPY scripts/install-git-hooks.mjs scripts/install-git-hooks.mjs
RUN pnpm install --offline --frozen-lockfile

FROM dependencies AS production-dependencies

# Export dependencies before copying source or release metadata.
RUN pnpm --filter @airalogy/scholar-server deploy --prod --legacy /opt/scholar-api

FROM dependencies AS build

COPY apps/api apps/api
COPY scripts scripts
COPY VERSION LICENSE NOTICE TRADEMARKS.md ASSETS.md ./

RUN DATABASE_URL=postgresql://scholar:scholar@localhost:5432/scholar?schema=public \
  pnpm --filter @airalogy/scholar-server db:generate

ARG APP_VERSION=dev
ARG GIT_COMMIT=unknown
ARG GIT_TAG=
ARG BUILD_TIME=
ENV APP_VERSION=$APP_VERSION
ENV GIT_COMMIT=$GIT_COMMIT
ENV GIT_TAG=$GIT_TAG
ENV BUILD_TIME=$BUILD_TIME
ENV BUILD_DIRTY=false

RUN pnpm --filter @airalogy/scholar-server build

FROM base AS runtime

ARG APP_VERSION=dev
ARG GIT_COMMIT=unknown
ARG GIT_TAG=
ARG BUILD_TIME=

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
WORKDIR /app

COPY --from=production-dependencies --chown=node:node /opt/scholar-api/node_modules/ ./node_modules/
COPY --from=build --chown=node:node /workspace/apps/api/package.json /workspace/apps/api/prisma.config.ts /workspace/apps/api/README.md ./
COPY --from=build --chown=node:node /workspace/apps/api/prisma/schema.prisma ./prisma/schema.prisma
COPY --from=build --chown=node:node /workspace/apps/api/prisma/migrations/ ./prisma/migrations/
COPY --from=build --chown=node:node /workspace/apps/api/dist/ ./dist/
COPY --from=build --chown=node:node /workspace/LICENSE /workspace/NOTICE /workspace/TRADEMARKS.md /workspace/ASSETS.md ./
RUN mkdir -p /var/lib/scholar/uploads && chown -R node:node /var/lib/scholar

LABEL org.opencontainers.image.title="Airalogy Scholar API"
LABEL org.opencontainers.image.licenses="Apache-2.0"
LABEL org.opencontainers.image.source="https://github.com/airalogy/scholar"
LABEL org.opencontainers.image.version=$APP_VERSION
LABEL org.opencontainers.image.revision=$GIT_COMMIT
LABEL org.opencontainers.image.ref.name=$GIT_TAG
LABEL org.opencontainers.image.created=$BUILD_TIME

USER node
EXPOSE 3000

CMD ["node", "dist/src/server.js"]
