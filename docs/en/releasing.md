# Airalogy Scholar Release Process

English | [简体中文](../zh/releasing.md)

Scholar is released as one product made up of independently running Web, API, migration, and optional PostgreSQL services. A release must bind these components to one tested product version and immutable image digests.

## Daily updates versus releases

Maintainers with write access normally update `main` directly after confirming the change scope and receiving authorization to commit and push. Feature size or complexity does not determine the route; use a pull request for external contributions, explicitly requested reviews, or collaboration that requires another person's review. This policy grants no new repository access.

Use the following sequence for daily updates:

1. Check the remote `main`, preserve existing local work, and list and confirm the files in scope. Stop and report conflicts, failed checks, or scope changes.
2. Run `pnpm check:quick` during development and regenerate the source manifest as needed. After authorization, commit; pre-push checks whole affected modules across every commit being pushed. Shared dependencies, check policy changes, new branches and unknown ranges require full checks. Only fast-forward pushes are allowed; never skip the hook, force-push or delete the branch. The hook requires a clean worktree matching the pushed HEAD. Use an isolated checkout to preserve unrelated changes; do not discard them.
3. Wait for and verify the complete main-branch CI run for that exact commit, including code, database, source-snapshot, and Docker checks. Do not substitute a previous commit's result. If a newer push cancels the run, validate the new target commit.
4. The code update is verified only after all checks pass. Versioning, tagging, release, and deployment still require their corresponding explicit authorization, and the existing pre-deployment backup procedure remains mandatory.

The repository no longer requires a pull request or successful remote checks before writing to `main`. Full CI remains a post-push check, development can continue while CI runs, and Release can reuse trusted full CI for the exact final commit. The branch can therefore temporarily contain an unverified or failing commit; pending, failed, cancelled, or unknown results must block release tags, releases, and deployment. Removing the PR requirement alone does not remove the previous status-check prerequisite: repository settings must match this policy. It does not mean deleting workflows or reducing checks.

Keep linear history and disable force pushes and branch deletion. Release tags must remain protected against movement and deletion. Do not relax other security settings as part of this policy. When using a PR, verify its complete checks and resolve review discussions before merging. One approval may cover a clearly listed sequence but never unlisted actions; account bindings, canonical identifiers, permissions, and data changes still need explicit scope approval and validation. Pushing code does not authorize production data operations.

## Release requirements

- Use a clean `main` commit whose complete CI run has passed. Being on `main` or having a green result for a different commit is insufficient.
- Sign off commits with `git commit -s` to certify the Developer Certificate of Origin.
- Keep `VERSION`, package versions, and the English and Chinese changelogs aligned.
- Review database migrations, compatibility notes, storage requirements, and rollback conditions.
- Never include deployment credentials, institution data, private URLs, or customer-specific assets in the repository or release package.

## Validate the release source

For full local code validation (without real PostgreSQL verification), run:

```bash
pnpm install --frozen-lockfile
pnpm release:source:manifest
pnpm check
```

`scripts/run-checks.mjs` owns the check groups and their elapsed-time summaries; no persistent local pass cache is trusted across commits. Quick checks retain configuration, license, version, documentation and source-manifest checks plus whole affected modules, not guessed individual tests. Business-module-only changes do not repeat deployment fixtures; shared dependencies, check policy, deployment scripts and unknown files still require full checks. `pnpm check` includes production dependency auditing, licenses, formatting, lint, types, all non-database tests, all three application builds and the API startup smoke test.

CI runs quality, api, web, docs and database groups in parallel inside audited clean source snapshots, retaining empty-database, upgrade, identity, governance and bibliography verification. It no longer repeats full validation in the original checkout first. The `verify` aggregate rejects failed, cancelled or skipped required groups. Daily Docker builds cover changed container configuration and dependencies, with both components selected if the base is unknown. Unconditional ARM warming is removed. Formal releases always build and smoke-test both components on both native architectures. A local quick pass is neither full CI evidence nor release approval.

For a from-scratch verification, provide a disposable PostgreSQL test database and a non-`public` schema within it. The verifier initializes shared extensions in the test database's `public` schema and deletes and recreates the named schema. It must never point to production or data that needs to be retained.

