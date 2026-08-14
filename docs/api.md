# API（apps/api）

## 技术栈与版本（来自 `apps/api/package.json`）

- **Fastify**: `^5.8.4`
- **Prisma**: `^7.7.0`
  - `@prisma/client`: `^7.7.0`
  - `@prisma/adapter-pg`: `^7.7.0`
- **Swagger**
  - `@fastify/swagger`: `^9.8.1`
  - `@fastify/swagger-ui`: `^6.1.1`
- **Validation / Type Provider**
  - `@fastify/type-provider-typebox`: `^6.1.0`
  - `typebox`: `^1.3.11`
- **Auth**
  - `@fastify/jwt`: `^10.2.1`
- **其他常用插件**
  - `@fastify/autoload`: `^6.5.0`
  - `@fastify/env`: `^7.0.0`
  - `@fastify/multipart`: `^10.0.0`
  - `@fastify/rate-limit`: `^11.2.0`
  - `@fastify/sensible`: `^6.0.4`
- **日志相关**
  - `pino-pretty`: `^13.1.3`

## 官方文档链接

- **Fastify**
  - https://fastify.dev/
  - https://fastify.dev/docs/latest/
  - https://fastify.dev/docs/latest/Reference/
- **Fastify Plugins**
  - Autoload: https://github.com/fastify/fastify-autoload
  - Env: https://github.com/fastify/fastify-env
  - JWT: https://github.com/fastify/fastify-jwt
  - Multipart: https://github.com/fastify/fastify-multipart
  - Sensible: https://github.com/fastify/fastify-sensible
  - Swagger: https://github.com/fastify/fastify-swagger
  - Swagger UI: https://github.com/fastify/fastify-swagger-ui
- **Prisma**
  - https://www.prisma.io/docs
  - https://www.prisma.io/docs/orm/reference/prisma-schema-reference
  - https://www.prisma.io/docs/orm/reference/prisma-client-reference
- **TypeBox**
  - https://github.com/sinclairzx81/typebox

## 项目相关要点（建议 AI 参考）

- **入口与组织方式**
  - `src/app.ts` 提供可测试的应用工厂，`src/server.ts` 是进程入口；路由通过 `@fastify/autoload` 加载。
  - `GET /health` 是进程存活检查，`GET /health/ready` 是包含 PostgreSQL 查询的就绪检查。
- **Schema 与类型**
  - 使用 TypeBox + `@fastify/type-provider-typebox` 做校验/类型推断；新增接口时优先按现有模块模式添加 `schema`。
- **数据库**
  - Prisma 相关在 `prisma/` 目录；本地开发可用 `db:migrate`，生产只应用 `db:migrate:deploy`。`db:seed` 会清空核心业务表，仅在可丢弃数据库且显式设置 `ALLOW_DESTRUCTIVE_SEED=true` 时使用。
- **鉴权**
  - JWT 插件：`@fastify/jwt`；新增受保护路由通常通过 `preHandler` 或统一钩子实现。
  - 部署模式与公共能力开关由 `src/plugins/global/zzz-deployment.ts` 在启动时统一解析，并挂到 `fastify.deployment`。
  - `GET /auth/public-config` 会返回当前部署的公开能力，例如：是否开启账号密码登录、是否开启 Airalogy OAuth、是否开启机构登录、是否开启 AI Chat / 论文上传等。
  - `ENABLE_PAPER_UPLOAD=false` 不只是隐藏前端入口；后端也会同时拒绝 `POST /papers/create` 与 `POST /files/upload`。
  - 机构成员激活接口使用公开 `auth` 路由，当前支持基于激活令牌完成首次绑定/注册。
  - 机构 SSO 登录当前支持“首次成功认证后自动创建或匹配平台 `user`，并自动创建默认 `member` 级别机构成员关系”的 JIT provisioning。
  - 机构登录入口和接入更多机构的约定见 `docs/institution-auth.md`。
- **响应结构**
  - 响应必须符合路由声明的 TypeBox Schema；新增版本化业务接口使用 `{ code, data?, message? }`。
- **内容治理与审核**
  - 实验室主页权限与角色模型见 `docs/content-governance.md`。
  - 论文审核状态机、接口约束与设计动机见 `docs/paper-review-workflow.md`。
  - 学位论文的结构化版本、全文权限、专题展示和审核 API 见 `docs/degree-thesis-workflow.md`。
  - 普通论文和学位论文使用同一套 `content_review_*` 状态机、审核人快照和审计动作；新内容类型不应自建审核逻辑。
  - 机构组织结构快照、导入格式、岗位任职模型，以及基于组织节点解析审核流的规则见 `docs/institution-org-structure.md`。
  - 机构管理员预开通成员与首次激活规则同样见 `docs/content-governance.md`。
  - 机构成员论文作者绑定接口 `POST /institutions/:slug/paper-author-bindings`、`DELETE /institutions/:slug/paper-author-bindings/:bindingId` 的设计边界与约束见 `docs/content-governance.md`。
  - 机构成员论文统计口径，例如 `paperCount` 与 `approvedPaperCount` 的含义，见 `docs/paper-review-workflow.md`。
  - 多机构登录入口与认证方式扩展规则见 `docs/institution-auth.md`。
  - 如果要把当前系统交付为某一个机构的私有化部署版本，具体运行步骤、环境变量组合和初始化方式见 `docs/private-deployment.md`。
  - 机构组织结构接口 `GET /institutions/:slug/org-structure`、`PUT /institutions/:slug/org-structure`，以及论文上传时可选的 `review_node_id`，见 `docs/institution-org-structure.md`。
  - 公网版 / 私有版共用同一套后端代码，差别由环境变量中的部署模式与 feature flag 决定，而不是维护独立分支。
