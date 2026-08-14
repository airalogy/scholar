# Airalogy Scholar Private Deployment

English | [简体中文](../zh/private-deployment.md)

This guide deploys one tested Airalogy Scholar release to a university while keeping application upgrades independent from institution-owned data. Production uses a complete release package, not a server Git checkout. Web, API, migrations, documentation, and an optional database are internal components of one product version and are not freely mixed.

## 1. Application and data boundary

Application images are replaceable. Business data remains under the deploying institution's control.

| Content | Default location | Upgrade behavior |
|---|---|---|
| Scholars, papers, institutions, permissions, timelines, and jobs | PostgreSQL with pgvector | Retain the database and apply versioned migrations |
| Uploaded PDFs and other files | `scholar_uploads` volume | Retain; may use a host path or object storage |
| Database backups | `SCHOLAR_BACKUP_DIR` | Retain on the host; never include in images |
| API and Web programs | Versioned container images | Replace with the release images |
| Release identity and upgrade records | `deploy/release-manifest.*` and `SCHOLAR_STATE_DIR` | Retain for verification and recovery decisions |
| Logs | Container standard output | Collect with Docker, journald, or the institution log platform |

PostgreSQL and local uploads use named volumes by default. Host-managed paths may be configured:

```dotenv
SCHOLAR_POSTGRES_STORAGE=/srv/scholar-data/postgres
SCHOLAR_UPLOADS_STORAGE=/srv/scholar-data/uploads
SCHOLAR_BACKUP_DIR=/srv/scholar-data/backups
SCHOLAR_STATE_DIR=/srv/scholar-data/state
```

Create these directories before installation and grant the PostgreSQL and API containers the required access. Keep the replaceable deployment files under a path such as `/opt/scholar` and persistent data under a separate path such as `/srv/scholar-data`.

Production, staging, and multiple institution instances on one server must use distinct `SCHOLAR_COMPOSE_PROJECT_NAME`, volume names, ports, state directories, and backup directories. Never validate an upgrade against the production volume.

For an institution-managed database, set `SCHOLAR_DATABASE_MODE=external` and point `DATABASE_URL` to PostgreSQL with `pgvector` and `pg_trgm`. The institution database service then owns availability, backups, and disaster recovery.

## 2. Release topology

The release package contains:

- `web`: Caddy static application and `/api` reverse proxy;
- product documentation: English and Chinese VitePress output embedded in the Web image at `/docs/en/` and `/docs/zh/`;
- `api`: Fastify API and the built-in research-timeline worker;
- `migrate`: one-shot Prisma migration before a new version starts;
- `postgres`: optional PostgreSQL 17 with pgvector;
- `scholar_uploads`: local persistent file volume.

Release automation generates:

- `release-manifest.json` for audit and tooling;
- `release-manifest.env` for `scholarctl` verification without requiring Node.js or `jq` on the server.

The manifests bind the product version, Git tag and commit, latest database migration, and API, Web, and PostgreSQL SHA-256 image digests. Production uses `image:version@sha256:digest`. Never replace one component with a different release.

Web listens on `127.0.0.1:8080` by default. Terminate HTTPS at the institution's Nginx, gateway, or load balancer and forward to Web. Do not expose the API container directly.

Documentation is not a separate selectable service. The Web image includes the application and matching user documentation. `/docs/` selects a language landing page; `/docs/en/` and `/docs/zh/` are available offline. The API serves Swagger internally at `/docs`, exposed by the Web gateway as `/api/docs`, with JSON at `/api/docs/json`. Repository operations documents such as this guide are not included in the user-facing documentation site.

## 3. Deployment configuration

Download `scholar-deploy-vX.Y.Z.tar.gz` from the release, verify its `.sha256` and provenance, extract it, and create the private environment file:

```bash
cp deploy/.env.example deploy/.env
```

At minimum configure:

- `SCHOLAR_API_IMAGE`, `SCHOLAR_WEB_IMAGE`, and `POSTGRES_IMAGE`;
- `POSTGRES_PASSWORD` and `DATABASE_URL`;
- a random `JWT_SECRET` of at least 32 characters;
- `DEPLOYMENT_MODE` and `PRIVATE_INSTITUTION_SLUG`;
- login methods and AI, upload, forum, thesis, and timeline features;
- local or object-storage settings;
- application display name and institution-authorized branding URLs.

The formal product template enables `ENABLE_AI_CHAT=true` for the chat page and paper-reading assistant. Configure `OPENAI_BASE_URL`, `OPENAI_API_KEY`, `CHAT_MODEL`, and `OPENAI_EMBEDDING_MODEL`, or explicitly disable AI when it is not part of the deployment. Source-development defaults remain disabled to avoid starting AI without valid credentials.

For institution-only SSO, enable institution login and SSO and disable password login and public registration. Use only generic `INSTITUTION_SSO_*` configuration. The callback is `/institution_sso_callback`; migrate any legacy customer-specific variables before upgrade. See [institution authentication](./institution-auth.md) and `deploy/.env.example`.

Release package images are already digest-pinned. A mirror in ACR, TCR, or Harbor may change the registry hostname and version tag but must preserve the expected digest. Keep `SCHOLAR_RELEASE_METADATA_REQUIRED=true` in production.

