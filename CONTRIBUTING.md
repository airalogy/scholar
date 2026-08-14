# Contributing to Airalogy Scholar

Thank you for helping improve Airalogy Scholar. Before opening a pull request:

1. Discuss substantial product or schema changes in an issue first.
2. Keep institution-specific data, credentials, logos, and deployment overrides out of the repository.
3. Follow the repository's `AGENTS.md` and existing TypeScript, Fastify, Vue, migration, and API conventions.
4. Maintain repository engineering and operations documents as matching files under [`docs/en`](./docs/en/README.md) and [`docs/zh`](./docs/zh/README.md). Keep user, institution-administration, and integration guides in `apps/docs`; do not publish maintainer runbooks in the product documentation site.
5. Run `pnpm docs:check` after changing repository documentation. It verifies language pairs, reciprocal language links, entry-point links, and the boundary from product documentation.
6. Run `pnpm install` once to enable the repository's pre-push hook. It validates the GitHub Actions toolchain configuration and runs `pnpm check` before every push.
7. Add or update both `CHANGELOG.md` and `CHANGELOG.zh-CN.md` for user-visible changes.
8. Sign off each commit with `git commit -s` to certify the [Developer Certificate of Origin](https://developercertificate.org/).

By submitting a contribution, you agree that it is provided under the Apache License 2.0 and that you have the right to submit it. Do not contribute employer, institution, or third-party material without authorization.

Security vulnerabilities must follow `SECURITY.md` rather than a public issue.
