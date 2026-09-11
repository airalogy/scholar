# Scholar Changelog

Chinese version: [CHANGELOG.zh-CN.md](./CHANGELOG.zh-CN.md)

## [Unreleased]

## [4.1.0] - 2026-09-11

### Added

- Institution owners and platform administrators can verify additional student or employee IDs for the same person, with revocation, restoration and an audit trail. Canonical IDs, accounts, profiles and paper bindings are preserved.
- A successfully authenticated institution SSO conflict now offers a private identity-verification request, with prior-ID declaration, status tracking, supplementary information, administrator approval or rejection, and bilingual interfaces.

### Security

- Names and email addresses never automatically merge accounts. Short-lived, hashed applicant proofs cannot access user accounts; identity operations reject integration credentials, cross-institution access and unauthorized or self-verification.
- Revoking an ID invalidates new SSO sessions bound to its version. Pre-upgrade and password sessions keep their existing expiry. Reserved IDs cannot be reassigned, and imports cannot replace an account-linked canonical ID to bypass verification.
- Updated development/build dependencies to patched Vitest, SVGO and js-yaml versions identified during release security review.

### Fixed

- PostgreSQL advisory-lock queries now return a driver-compatible type, avoiding mutation failures when the Prisma adapter cannot deserialize `void`.
- Person updates, membership/provision changes, organization imports and deployment tools acquire the identity lock before person rows, preventing a deadlock with concurrent SSO sign-in.

### Database and Deployment

- Added canonical/alias identifiers, expiring verification challenges, requests and audit events. The additive migration preserves all existing people and authorship without inferring real-person associations. Apply database migrations before starting the new API.

### Quality Assurance

- Added PostgreSQL integration and bilingual UI tests for approval, permissions, replay, concurrent mutations, revocation, imports, proof expiry, draft retention and cancellation. Identity and lossless-upgrade checks run in CI and release validation.

## [4.0.1] - 2026-09-11

### Changed

- Moved feedback from a floating chat-style button to a quieter sidebar entry beside documentation, with automatically centered icon-and-label layouts, a writing icon and an accessible feedback dialog.

### Fixed

- Patch-release validation now permits omitted changelog categories while still rejecting mismatched English and Chinese sections or item counts.

### Quality Assurance

- Added feedback regression tests covering keyboard focus, draft retention, validation, duplicate submissions, mobile navigation and language switching.

### Database and Deployment

- No database migrations, authentication changes or new deployment settings. Upgrade API, Web and bundled documentation together to 4.0.1; the database schema remains compatible with 4.0.0.

## [4.0.0] - 2026-09-10

### Added

- Institution people now use one canonical, case-insensitive internal ID that can exist before a user account, link independently to user and scholar records, and retain prebound paper authorship after first verified login.

### Changed

- Restored full-text hybrid paper retrieval: approved PDF text, deterministic BM25 scoring, and vector search share one index and feed relevant evidence to the paper reading assistant.
- Scholar now has an explicit single-institution product boundary: every self-hosted deployment or Airalogy Managed tenant serves one configured institution, and runtime routes no longer expose institution switching.
- Institution SSO now resolves the canonical internal-ID claim, creates or links accounts transactionally, grants only the default member role, and rejects email-only or conflicting identity claims.
- Managed tenants and self-hosted instances share one codebase while applying managed-review and direct-apply import policies respectively.
- Public paper, scholar, laboratory, and published degree-thesis pages can now be browsed without signing in; account actions request authentication only when invoked.
- Repository engineering and operations documentation now has complete English and Chinese trees under `docs/en` and `docs/zh`, with automated language-pair, local-link, and product-documentation boundary checks.
- The versioned product documentation now uses the full Airalogy Scholar name consistently in visible titles and landing pages.

### Security

- Updated Fastify and the affected `urllib`, `mysql2`, `fast-uri`, and `qs` dependency chains to patched releases. Release builds now run the same production dependency audit as pull requests and pre-push checks.
- Sending approved PDF excerpts to the configured model or embedding service requires explicit `ALLOW_APPROVED_PDF_MODEL_PROCESSING=true`; unapproved and cross-institution files remain excluded.
- All content, review, file, import, timeline, and integration-credential routes are constrained to the configured institution, including platform-administrator queues and historical records.
- Public scholar and paper APIs do not expose institution internal IDs; integration JWTs remain excluded from user and timeline endpoints.
- Anonymous API access is limited to approved or published public records, excludes protected file links and private author metadata, and continues to reject integration credentials on user-facing endpoints.
- Production dependency auditing now runs before every repository push, and the vulnerable Prisma configuration dependency is overridden with the patched `deepmerge-ts` 8 release line.

