# Contributing to Airalogy Scholar

Thank you for helping improve Airalogy Scholar. Before submitting a change:

1. Discuss substantial product or schema changes in an issue first.
2. Keep institution-specific data, credentials, logos, and deployment overrides out of the repository.
3. Follow the repository's `AGENTS.md` and existing TypeScript, Fastify, Vue, migration, and API conventions.
4. Maintain repository engineering and operations documents as matching files under [`docs/en`](./docs/en/README.md) and [`docs/zh`](./docs/zh/README.md). Keep user, institution-administration, and integration guides in `apps/docs`; do not publish maintainer runbooks in the product documentation site.
5. Run `pnpm docs:check` after changing repository documentation. It verifies language pairs, reciprocal language links, entry-point links, and the boundary from product documentation.
6. Run `pnpm install` once to enable the pre-push hook. It checks all commits in the pending push and validates whole affected modules; shared dependencies, check policy changes and unknown ranges require full local checks. Use `pnpm check:quick` while developing and `pnpm check` for full local code validation.
7. Add or update both `CHANGELOG.md` and `CHANGELOG.zh-CN.md` for user-visible changes.
8. Sign off each commit with `git commit -s` to certify the [Developer Certificate of Origin](https://developercertificate.org/).

## Maintainer updates and pull requests

Authorized maintainers normally update `main` directly after confirming the change scope and completing the required local checks. Pull requests are used for external contributions, explicitly requested reviews, or collaboration that requires another person's review; feature size or complexity alone does not determine the route. Contributors without write access must use a pull request. This policy does not grant new repository access.

Check the latest remote `main` before pushing and use fast-forward updates only. Preserve unrelated local work; stop and resolve the scope with the owner if there is a conflict, a failed check, or an unexpected change. Do not force-push, delete `main`, skip the pre-push hook, or reduce checks to complete an update.

After a direct push, verify the complete CI run for that exact commit. Code and database checks run once in parallel groups inside clean source snapshots. Daily Docker checks cover changed container configuration or dependencies; every formal release still builds and smoke-tests API/Web on both native architectures and installs the exact component set. Development can continue while CI runs, but `main` can temporarily contain an unverified or failing commit. Pending, failed, cancelled, or unknown results block release tags, releases, and deployment; a local pass alone is not release approval. If a pull request is used, verify its complete checks and resolve review discussions before merging.

Release may reuse only successful exact-commit `main` push CI with all required groups in the latest run attempt. Missing evidence triggers full clean-source verification; failed, cancelled, skipped required jobs and unknown API results block release. Production dependency advisories are checked again on release. Use `pnpm release:ci:check` before creating a tag and `pnpm ci:watch RUN_ID --sha COMMIT` for per-job status and timing. No persistent local pass cache is trusted. Backups and production upgrade behavior are unchanged.

Automation must receive explicit authorization for commits and pushes. One approval may cover a clearly listed sequence, but it does not authorize unlisted actions. Account, identifier, permission, and data changes need explicit scope approval and validation. Versioning, tagging, release, and deployment remain separately authorized operations, and the existing full release checks and pre-deployment backups remain mandatory. See the [English release process](./docs/en/releasing.md) or [Chinese release process](./docs/zh/releasing.md).

By submitting a contribution, you agree that it is provided under the Apache License 2.0 and that you have the right to submit it. Do not contribute employer, institution, or third-party material without authorization.

Security vulnerabilities must follow `SECURITY.md` rather than a public issue.