```bash
RELEASE_SOURCE_DATABASE_URL='postgresql://.../scholar?schema=release_source' \
  pnpm release:source:verify
```

The manifest command preserves the published initial migration and every incremental migration unchanged, scans source files for credential-shaped values, validates the changelog baseline, and records their actual file hashes in `RELEASE-SOURCE-MANIFEST.json`. Never regenerate or replace a published migration. The release-source check fails when the committed manifest no longer matches the source tree, including migration changes.

CI verifies both an empty database and an upgrade fixture containing existing institution identities and paper bindings. To run the upgrade fixture independently, set `DATABASE_URL` and run `pnpm db:verify:upgrade`. It uses a randomly named schema and rolls back the fixture and migrations together on one connection.

## Create a release

1. Set the final version and date in `VERSION`, package metadata, `CHANGELOG.md`, and `CHANGELOG.zh-CN.md`.
2. Push the final version commit, wait for and verify its complete main-branch CI run, then run `pnpm release:ci:check` to verify remote evidence and `pnpm release:check` for local version, tag and worktree metadata. A version commit has a new SHA and cannot reuse its parent commit’s result.
3. Create an annotated `vX.Y.Z` tag that exactly matches `VERSION`.
4. Push the tag and wait for the Release workflow to complete.

To monitor an existing run with the authenticated GitHub CLI:

```bash
gh run list --workflow release.yml --limit 5
pnpm ci:watch RUN_ID --repo airalogy/scholar --sha COMMIT
```

Replace `RUN_ID` with the run for the exact release tag and `COMMIT` with its full commit SHA. The monitor reports per-job status and elapsed time. A commit mismatch returns unknown; one successful workflow is not proof of all release gates. The monitor only reads status; it never restarts workflows or publishes anything. It polls every 15 seconds, waits up to one hour, and retries transient query errors at most three times consecutively with backoff. Authentication and permission errors are not retried. Set `--interval SECONDS` or `--timeout SECONDS` to adjust the wait. Exit codes distinguish confirmed success (`0`), confirmed non-success such as failure or cancellation (`1`), and an unconfirmed result caused by a query error or timeout (`2`). For `2`, query the same run again or open its GitHub page; do not assume the release failed or push another tag.

The workflow:

- refreshes the production security audit and verifies the newest exact-SHA main/push CI run and its latest attempt from the same repository, with all required jobs successful; missing evidence triggers full clean-source validation, while failures, cancellations, skipped required jobs and unknown query results block release rather than falling back to an older green run;
- builds `linux/amd64` and `linux/arm64` API and Web images;
- publishes an SBOM and build-provenance attestation for each image;
- records immutable image digests in the release manifest;
- smoke-tests the exact released Compose configuration;
- publishes the deployment archive, checksum, and machine-readable manifests.

Separate registry cache references for each component and architecture allow reuse across versions; PRs cannot write these trusted caches. API compilation is cached separately from changing commit, tag and timestamp metadata; final images retain real release metadata. Cache export failure does not waive any check, and all build or smoke failures block release. Production upgrade scripts, write suspension, backups, health checks and recovery boundaries are unchanged.

Release tags are immutable. If a published release is defective, fix the issue on `main` and publish a new patch version rather than moving or reusing the tag.

## Post-release verification

- Confirm the GitHub Release is published and contains the deployment archive, checksum, JSON manifest, and environment manifest.
- Confirm `ghcr.io/airalogy/scholar-api:X.Y.Z` and `ghcr.io/airalogy/scholar-web:X.Y.Z` are publicly readable and match the recorded digests.
- Install the release into an empty environment and verify `/healthz`, `/api/version`, `/docs/en/`, `/docs/zh/`, and `/api/docs/json`.
- Keep complete post-push CI, linear history, and disabled force pushes and deletions on `main`; PRs are no longer mandatory for daily maintainer updates. Release tags must remain protected against movement and deletion.
- Keep Dependabot alerts, secret scanning, push protection, and private vulnerability reporting enabled.
