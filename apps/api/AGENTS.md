# AGENTS.md

本文件用于指导 AI 编码助手在本项目中的工作规范与约定。请在开始任务前阅读并遵守。

## 项目概览

- **技术栈**:
  - Runtime: Node.js >= 22.9（CI 使用 Node.js 22.23）
  - Language: TypeScript
  - Framework: Fastify (v5)
  - Database: PostgreSQL, Prisma (v7) + @prisma/adapter-pg
  - Validation: @fastify/type-provider-typebox
  - AI/LLM: OpenAI SDK
  - Storage: ali-oss
- **包管理**: pnpm
- **目录结构**:
  - `src/`: 应用源码
  - `prisma/`: 数据库模型定义与配置
- **鉴权**: @fastify/jwt

## 基本原则

- 以最小变更完成任务, 避免无关改动。
- 优先保持现有代码风格与约定, 遵循项目既有模式。
- 变更需可追溯: 代码应清晰、可读、可维护。
- 不确定时先询问或在提交前说明假设。
- 避免代码文件过长，必要时拆分为多个模块。

## 代码风格与约定

- **Fastify 插件化设计**: 路由、服务、插件分层清晰。
- **依赖注入**: 使用 `fastify-plugin` 封装插件，通过 Fastify 实例 (application context) 共享资源。
- **代码质量**:
  - 使用 `oxlint` 检查代码: `pnpm run lint` (配置: `.oxlintrc.json`)
  - 使用 `oxfmt` 格式化代码: `pnpm oxfmt path/filename.ts` (配置: `.oxfmtrc.json`), 请针对单个文件或者目录进行格式化，不要全局执行
- **格式规范**:
  - 2 空格缩进, 禁止 tab
  - 单引号, 模板字符串用反引号
  - 行尾无分号
- **TypeScript**:
  - 使用严格类型, 避免 `any`。
  - 优先使用 `async/await`。

## 目录与模块约定

- **`src/app.ts`**: 可测试的应用工厂，负责注册全局插件和路由。
- **`src/server.ts`**: 进程入口，负责监听端口和优雅退出。
- **`src/plugins/`**: Fastify 插件目录
  - `global/`: 全局插件 (如: `env.ts`, `prisma.ts`)，通常在 `app.ts` 最先加载。
  - `app/`: 应用级业务插件。
- **`src/routes/`**: 路由定义目录 (通过 `fastify-autoload` 加载)
  - 建议按领域分文件夹。每个模块通常包含:
    - `index.ts` (或 `routes.ts`): 路由定义
    - `service.ts`: 业务逻辑，当业务逻辑代码过长时，按功能模块拆分为多个文件
    - `schema.ts`: TypeBox Schema 定义
- **`src/utils/`**: 通用工具函数。
- **`prisma/`**:
  - `schema.prisma`: 数据库模型定义
  - `generated/`: 生成的 Prisma Client

## Prisma 与数据库规范

- 所有数据库访问通过 `fastify.prisma` (Prisma Client)。
- 尽量避免直写 SQL (复杂的操作除外)，关联数据尽量避免 n+1。
- 禁止一次性将大量数据取出然后在内存中进行过滤去重。
- 更改 `schema.prisma` 后:
  1. `pnpm prisma migrate dev`: 生成迁移文件并应用。
  2. `pnpm prisma generate`: 更新 Prisma Client 类型。
- Client 生成位置: `prisma/generated/`。

## 环境变量 (Environment Variables)

由 `src/plugins/global/env.ts` 定义与校验，主要包含:

- **Server**: `NODE_ENV`, `HOST`, `PORT`, `LOG_LEVEL`, `TRUST_PROXY`
- **Auth**: `JWT_SECRET`
- **Database**: `DATABASE_URL`
- **OpenAI**: `OPENAI_BASE_URL`, `OPENAI_API_KEY`
- **OSS**: `OSS_ENDPOINT`, `OSS_ACCESS_KEY_ID`, `OSS_ACCESS_KEY_SECRET`, `OSS_BUCKET`

## Fastify 约定

- **路由注册**: 遵循模块化, 防止 `app.ts` 臃肿。
- **Validation**: 必须使用 `typebox` 定义 Schema (`@fastify/type-provider-typebox`)。
- **Error Handling**: 统一错误处理逻辑 (已在 `app.ts` 配置setErrorHandler)。
- **Authentication**: 默认由全局 `onRequest` 钩子鉴权；公开路由必须显式声明 `config.publicRoute=true`，系统 JWT 只能访问显式允许的机构导入路由。
- **Health checks**: `/health` 仅表示进程存活，`/health/ready` 同时验证 PostgreSQL。

## 运行与脚本

- 安装依赖: `pnpm install`
- 开发环境: `pnpm dev`
- 生产构建: `pnpm build`
- 生产启动: `pnpm start`
- 数据库操作:
  - 迁移: `pnpm db:migrate`
  - 生产应用迁移: `pnpm db:migrate:deploy`
  - 校验迁移状态: `pnpm db:migrate:status`
  - 推送(不迁移): `pnpm db:push`
  - Studio: `pnpm db:studio`
  - Seed: `ALLOW_DESTRUCTIVE_SEED=true pnpm db:seed`（会清空业务表，仅用于可丢弃数据库）

## AI 助手工作流程

1. 明确需求与范围, 不确定时先提问。
2. 先阅读相关模块代码, 再提出修改方案。
3. 最小可行改动, 避免重构式提交。
4. 说明修改点与潜在影响。
5. 如无法完成测试, 明确说明未执行原因。

## 输出要求

- 提交前给出简要变更摘要。
- 若涉及 API 变更, 需说明影响范围与兼容性。
- 若新增环境变量, 必须说明用途与默认值。