`PUBLIC_INSTITUTION_LOGO_URL` and `PUBLIC_INSTITUTION_WATERMARK_URL` may reference HTTPS assets or `/branding/...`. `SCHOLAR_BRANDING_STORAGE` is mounted read-only into Web. Institution names, logos, customer domains, and real data belong on the deployment host, not in the source repository.

Run preflight before any installation:

```bash
deploy/scholarctl preflight
```

Preflight rejects example secrets, incomplete SSO, `latest` images, invalid database mode, mismatched release metadata, and invalid Compose configuration.

## 4. Connected, mirrored, and offline delivery

The images use the OCI format and do not require Docker Hub as the only registry. Deployments may use GHCR upstream, ACR or TCR for mainland China, or an institution Harbor registry.

Mirror all release images and configure immutable versioned references without `latest`. For a disconnected environment, export on a connected machine for the server architecture:

```bash
SCHOLAR_TARGET_PLATFORM=linux/amd64 deploy/export-images.sh
```

Copy the resulting `.tar.gz`, `.sha256`, `.platform`, `.images`, and `.manifest.*` files together, then import and install:

```bash
deploy/import-images.sh deploy/scholar-images-vX.Y.Z.tar.gz
deploy/scholarctl install
```

Import verifies every checksum, the release manifest, server architecture, and package-version match. Set `SCHOLAR_OFFLINE=true` after import so installation rejects network pulls and validates local image labels, version, and Git commit.

Most institutions should not build from source. If a mainland-China environment must build, `SCHOLAR_NODE_BUILD_IMAGE` and `SCHOLAR_CADDY_BUILD_IMAGE` may point to mirrored base images.

## 5. First installation

```bash
deploy/scholarctl install
deploy/scholarctl status
```

Installation verifies the release manifest, obtains or checks pinned images, waits for the database, runs all migrations, starts API and Web, executes the integrity audit, and verifies that `/version` matches the manifest's version, tag, and commit. It records the release identity in `SCHOLAR_STATE_DIR` without storing secrets.

`install`, `upgrade`, `backup`, and `bootstrap` share one operation lock so two administrators cannot migrate or back up the same instance concurrently.

Create the first institution and owner interactively:

```bash
deploy/scholarctl bootstrap
```

Bootstrap does not write the owner password to `.env`. Repeating it repairs the same account's ownership relationship without replacing the password. Keep `ENABLE_PUBLIC_SIGNUP=false` afterward.

## 6. Upgrades

Read both changelogs and confirm migration and rollback constraints. Then:

1. record `deploy/scholarctl status` and `/version`;
2. back up PostgreSQL, uploads, and object storage;
3. extract the complete target release and transfer the private `.env`; do not replace one image manually;
4. run `deploy/scholarctl upgrade`;
5. verify `/version`, `/docs/`, `/api/docs/json`, health, login, paper access, and administration.

Upgrade validates the target release, checks all images, records old and target identities, stops Web and API to create a no-new-write backup window, then migrates. Bundled PostgreSQL produces a custom-format dump. Local storage produces a same-timestamp upload archive. A failed backup restarts the original application without running migrations.

For external PostgreSQL, the database administrator must complete a snapshot and then set `SCHOLAR_EXTERNAL_BACKUP_CONFIRMED=true`. For object storage, confirm the provider backup with `SCHOLAR_OBJECT_STORAGE_BACKUP_CONFIRMED=true`.

If migration, startup, integrity audit, or identity verification fails, the tool does not reconnect an old API to a potentially migrated database. It preserves the failed stage, old and new image identities, and backup relationships. Inspect them with:

```bash
deploy/scholarctl recovery
```

Recovery records contain no deployment secrets and do not attempt database downgrade. Use the changelog compatibility notes to decide whether to repair the target or restore the database, uploads, and old application as one matching set.

After an upgrade, the integrity audit runs automatically. Operators may also run:

```bash
deploy/scholarctl backup
deploy/scholarctl audit
```

Restore database and files from the same timestamp. Restore the PostgreSQL dump, then the matching uploads archive. The institution owns recovery for external PostgreSQL and object storage. Never restore only the database while omitting files referenced by submissions.

Prisma migration history remains in `_prisma_migrations` in the same PostgreSQL database. A migration changes schema; it does not create a replacement business database. Never run the destructive seed against unbacked production data.

## 7. Rollback

Application images may be replaceable, but database schemas are not always backward compatible. When the changelog says an old API cannot use the new schema, rollback must:

1. stop the new services;
2. restore the pre-upgrade PostgreSQL backup and matching file snapshot;
3. restore all old image references in `.env`;
4. restart and verify `/version`.

`scholarctl` intentionally provides no unsafe one-click downgrade and never deletes volumes on stop.

## 8. Operational requirements

- Keep at least one owner per institution.
- Keep `ENABLE_PUBLIC_SIGNUP` disabled unless explicitly required.
- Expose production through HTTPS only.
- Never commit system credentials, JWT secrets, OAuth secrets, or database passwords.
- Test PostgreSQL restoration regularly.
- For local files, test database and upload restoration as a pair.
- Give object storage an independent versioning, backup, or lifecycle policy.
- Use `/health` for liveness, `/health/ready` for readiness, `/version` for release identity, and `scholarctl status` for manifest verification.
- Prefer configuration, institution data, and generic identity adapters over a long-lived customer source fork.
