# Airalogy Scholar

[English](./README.md) | 简体中文

面向学术场景的机构论文库、学者信息、研究时间线、检索与问答系统（Monorepo）。

## 当前项目状态

- 后端（`apps/api`）
  - Fastify + Prisma + PostgreSQL 基础服务
  - JWT 登录鉴权（`/auth/signup`、`/auth/signin`）
  - 论文相关接口（上传、列表、详情、更新、删除、搜索）
  - 聊天接口（普通回复 + SSE 流式回复）
  - OSS 文件上传与预览链接接口
  - Swagger 文档页：`/api/docs`
  - 普通 AI 对话与基于 PostgreSQL/pgvector 的学者推荐

- 前端（`apps/web`）
  - Vue 3 + Vite + Arco Design 基础框架
  - 页面路由与主要视觉页面结构（AI 聊天、论文列表、学者页等）

- 文档站（`apps/docs`）
  - VitePress 中英文对照的面向用户产品文档
  - 覆盖机构批量导入、鉴权、管理后台与 OpenAPI
  - 随 Web 镜像和 Scholar 产品版本一起交付

## 仓库结构

```text
.
├── apps/
│   ├── api/    # Fastify + Prisma 后端
│   ├── docs/   # VitePress 面向用户的中英文产品文档
│   └── web/    # Vue 3 + Vite 前端
├── docker/
├── deploy/       # 版本化镜像、Compose、备份与离线交付工具
├── docs/         # 面向部署运维、开发者与仓库维护者的文档
├── package.json
└── pnpm-workspace.yaml
```

## 开发环境要求

- Node.js 22.23.0（最低支持 22.9.0）
- pnpm 10.33
- Docker（用于运行 PostgreSQL + pgvector）

## 安装依赖

在仓库根目录执行：

```bash
pnpm install
```

`pnpm install` 负责安装 `apps/web`、`apps/api` 与 `apps/docs` 的 Node 依赖。

## 后端配置（apps/api）

后端通过环境变量启动。请复制 `apps/api/.env.example` 为 `apps/api/.env` 并根据实际环境修改。

AI 对话与学者推荐都由 `apps/api` 提供。启用时需在 `apps/api/.env` 配置 `OPENAI_BASE_URL`、`OPENAI_API_KEY`、`CHAT_MODEL` 和 `OPENAI_EMBEDDING_MODEL`。

## 本地开发数据库

数据库通过 Docker Compose 运行，使用固定摘要的 PostgreSQL 17 + pgvector 镜像，已内置 `pgvector` 与 `pg_trgm` 扩展。

```bash
cd docker/database
cp .env.example .env   # 按需修改数据库账号密码
docker compose up -d
```

## 数据库初始化

首次运行需依次执行：

```bash
# 生成 Prisma Client
pnpm db:generate

# 按顺序应用已审查的数据库迁移（包括 vector、pg_trgm 扩展）
pnpm db:migrate:deploy

# 可选：仅向可丢弃的开发数据库写入示例数据（会先清空业务表）
ALLOW_DESTRUCTIVE_SEED=true pnpm db:seed
```

## 开发运行

### 方式一：在根目录同时启动 Web 和 API

```bash
pnpm dev
```

- 后端默认：`http://localhost:3000`
- 前端默认：`http://localhost:5173`
- 文档站中文：`http://localhost:5174/docs/zh/`
- 文档站英文：`http://localhost:5174/docs/en/`

### 方式二：分别启动

后端：

```bash
pnpm --filter @airalogy/scholar-server dev
```

前端：

```bash
pnpm --filter @airalogy/scholar-web dev
```

文档站：

```bash
pnpm --filter @airalogy/scholar-docs dev
```

## 当前接口概览（后端）

- **认证**：`/auth/signup`、`/auth/signin`、OAuth / 机构 SSO（`/auth/airalogy/authorize`、`/auth/institution-sso/authorize`）
- **机构**：`/auth/institutions`、`/auth/institution-provisions/:token`
- **论文**：`/papers/create`、`/papers`、`/papers/:id`、`/papers/search`、`/papers/my`、`/papers/review-queue`
- **对话**：`/chat`、`/chat/:id`（支持普通回复 + SSE 流式回复）
- **论坛**：`/forum/papers/:paperId/posts`、`/forum/posts/:postId/comments`
- **书签**：`/bookmarks`
- **用户**：`/users`
- **学者**：`/scholars`
- **作者**：`/authors`
- **实验室**：`/labs`
- **机构**：`/institutions`
- **文件**：`/files/upload`、`/files/preview/:id`
- **版本**：`/version`
- **产品文档**：`/docs/zh/`、`/docs/en/`
- **OpenAPI / Swagger**：`/api/docs`、`/api/docs/json`

接口默认需要 Bearer Token。只有在路由配置中显式标记的登录、公开配置、版本、文件访问与 Swagger 文档接口可以匿名访问；`/auth/*` 不会再因为路径前缀而整体公开。

## 常用脚本

根目录：

