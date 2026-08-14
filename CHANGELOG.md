# Scholar Changelog

Chinese version: [CHANGELOG.zh-CN.md](./CHANGELOG.zh-CN.md)

## [Unreleased]

### Changed

- Public paper, scholar, laboratory, and published degree-thesis pages can now be browsed without signing in; account actions request authentication only when invoked.

### Security

- Anonymous API access is limited to approved or published public records, excludes protected file links and private author metadata, and continues to reject integration credentials on user-facing endpoints.

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
