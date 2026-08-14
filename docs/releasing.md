# Scholar Release Process

Scholar is released as one product made up of independently running Web, API, migration, and optional PostgreSQL services. A release must bind these components to one tested product version and immutable image digests.

## Release requirements

- Use a clean `main` commit with all required checks passing.
- Sign off commits with `git commit -s` to certify the Developer Certificate of Origin.
- Keep `VERSION`, package versions, and the English and Chinese changelogs aligned.
- Review database migrations, compatibility notes, storage requirements, and rollback conditions.
- Never include deployment credentials, institution data, private URLs, or customer-specific assets in the repository or release package.

## Validate the release source

Run the standard repository checks before creating a tag:

```bash
pnpm install --frozen-lockfile
pnpm audit:prod
pnpm license:check
pnpm check
pnpm release:source:check
pnpm release:check
```

For a from-scratch verification, provide a disposable PostgreSQL schema. The verifier deletes and recreates the named schema, so it must never point to data that needs to be retained.

```bash
RELEASE_SOURCE_DATABASE_URL='postgresql://.../scholar?schema=release_source' \
  pnpm release:source:verify
```

The release-source check reconstructs the initial migration from the current Prisma schema, scans source files for credential-shaped values, validates the changelog baseline, and records file hashes in `RELEASE-SOURCE-MANIFEST.json`.

## Create a release

1. Set the final version and date in `VERSION`, package metadata, `CHANGELOG.md`, and `CHANGELOG.zh-CN.md`.
2. Run `pnpm release:check` on the clean release commit.
3. Create an annotated `vX.Y.Z` tag that exactly matches `VERSION`.
4. Push the tag and wait for the Release workflow to complete.

The workflow:

- repeats database, source, license, lint, type, test, and build validation;
- builds `linux/amd64` and `linux/arm64` API and Web images;
- publishes an SBOM and build-provenance attestation for each image;
- records immutable image digests in the release manifest;
- smoke-tests the exact released Compose configuration;
- publishes the deployment archive, checksum, and machine-readable manifests.

Release tags are immutable. If a published release is defective, fix the issue on `main` and publish a new patch version rather than moving or reusing the tag.

## Post-release verification

- Confirm the GitHub Release is published and contains the deployment archive, checksum, JSON manifest, and environment manifest.
- Confirm `ghcr.io/airalogy/scholar-api:X.Y.Z` and `ghcr.io/airalogy/scholar-web:X.Y.Z` are publicly readable and match the recorded digests.
- Install the release into an empty environment and verify `/healthz`, `/api/version`, `/docs/en/`, `/docs/zh/`, and `/api/docs/json`.
- Keep `main` protected by required checks, review, linear history, and disabled force pushes and deletions.
- Keep Dependabot alerts, secret scanning, push protection, and private vulnerability reporting enabled.