### Database and Deployment

- Release source exports now retain every published migration byte-for-byte and include incremental migrations in their checksum manifest, so fresh installations and existing databases use the same migration history.
- Added BM25 index metadata without removing existing embeddings. Existing papers can be reindexed with the shared paper-index command after upgrade.
- Added a loss-preserving migration from legacy organization people and scholar mappings to `institution_people`, structured identity-link audit events, and person-based paper-author bindings.
- Replaced legacy deployment variables with `MANAGEMENT_MODE`, `INSTITUTION_SLUG`, `CONTENT_ACCESS_MODE`, and `INSTITUTION_SSO_INTERNAL_ID_FIELD`; the deployment and product documentation now describe the single-institution model consistently.
- Institution deployments can explicitly configure the Scholar Docker IPv4 subnet and optional gateway; preflight rejects overlap with declared reserved ranges, host routes, and existing Docker networks.

### Quality Assurance

- Version endpoint and deployment metadata tests now read the shared product version, with regression coverage rejecting mismatched release tags.
- Added a transactional PostgreSQL upgrade fixture for existing identities, same-name members, pending invitations, appointments, paper authorship, and search index retention, and run it in CI and release verification.
- Container CI now reads the product version from `VERSION` instead of a hard-coded release number.

### Breaking Changes

- Existing deployments must migrate their configuration before starting the single-institution version; see the [upgrade instructions](docs/en/deployment.md#upgrading-from-300-to-the-single-institution-version). Legacy multi-institution instances require an explicit data separation plan.
- Institution join-request endpoints were removed and the public configuration response now exposes `tenancyMode`, `managementMode`, `contentAccess`, and `institution` instead of `deploymentMode`.
- The identity migration changes author-binding and institution-person tables. Older API images cannot run against the migrated schema; rollback requires the pre-upgrade database backup and matching application configuration.

## [3.0.0] - 2026-08-14

### Added

- Added an institution-neutral scholarly information platform for scholars, laboratories, papers, degree theses, research timelines, bookmarks, discussion, and search.
- Added configurable institution branding, local account controls, generic institution SSO, member roles, scoped permissions, and laboratory administration.
- Added a bilingual hierarchical academic-subject catalog with stable codes, institution-local mappings, database-backed facets, and structured scholar profiles.
- Added unified, version-bound, multi-stage content review for papers and degree theses, including change requests, resubmission, publication controls, and immutable audit actions.
- Added institution-scoped bulk import APIs, short-lived integration credentials, idempotency protection, browser-side CSV import, and import-history interfaces.
- Added optional OpenAI-compatible chat, Scholar recommendation, PostgreSQL/pgvector retrieval, protected document reading, and administrator-controlled research-timeline generation.
- Added version-matched Chinese and English product documentation, OpenAPI documentation, and fictional demonstration data.
- Added a server-authorized administration console with separate platform, institution, review, import, and lab capability views plus explicit restricted-access handling.

### Security

- Enforced institution, laboratory, submitter, reviewer, and platform-administrator boundaries across data access and write operations.
- Added protected file policies, signature checks, quotas, short-lived access links, sensitive-log redaction, request rate limits, and safe Markdown and URL rendering.
- Added secret-shaped value scanning, dependency vulnerability auditing, third-party license review, and publication checks for institution-specific markers.
- Restricted integration credentials to explicit scopes and institutions, with rotation, revocation, expiry, and one-time plaintext secret display.
- Added commit-pinned GitHub Actions, job-scoped release permissions, software bills of materials, and build-provenance attestations for published container images.

### Database and Deployment

- Established a clean PostgreSQL 17 and pgvector database baseline represented by one Scholar 3.0.0 initial Prisma migration.
- Added deployment-owned persistent database, upload, and backup storage with bundled or externally managed PostgreSQL options.
- Added versioned, digest-pinned API and Web images, release manifests, migration jobs, health checks, backup-aware upgrades, and offline image delivery.
- Added configurable local storage, institution-controlled object storage, reverse-proxy integration, and registry mirrors for private or disconnected environments.

### Quality Assurance

- Added formatting, lint, type, unit, integration, migration, deployment, production-build, and built-artifact smoke checks.
- Added release identity validation that binds the product version, Git commit, database migration, documentation, and exact component image digests.
- Added database integrity audits and regression coverage for authorization, review workflows, imports, search indexing, file isolation, and AI-generated output safety.
- Added from-scratch release-source verification, including dependency installation, generated clients, tests, builds, and an empty-schema migration.
