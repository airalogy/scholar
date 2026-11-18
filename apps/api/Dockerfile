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

# Compile independently of the changing commit, tag and timestamp.
RUN GIT_COMMIT=build-cache GIT_TAG= BUILD_TIME=1970-01-01T00:00:00.000Z BUILD_DIRTY=false \
  pnpm --filter @airalogy/scholar-server build

ARG APP_VERSION=dev
ARG GIT_COMMIT=unknown
ARG GIT_TAG=
ARG BUILD_TIME=
ENV APP_VERSION=$APP_VERSION
ENV GIT_COMMIT=$GIT_COMMIT
ENV GIT_TAG=$GIT_TAG
ENV BUILD_TIME=$BUILD_TIME
ENV BUILD_DIRTY=false

# The final image still contains the actual release metadata, never the cached placeholder.
RUN node scripts/write-build-info.mjs apps/api/dist/build-info.json

# Keep the build toolchain (including npm's bundled dependencies) out of every
# runtime layer. Use the same Debian release and the exact Node binary used to build.
FROM debian:bookworm-slim@sha256:734a72b3d6142a71993b4bc580ca01d8ca687f77a2c422d96a961d3376b179bc AS runtime-base

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates libatomic1 libstdc++6 openssl \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --gid 1000 node \
  && useradd --uid 1000 --gid node --shell /bin/sh --create-home node
COPY --from=base /usr/local/bin/node /usr/local/bin/node
COPY --from=base /usr/local/LICENSE /usr/local/share/doc/node/LICENSE
RUN node --version && test -s /usr/local/share/doc/node/LICENSE && test ! -e /usr/local/lib/node_modules/npm

FROM runtime-base AS runtime

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
