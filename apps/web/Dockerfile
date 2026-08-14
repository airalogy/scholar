ARG NODE_IMAGE=node:22.23.0-bookworm-slim@sha256:d9f850096136edbc402debdd8729579a288aac64574ada0ff4db26b6ae58b0b2
ARG CADDY_IMAGE=caddy:2.10.2-alpine@sha256:4c6e91c6ed0e2fa03efd5b44747b625fec79bc9cd06ac5235a779726618e530d

FROM ${NODE_IMAGE} AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /workspace

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml VERSION ./
COPY apps/api/package.json apps/api/package.json
COPY apps/docs/package.json apps/docs/package.json
COPY apps/web/package.json apps/web/package.json
COPY scripts/install-git-hooks.mjs scripts/install-git-hooks.mjs
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

COPY apps/docs apps/docs
COPY apps/web apps/web

ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN pnpm --filter @airalogy/scholar-web build
RUN pnpm --filter @airalogy/scholar-docs build

FROM ${CADDY_IMAGE} AS runtime

ARG APP_VERSION=dev
ARG GIT_COMMIT=unknown
ARG GIT_TAG=
ARG BUILD_TIME=

ENV HOME=/tmp
ENV XDG_CONFIG_HOME=/tmp/caddy/config
ENV XDG_DATA_HOME=/tmp/caddy/data

COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /workspace/apps/web/dist /srv
COPY --from=build /workspace/apps/docs/.vitepress/dist /srv/docs
COPY LICENSE NOTICE TRADEMARKS.md ASSETS.md /usr/share/licenses/scholar/

RUN caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile

LABEL org.opencontainers.image.title="Airalogy Scholar Web"
LABEL org.opencontainers.image.licenses="Apache-2.0"
LABEL org.opencontainers.image.source="https://github.com/airalogy/scholar"
LABEL org.opencontainers.image.version=$APP_VERSION
LABEL org.opencontainers.image.revision=$GIT_COMMIT
LABEL org.opencontainers.image.ref.name=$GIT_TAG
LABEL org.opencontainers.image.created=$BUILD_TIME

USER 10001:10001
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=5s --retries=5 \
  CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null || exit 1

CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
