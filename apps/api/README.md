# @airalogy/scholar-server

位于 `apps/api` 的 Fastify + Prisma + PostgreSQL 后端服务。

## 技术栈

- **Fastify 5** - 高性能 Web 框架
- **Prisma 7** - 现代 ORM
- **PostgreSQL** - 关系型数据库
- **TypeScript** - 类型安全
- **ES Modules** - 现代模块系统

## 开发

### 启动开发服务器

```bash
pnpm dev
```

服务运行在 `http://localhost:3000`

### 构建

```bash
pnpm build
```

### 生产环境运行

```bash
pnpm start
```

## 数据库

### 环境配置

复制 `.env.example` 为 `.env` 并配置数据库连接：

```bash
DATABASE_URL="postgresql://user:password@localhost:5432/dbname"
```

### Prisma 命令

```bash
# 推送数据库结构（开发环境）
pnpm db:push

# 生成迁移文件
pnpm db:migrate

# 在测试、预发布或生产环境应用已有迁移
pnpm db:migrate:deploy

# 校验 Schema 与迁移状态
pnpm db:validate
pnpm db:migrate:status

# 打开 Prisma Studio
pnpm db:studio

# 仅对可丢弃数据库执行示例种子（会先清空业务表）
ALLOW_DESTRUCTIVE_SEED=true pnpm db:seed
```

## 项目结构

```
src/
├── app.ts                # 可测试的 Fastify 应用工厂
├── server.ts             # 监听端口与优雅退出的进程入口
├── plugins/              # 全局与应用级插件
├── routes/               # 按领域拆分的路由模块
└── utils/                # 通用工具
prisma/
├── schema.prisma         # 数据库模型定义
└── seed.ts               # 数据库种子文件
```

## 代码质量

```bash
# Lint 检查（不修改文件）
pnpm lint

# Lint 自动修复
pnpm lint:fix

# 代码格式化
pnpm fmt

# TypeScript 类型检查
pnpm type-check
```

## API 文档

直接启动 API 后访问 `http://localhost:3000/docs`；经前端反向代理访问时使用 `/api/docs`。

普通对话与学者推荐统一使用 `POST /chat`。不传 `mode` 时为普通对话；学者推荐传入 `mode: "scholar_recommendation"`，后端会从 `scholar_embeddings` 检索候选论文和学者。两种模式均复用登录鉴权与 SSE 协议，但会话历史相互隔离。

`GET /health` 只验证 API 进程存活；`GET /health/ready` 还会执行 PostgreSQL 查询，数据库不可用时返回 `503`。容器就绪和负载均衡检查应使用后者。

## 环境变量