```bash
pnpm dev
pnpm build
pnpm lint
pnpm type-check
pnpm test
pnpm check
pnpm license:check
pnpm db:push
pnpm db:migrate
pnpm db:migrate:deploy
pnpm db:migrate:status
pnpm db:validate
pnpm db:audit:integrity
pnpm db:studio
pnpm db:seed
pnpm version:check
```

`pnpm db:seed` 会清空核心业务表，只有显式设置 `ALLOW_DESTRUCTIVE_SEED=true` 才会执行；不得对生产数据库使用。

## 版本与生产发布

- [VERSION](./VERSION) 是仓库级目标版本，API 与 Web 使用同一个产品版本。
- 产品文档站使用同一个版本号，并随 Web 镜像发布；不允许把不同版本的文档、Web 与 API 自由组合。
- [English Changelog](./CHANGELOG.md) 是默认变更日志，[中文变更日志](./CHANGELOG.zh-CN.md) 是对应中文版；两份文件必须保持版本号和变更项一致。
- `pnpm version:check` 会检查 `VERSION`、各子项目元数据和两份变更日志是否一致。
- API 构建会生成 `dist/build-info.json`，`GET /version` 返回实际运行的版本、Git Tag、Git 提交、构建时间和工作区状态。
- 正式 Release 会生成 `release-manifest.json` 和 `release-manifest.env`，把产品版本、Git 提交、数据库迁移以及 API、Web、PostgreSQL 镜像摘要绑定为一个不可混搭的发布集合。
- `GET /health` 用于进程存活检查，`GET /health/ready` 会同时验证 PostgreSQL 可用性；发布和负载均衡应使用后者决定是否接流量。
- 正式发布应使用与 `VERSION` 一致的 Git Tag，例如 `v3.0.0`，并使构建产物或镜像使用相同版本号。
- 如果需要为历史生产版本补标签，必须先核对线上实际 Git 提交，不能根据 `package.json` 推测。
- 维护者发布步骤见[发布流程](./docs/zh/releasing.md)。

一次生产升级应按以下顺序进行：

1. 确认当前生产 `/version` 和目标版本。
2. 阅读对应版本的中文或英文变更日志，确认不兼容变更、数据库迁移和回滚条件。
3. 执行版本一致性检查、测试、类型检查和构建。
4. 为发布提交创建 Git Tag，由 Release 工作流同时构建 API 与 Web、汇总镜像摘要并启动完整产品组合烟测。
5. 使用生成的部署包整体升级；`scholarctl` 会在迁移前校验发布清单和镜像标签，并在部署后核对 `/version`。

## 生产部署

生产环境不应从 Git 工作区直接运行，也不应依赖服务器手工 `git pull` 或 `tmux`。仓库提供 `deploy/` 发布包，使用固定版本的 API、Web 与 PostgreSQL/pgvector 镜像：

```bash
cp deploy/.env.example deploy/.env
# 编辑镜像地址、数据库、JWT、机构 slug 和功能开关
deploy/scholarctl preflight
deploy/scholarctl install
deploy/scholarctl bootstrap
```

默认只把 Web 绑定到 `127.0.0.1:8080`，由部署方现有的 HTTPS 反向代理对外提供服务。中国大陆或断网环境不依赖 Docker Hub：可把全部镜像同步到阿里云 ACR、腾讯云 TCR 或校内 Harbor，并在 `deploy/.env` 中替换镜像地址；也可以通过 `deploy/export-images.sh` / `deploy/import-images.sh` 交付离线镜像包。

Scholar 以一个产品版本整体交付；Web、API、迁移任务和可选 PostgreSQL 是该产品内部的独立服务，不作为可自由组合的版本分别交付。应用升级只替换发布清单指定的镜像。PostgreSQL、上传文件和备份由部署方持有，并通过 Docker volume、宿主机目录或外部数据库/对象存储持续保留。完整说明见[私有化部署说明](./docs/zh/private-deployment.md)。

正式部署后，机构管理员和系统集成人员可从 `/docs/zh/` 或 `/docs/en/` 阅读与当前产品版本一致的中英文指南，并在页面中切换语言；`/docs/` 默认进入中文版。`/api/docs` 提供当前 API 的 Swagger 文档。面向用户的文档站不收录部署、运维、仓库架构或开发流程；这些资料保留在仓库[中文维护文档](./docs/zh/README.md)中，并另有[英文版本](./docs/en/README.md)。文档静态文件包含在 Web 镜像中，因此校内镜像和离线交付无需额外连接公共文档服务。

## 开源与安全

- 许可证：[Apache License 2.0](./LICENSE)
- 归属说明：[NOTICE](./NOTICE)
- 商标与品牌边界：[TRADEMARKS.md](./TRADEMARKS.md)
- 品牌与演示素材说明：[ASSETS.md](./ASSETS.md)
- 安全问题报告：[SECURITY.md](./SECURITY.md)
- 贡献规范：[CONTRIBUTING.md](./CONTRIBUTING.md)
