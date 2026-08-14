# API (`apps/api`)

English | [简体中文](../zh/api.md)

## Stack and versions

The authoritative versions are defined in `apps/api/package.json`.

- **Fastify**: `^5.8.4`
- **Prisma**: `^7.7.0`
  - `@prisma/client`: `^7.7.0`
  - `@prisma/adapter-pg`: `^7.7.0`
- **Swagger**
  - `@fastify/swagger`: `^9.8.1`
  - `@fastify/swagger-ui`: `^6.1.1`
- **Validation and type provider**
  - `@fastify/type-provider-typebox`: `^6.1.0`
  - `typebox`: `^1.3.11`
- **Authentication**: `@fastify/jwt` `^10.2.1`
- **Common plugins**: Autoload, Env, Multipart, Rate Limit, and Sensible
- **Development logging**: `pino-pretty` `^13.1.3`

## Upstream documentation

- [Fastify](https://fastify.dev/docs/latest/)
- [Fastify reference](https://fastify.dev/docs/latest/Reference/)
- [Fastify Autoload](https://github.com/fastify/fastify-autoload)
- [Fastify Env](https://github.com/fastify/fastify-env)
- [Fastify JWT](https://github.com/fastify/fastify-jwt)
- [Fastify Multipart](https://github.com/fastify/fastify-multipart)
- [Fastify Sensible](https://github.com/fastify/fastify-sensible)
- [Fastify Swagger](https://github.com/fastify/fastify-swagger)
- [Fastify Swagger UI](https://github.com/fastify/fastify-swagger-ui)
- [Prisma documentation](https://www.prisma.io/docs)
- [Prisma schema reference](https://www.prisma.io/docs/orm/reference/prisma-schema-reference)
- [Prisma Client reference](https://www.prisma.io/docs/orm/reference/prisma-client-reference)
- [TypeBox](https://github.com/sinclairzx81/typebox)

## Project conventions

- **Entrypoints**: `src/app.ts` exposes the testable application factory and `src/server.ts` starts the process. Routes are loaded with `@fastify/autoload`.
- **Health**: `GET /health` is the liveness endpoint. `GET /health/ready` includes a PostgreSQL readiness query.
- **Schemas**: TypeBox and `@fastify/type-provider-typebox` provide runtime validation and type inference. Every route response must match its declared schema. New versioned business APIs use `{ code, data?, message? }`.
- **Database**: Prisma assets live under `prisma/`. Local development may use `db:migrate`; production applies only `db:migrate:deploy`. The destructive seed requires `ALLOW_DESTRUCTIVE_SEED=true` and must only target disposable databases.
- **Authentication**: JWT enforcement is centralized. Public routes must opt in explicitly. The deployment plugin at `src/plugins/global/zzz-deployment.ts` resolves feature flags and deployment mode once at startup.
- **Public configuration**: `GET /auth/public-config` exposes only public capabilities such as password login, Airalogy OAuth, institution login, AI chat, and paper uploads. Backend routes independently enforce every disabled feature.
- **Institution identity**: activation tokens support provisioned members. Institution SSO uses JIT provisioning to create or match a platform user and grants only the default `member` role. See [institution authentication](./institution-auth.md).
- **Public and private deployments**: both use the same backend. Environment configuration and feature flags select behavior; customer-specific source branches are not maintained.

## Governance references

- [Content governance and role boundaries](./content-governance.md)
- [Paper review state machine](./paper-review-workflow.md)
- [Degree-thesis versions, files, and review APIs](./degree-thesis-workflow.md)
- [Institution organization snapshots and workflow resolution](./institution-org-structure.md)
- [Private deployment](./private-deployment.md)

Ordinary papers and degree theses share the `content_review_*` state machine, reviewer snapshots, and audit actions. New content domains must use the shared review service instead of implementing review transitions inside business routes.

Institution member-paper bindings are institution-scoped presentation and reporting relationships. They do not rewrite global authorship facts or bypass review. The relevant APIs and counting semantics are described in [content governance](./content-governance.md) and the [paper review workflow](./paper-review-workflow.md).
