# Airalogy Scholar

English | [简体中文](./README.zh-CN.md)

Airalogy Scholar is an institution-ready platform for scholarly profiles, papers, degree theses, research timelines, discovery, and AI-assisted reading.

## What is included

- **API (`apps/api`)**
  - Fastify, Prisma, PostgreSQL, pgvector, and JWT authentication
  - Scholar, paper, thesis, laboratory, institution, review, import, and file APIs
  - OpenAPI documentation at `/api/docs`
  - Optional OpenAI-compatible chat, retrieval, recommendations, and research-timeline generation
- **Web application (`apps/web`)**
  - Vue 3, Vite, and Arco Design
  - Public discovery, scholar and paper pages, submission workflows, and administration
- **Product documentation (`apps/docs`)**
  - Version-matched English and Chinese guides built with VitePress
  - Institution import, authentication, administration, and API integration documentation
  - Bundled into the Web image for online and offline deployments

## Repository layout

```text
.
├── apps/
│   ├── api/      # Fastify and Prisma API
│   ├── docs/     # Bilingual product documentation
│   └── web/      # Vue 3 web application
├── deploy/       # Compose manifests, upgrades, backups, and offline delivery
├── docker/       # Development database configuration
├── docs/         # Bilingual architecture, operations, and maintainer documentation
├── package.json
└── pnpm-workspace.yaml
```

## Requirements

- Node.js 22.23.0 (minimum supported version: 22.9.0)
- pnpm 10.33
- Docker or another PostgreSQL 17 installation with `pgvector` and `pg_trgm`

## Install dependencies

```bash
pnpm install
```

This installs dependencies for the API, Web application, and documentation site.

## Configure the API

Copy `apps/api/.env.example` to `apps/api/.env` and update the environment variables for your local environment.

The API provides both conversational AI and Scholar retrieval. To enable them, configure `OPENAI_BASE_URL`, `OPENAI_API_KEY`, `CHAT_MODEL`, and `OPENAI_EMBEDDING_MODEL` in `apps/api/.env`.

## Start a local database

The development Compose configuration uses a digest-pinned PostgreSQL 17 image with `pgvector` and `pg_trgm`.

```bash
cd docker/database
cp .env.example .env
docker compose up -d
```

Initialize the database from the repository root:

```bash
pnpm db:generate
pnpm db:migrate:deploy

# Optional: load fictional data into a disposable development database.
# This command clears application tables before seeding.
ALLOW_DESTRUCTIVE_SEED=true pnpm db:seed
```

Never run the destructive seed against a production database.

## Run locally

Start the API, Web application, and documentation site together:

```bash
pnpm dev
```

Default endpoints:

- API: `http://localhost:3000`
- Web: `http://localhost:5173`
- English documentation: `http://localhost:5174/docs/en/`
- Chinese documentation: `http://localhost:5174/docs/zh/`

You can also run each application independently:

```bash
pnpm --filter @airalogy/scholar-server dev
pnpm --filter @airalogy/scholar-web dev
pnpm --filter @airalogy/scholar-docs dev
```

## API overview

- Authentication: `/auth/signup`, `/auth/signin`, OAuth, and institution SSO
- Institutions and provisioning: `/auth/institutions`, `/auth/institution-provisions/:token`
- Papers: `/papers`, `/papers/search`, `/papers/my`, `/papers/review-queue`
- Chat: `/chat`, `/chat/:id` with JSON and SSE responses
- Discussion and bookmarks: `/forum`, `/bookmarks`
- Scholars, authors, laboratories, and institutions: `/scholars`, `/authors`, `/labs`, `/institutions`
- Files: `/files/upload`, `/files/preview/:id`
- Version and health: `/version`, `/health`, `/health/ready`
- Product documentation: `/docs/en/`, `/docs/zh/`
- OpenAPI: `/api/docs`, `/api/docs/json`

Endpoints require a Bearer token unless the route explicitly declares anonymous access. Authentication routes are not made public solely by sharing the `/auth` prefix.

## Common commands

```bash
pnpm dev
pnpm build
pnpm lint
pnpm type-check
pnpm test
pnpm check
pnpm audit:prod
pnpm license:check
pnpm db:validate
pnpm db:generate
pnpm db:migrate:deploy
pnpm db:migrate:status
pnpm db:audit:integrity
pnpm version:check
pnpm release:source:check
```

## Versioning and releases

[VERSION](./VERSION) is the Scholar product version. The API, Web application, documentation, database migration set, and deployment package are tested and released as one product version.

- [CHANGELOG.md](./CHANGELOG.md) is the default English changelog; [CHANGELOG.zh-CN.md](./CHANGELOG.zh-CN.md) is its Chinese counterpart.
- `pnpm version:check` verifies version consistency across the monorepo and both changelogs.
- `GET /version` reports the running version, Git tag, commit, build time, and build state.
- A release binds the product version, database migration, component images, and exact image digests in `release-manifest.json` and `release-manifest.env`.
- Production upgrades use the generated deployment package as a unit. Web and API versions are not intended to be mixed independently.

See the [release process](./docs/en/releasing.md) for maintainer instructions.

## Production deployment

Production environments should use the versioned deployment package instead of running from a Git checkout.

```bash
cp deploy/.env.example deploy/.env
# Configure images, database access, JWT secrets, institution settings,
# storage, and feature flags.
deploy/scholarctl preflight
deploy/scholarctl install
deploy/scholarctl bootstrap
```

Only the Web gateway binds to `127.0.0.1:8080` by default. Deployments should expose it through their own HTTPS reverse proxy.

PostgreSQL data, uploaded files, and backups remain under the deploying institution's control. They persist independently of application upgrades through Docker volumes, host directories, or externally managed database and object-storage services.

Mainland China and disconnected environments can mirror the API, Web, and PostgreSQL images to ACR, TCR, Harbor, or another institution-managed registry. `deploy/export-images.sh` and `deploy/import-images.sh` support offline delivery.

See [private deployment](./docs/en/private-deployment.md) for the complete deployment and upgrade guide.

## Documentation

Each Scholar deployment includes version-matched product documentation:

- `/docs/en/` for English
- `/docs/zh/` for Chinese
- `/api/docs` for Swagger UI
- `/api/docs/json` for the OpenAPI document

The product documentation is bundled with the Web image and remains available in offline installations. Repository maintainers should use the [English repository documentation](./docs/en/README.md); a separate [Chinese version](./docs/zh/README.md) is also maintained.

## License, security, and contributions

- [Apache License 2.0](./LICENSE)
- [Notice](./NOTICE)
- [Trademark policy](./TRADEMARKS.md)
- [Asset licensing](./ASSETS.md)
- [Security policy](./SECURITY.md)
- [Contributing guide](./CONTRIBUTING.md)