| 变量名                               | 说明                                            | `.env.example` 示例值 |
| ------------------------------------ | ----------------------------------------------- | --------------------- |
| `NODE_ENV`                           | 运行环境：`development` / `test` / `production` | `development`         |
| `LOG_LEVEL`                          | Fastify / Pino 日志级别                         | `info`                |
| `TRUST_PROXY`                        | 明确信任的反向代理配置；未配置时不信任转发头    | 空                    |
| `DEPLOYMENT_MODE`                    | 部署模式：`public` / `private`                  | `public`              |
| `STORAGE_PROVIDER`                   | 文件存储驱动：`oss` / `local`                   | `local`（示例配置）   |
| `LOCAL_STORAGE_DIR`                  | `STORAGE_PROVIDER=local` 时的本地存储目录       | `data/uploads`        |
| `ENABLE_PASSWORD_SIGNIN`             | 是否启用账号密码登录                            | `true`                |
| `ENABLE_PUBLIC_SIGNUP`               | 是否启用公开注册接口                            | `false`               |
| `ENABLE_AIRALOGY_OAUTH`              | 是否启用 Airalogy OAuth 登录                    | `false`（示例配置）   |
| `ENABLE_INSTITUTION_LOGIN`           | 是否启用机构登录入口                            | `false`               |
| `ENABLE_INSTITUTION_PROVISION_LOGIN` | 是否启用机构激活令牌                            | `false`               |
| `INSTITUTION_SSO_ENABLED`            | 是否启用机构统一身份认证                        | `false`（示例配置）   |
| `ENABLE_AI_CHAT`                     | 是否启用 AI Chat 能力                           | `false`（示例配置）   |
| `ENABLE_PAPER_UPLOAD`                | 是否启用论文上传入口                            | `true`                |
| `ENABLE_FORUM`                       | 是否启用论坛接口                                | `true`                |
| `PUBLIC_APP_NAME`                    | 前端公开展示的应用名称                          | `Airalogy Scholar`    |
| `SHOW_BRAND_LOGO`                    | 是否显示 Airalogy 主品牌 logo                   | `true`                |
| `SHOW_INSTITUTION_LOGO`              | 是否显示机构 logo / 水印                        | `false`               |
| `PUBLIC_BRAND_LOGO_URL`              | 可选的品牌 logo HTTP(S) / 同域路径              | 空                    |
| `PUBLIC_INSTITUTION_LOGO_URL`        | 部署方授权的机构 logo HTTP(S) / 同域路径        | 空                    |
| `PUBLIC_INSTITUTION_WATERMARK_URL`   | 部署方授权的机构水印 HTTP(S) / 同域路径         | 空                    |
| `DATABASE_URL`                       | PostgreSQL 连接字符串                           | -                     |
| `SCHOLAR_IMPORT_INSTITUTION_NAME`    | 本地源数据同步命令的目标机构名称                | 空                    |
| `ALLOW_DESTRUCTIVE_SEED`             | 是否允许清空业务表并写入示例数据                | `false`               |
| `OPENAI_BASE_URL`                    | 模型 API Base URL，启用 AI Chat 时必填          | -                     |
| `OPENAI_API_KEY`                     | 模型 API Key，启用 AI Chat 时必填               | -                     |
| `OPENAI_EMBEDDING_MODEL`             | 论文与学者检索使用的嵌入模型                    | `text-embedding-v4`   |
| `CHAT_MODEL`                         | 普通对话与学者推荐使用的对话模型                | `qwen3.5-plus`        |
| `OSS_ENDPOINT`                       | `STORAGE_PROVIDER=oss` 时的 OSS Endpoint        | -                     |
| `OSS_ACCESS_KEY_ID`                  | `STORAGE_PROVIDER=oss` 时的 Access Key ID       | -                     |
| `OSS_ACCESS_KEY_SECRET`              | `STORAGE_PROVIDER=oss` 时的 Access Key Secret   | -                     |
| `OSS_BUCKET`                         | `STORAGE_PROVIDER=oss` 时的 Bucket 名称         | -                     |
| `PORT`                               | 服务端口                                        | 3000                  |
| `HOST`                               | 服务主机                                        | 0.0.0.0               |

机构 SSO 开启时还需要配置 `INSTITUTION_LOGIN_INSTITUTION_SLUG` 以及完整的
`INSTITUTION_SSO_*` 身份服务地址、客户端凭证和用户字段映射。完整配置及首次登录的
账号绑定规则见 [机构登录与统一身份认证](../../docs/institution-auth.md)。

### 私有化部署建议

如果需要快速落地私有化部署，优先采用“同代码 + 配置切换”的方式，而不是维护独立分支。例如：

```bash
DEPLOYMENT_MODE=private
STORAGE_PROVIDER=local
ENABLE_AIRALOGY_OAUTH=false
ENABLE_PUBLIC_SIGNUP=false
SHOW_BRAND_LOGO=false
```

如果机构希望只保留本机构统一身份认证，也可以进一步关闭不需要的能力，例如 AI Chat、激活令牌或论文上传。

如果是单机本地版，不接阿里云 OSS，可以切换为：

```bash
STORAGE_PROVIDER=local
LOCAL_STORAGE_DIR=/var/lib/scholar/uploads
```

正式部署优先使用根目录 `deploy/` 中的固定版本镜像与 Compose，不要从服务器源码目录直接启动 API。机构标志属于部署方资产，应通过 URL 配置提供，不应复制进通用源码。

启用 `ENABLE_INSTITUTION_LOGIN=true` 时，至少还需要保留一种机构登录方式，例如 `INSTITUTION_SSO_ENABLED=true` 或 `ENABLE_INSTITUTION_PROVISION_LOGIN=true`。启用 `ENABLE_PAPER_UPLOAD=false` 时，前端上传入口和后端上传接口都会同时关闭。

## 相关文档

- [Fastify 文档](https://www.fastify.io/)
- [Prisma 文档](https://www.prisma.io/docs/)
- [TypeScript 文档](https://www.typescriptlang.org/)
- [单机构私有化部署说明](../../docs/private-deployment.md)
