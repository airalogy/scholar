# Web (`apps/web`)

English | [简体中文](../zh/web.md)

## Stack and versions

The authoritative versions are defined in `apps/web/package.json`.

- **Vue**: `^3.5.41`
- **Vite**: `^8.2.0`
- **Arco Design Vue**: `^2.58.0`
- **Vue Router**: `^4.2.0`
- **HTTP client**: project wrapper around the Fetch API
- **Markdown safety**: Marked `^17.0.3` and DOMPurify `^3.4.13`

## Upstream documentation

- [Vue 3](https://vuejs.org/guide/introduction.html)
- [Vue API](https://vuejs.org/api/)
- [Vite](https://vite.dev/guide/)
- [Vite configuration](https://vite.dev/config/)
- [Arco Design Vue](https://arco.design/vue/docs/start)
- [Vue Router](https://router.vuejs.org/guide/)
- [Fetch API](https://developer.mozilla.org/docs/Web/API/Fetch_API)
- [DOMPurify](https://github.com/cure53/DOMPurify)

## Project conventions

- Use Vue 3 single-file components with `<script setup lang="ts">`.
- Run type checking with `vue-tsc --noEmit` through the package `type-check` script.
- Send JSON and SSE requests through `src/api/client.ts` so API base URLs, Bearer tokens, `401` handling, and cancellation remain consistent. Streaming requests must accept an `AbortSignal`.
- Pass AI-generated Markdown through `renderSafeMarkdown` before `v-html`. Filter every database or API URL with `resolveSafeHttpUrl`.
- `pnpm lint` checks only. Run the Web package's `lint:fix` explicitly when applying automatic fixes.
- Follow the existing Vue Router structure. Public pages opt in to anonymous access; protected actions request authentication on demand.
- Drive login methods, navigation, feature entry points, and institution branding from `GET /auth/public-config`. Do not hard-code deployment capabilities in pages.
- When `paperUpload` is disabled, remove every upload entry point and empty-state call to action in addition to relying on backend rejection.
- Institution SSO with `jit_member` may explain that the first successful login creates an account and joins the institution, but must not imply administrative privileges.
- Private-deployment AI chat, uploads, logos, and login options follow public configuration. See [private deployment](./private-deployment.md).

## Governance and administration references

- [Laboratory-page permissions and role model](./content-governance.md)
- [Paper review and public-display rules](./paper-review-workflow.md)
- [Degree-thesis collection, editor, submitter workspace, and review console](./degree-thesis-workflow.md)
- [Institution authentication and login-method expansion](./institution-auth.md)

Degree-thesis routes follow `features.degreeTheses`. Reviewers may open queues, while only institution owners and administrators configure workflows. Institution member-paper binding controls must preserve member-management authorization, and statistics must distinguish bound papers from approved papers.
