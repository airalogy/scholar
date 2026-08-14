# Scholar 私有化部署

本文档说明如何把同一套 Scholar 发布版本部署到不同大学，并保证应用升级与机构数据相互独立。生产部署以一个经过整体验证的 Scholar 发布包为交付物，不以服务器 Git 工作区为运行单元。Web、API、迁移任务和可选数据库是产品内部组件，不分别选择或自由组合版本。

## 1. 应用与数据的边界

应用镜像是可替换的，业务数据是部署方持续持有的：

| 内容 | 默认位置 | 升级行为 |
|---|---|---|
| 学者、论文、机构、权限、年谱、任务 | PostgreSQL/pgvector | 保留原数据库并执行版本化迁移 |
| 上传的 PDF 等文件 | `scholar_uploads` volume | 保留；也可挂载宿主机目录或使用 OSS |
| 数据库备份 | `SCHOLAR_BACKUP_DIR` | 保留在宿主机，不进入镜像 |
| API 与 Web 程序 | 固定版本容器镜像 | 由新版本镜像替换 |
| 发布身份与升级记录 | `deploy/release-manifest.*`、`SCHOLAR_STATE_DIR` | 持续保留，用于核验与恢复决策 |
| 日志 | 容器标准输出 | 交给 Docker、journald 或机构日志平台收集 |

默认 PostgreSQL 和上传文件使用 Docker named volume。若机构希望直接管理目录，可设置：

```dotenv
SCHOLAR_POSTGRES_STORAGE=/srv/scholar-data/postgres
SCHOLAR_UPLOADS_STORAGE=/srv/scholar-data/uploads
SCHOLAR_BACKUP_DIR=/srv/scholar-data/backups
SCHOLAR_STATE_DIR=/srv/scholar-data/state
```

宿主机目录必须预先创建，并授予 PostgreSQL 容器和 API 容器正确的读写权限。部署目录可以放在 `/opt/scholar`，数据目录建议独立放在 `/srv/scholar-data`；更新或替换部署目录不会删除数据。

同一台服务器同时运行正式、预发布或多个机构实例时，必须为每套实例分别设置 `SCHOLAR_COMPOSE_PROJECT_NAME`、`SCHOLAR_POSTGRES_VOLUME_NAME`、`SCHOLAR_UPLOADS_VOLUME_NAME`、端口和备份目录，不得共用正式数据卷做升级验证。

如果学校已经提供受管 PostgreSQL，只需使用 `SCHOLAR_DATABASE_MODE=external` 并把 `DATABASE_URL` 指向该数据库。外部数据库必须启用 `pgvector` 与 `pg_trgm`，备份、可用性和灾难恢复由部署方数据库服务负责。

## 2. 发布拓扑

默认发布包包含：

- `web`：Caddy 静态站点及 `/api` 反向代理；
- `docs`：构建在 Web 镜像中的中英文 VitePress 文档，在 `/docs/zh/` 和 `/docs/en/` 提供面向用户的产品指南；
- `api`：Fastify 主后端和内置研究时间线任务器；
- `migrate`：每次启动新版本前执行一次 Prisma 迁移；
- `postgres`：可选的 PostgreSQL 17 + pgvector；
- `scholar_uploads`：本地文件持久卷。

发布包还包含两份由 Release 工作流生成的机器可读元数据：

- `release-manifest.json`：供审计、归档和第三方工具读取的完整产品清单；
- `release-manifest.env`：供 `scholarctl` 在不依赖 Node.js 或 `jq` 的服务器上执行同等校验。

二者将 Scholar 产品版本、Git Tag、完整 Git 提交、最新数据库迁移和 API/Web/PostgreSQL 镜像 SHA-256 摘要绑定为一个发布集合。正式部署使用 `镜像:版本@sha256:摘要`，不是只有版本标签。发布包不能使用另一版本的 Web、API 或离线镜像替换其中任一组件。

Web 默认监听 `127.0.0.1:8080`。生产环境应由机构现有的 Nginx、网关或负载均衡器终止 HTTPS，再转发到该端口。不要在 API 容器上直接暴露公网端口。

文档不是单独的容器或可自由选择的组件。Web 镜像同时包含应用前端和对应版本的面向用户文档站，`/docs/` 默认进入中文版，中英文路径分别为 `/docs/zh/` 和 `/docs/en/`。API 镜像继续在 `/docs` 提供 Swagger，经过 Web 网关后的公开路径为 `/api/docs`，OpenAPI JSON 为 `/api/docs/json`。离线镜像包包含同一个 Web 镜像，因此断网环境仍可查阅产品使用和系统接入文档。本文档所属的部署与运维资料仅保留在仓库和发布包中，不构建到面向用户的文档站。

## 3. 准备部署配置

从版本 Release 下载 `scholar-deploy-vX.Y.Z.tar.gz`，校验 `.sha256` 和 GitHub 来源证明后解压。复制配置：

```bash
cp deploy/.env.example deploy/.env
```

至少修改：

- `SCHOLAR_API_IMAGE`、`SCHOLAR_WEB_IMAGE`、`POSTGRES_IMAGE`；
- `POSTGRES_PASSWORD` 和 `DATABASE_URL`；
- `JWT_SECRET`（至少 32 个随机字符）；
- `DEPLOYMENT_MODE` 和 `PRIVATE_INSTITUTION_SLUG`；
- 登录方式、AI、上传、论坛和年谱开关；
- 本地文件或对象存储配置；
- 应用名称及经机构授权的品牌资源 URL。

正式 Scholar 产品部署模板默认启用 `ENABLE_AI_CHAT=true`，它同时控制独立 AI
问答页和论文详情右侧的 AI 阅读助手。部署前必须填写 `OPENAI_BASE_URL`、
`OPENAI_API_KEY`、`CHAT_MODEL` 和 `OPENAI_EMBEDDING_MODEL`；若学校本期不交付 AI
能力，可显式改为 `false`。源码开发模板和服务端代码默认值仍保持关闭，避免在未配置
模型凭证时误启动 AI 服务。

如果部署仅允许机构统一身份认证，设置
`ENABLE_INSTITUTION_LOGIN=true`、`INSTITUTION_SSO_ENABLED=true`，并关闭账号密码登录与公开注册。
身份服务地址、客户端密钥、用户字段映射和展示名称统一使用
`INSTITUTION_SSO_*` 配置，回调地址固定为 `/institution_sso_callback`。旧的机构专属变量与路由
不再接受；升级前必须把私有 `.env` 中的值迁移到新的通用变量。完整字段见
`docs/institution-auth.md` 和发布包内的 `deploy/.env.example`。

Release 包内的三个镜像地址已经带有经过验证的摘要，通常不应修改。如果将镜像同步到 ACR、TCR 或 Harbor，可以修改仓库域名和版本标签，但必须保留原来的 `@sha256:...`。`SCHOLAR_RELEASE_METADATA_REQUIRED=true` 是正式部署默认值；只有从源码进行本地开发验证时才可临时关闭，学校生产环境不得关闭。

`PUBLIC_INSTITUTION_LOGO_URL` 和 `PUBLIC_INSTITUTION_WATERMARK_URL` 可以是 HTTPS URL，也可以是 `/branding/...` 路径。部署包会把 `SCHOLAR_BRANDING_STORAGE`（默认 `deploy/branding`）只读挂载到 Web 容器；机构可在服务器本地放置已授权的图片，但学校名称、校徽和真实数据不应提交到 Scholar 源码仓库。

执行预检：

```bash
deploy/scholarctl preflight
```

预检会拒绝示例密钥、不完整的机构 SSO 配置、无版本的 `latest` 镜像、无效数据库模式和无法解析的 Compose 配置。

## 4. 联网、国内镜像与离线交付

容器运行格式是 OCI 标准；部署不依赖 Docker Hub 作为唯一镜像源。

联网交付可选择：

- GitHub Container Registry 作为上游发布源；
- 阿里云 ACR、腾讯云 TCR 作为中国大陆交付源；
- 学校内部 Harbor 作为校内唯一镜像源。

把三个镜像同步到目标仓库后，在 `.env` 中填写完整、固定版本的镜像地址，不使用 `latest`。如需完全离线交付，在可联网机器上执行：

在联网机器上按学校服务器架构导出（普通 x86 服务器使用 `linux/amd64`，鲲鹏等 ARM 服务器使用 `linux/arm64`）：

```bash
SCHOLAR_TARGET_PLATFORM=linux/amd64 deploy/export-images.sh
```

将生成的 `.tar.gz`、`.sha256`、`.platform`、`.images` 和 `.manifest.*` 一并复制到校内服务器，再执行：

```bash
deploy/import-images.sh deploy/scholar-images-vX.Y.Z.tar.gz
deploy/scholarctl install
```

导入脚本会强制校验所有随包文件的摘要、发布清单、服务器 CPU 架构以及它与当前 Scholar 部署包的对应关系，避免把 ARM 镜像交付到 x86 服务器（或反之），也避免把另一版本的离线镜像装入当前发布包。导入后在 `.env` 中设置 `SCHOLAR_OFFLINE=true`；安装过程会拒绝联网拉取，并验证本地镜像标签中的版本和 Git 提交。镜像包包含 `.env` 当前解析到的 API、Web 和数据库镜像，因此国内镜像与离线镜像使用的是同一版本集合。

一般学校服务器无需从源码构建。如果确需在中国大陆构建，`SCHOLAR_NODE_BUILD_IMAGE` 与 `SCHOLAR_CADDY_BUILD_IMAGE` 也可以指向 ACR、TCR 或校内 Harbor 中的基础镜像，Dockerfile 不强制连接 Docker Hub 的额外 frontend。

## 5. 首次安装

```bash
deploy/scholarctl install
deploy/scholarctl status
```

`install` 会依次验证发布清单、拉取固定摘要镜像（离线模式只检查本地镜像）、核对 API/Web 镜像标签、等待数据库就绪、执行全部数据库迁移、启动 API 和 Web、运行数据完整性审计，并确认 `/version` 的版本、Tag 和 Git 提交与清单完全一致。完成后会在 `SCHOLAR_STATE_DIR` 保存当前发布身份，不保存密码或其他密钥。

`install`、`upgrade`、`backup` 和 `bootstrap` 使用同一个部署操作锁，同一实例不能并发执行这些写操作，避免两个运维终端同时迁移或备份。

随后交互式创建首个机构和 owner：

```bash
deploy/scholarctl bootstrap
```

该命令不会把 owner 密码写入 `.env`。重复运行只会修复同一账号与机构的 owner 权限，不会覆盖已有账号密码。完成后保持 `ENABLE_PUBLIC_SIGNUP=false`。

## 6. 版本升级

升级前先阅读目标版本的中英文 Changelog，确认数据库迁移和回滚限制。推荐流程：

1. 记录当前 `deploy/scholarctl status` 与 `/version`；
2. 备份 PostgreSQL、上传文件及对象存储；
3. 解压目标 Scholar 发布包并迁移原 `.env` 中的机构配置与密钥；不要仅手工替换某一个镜像；
4. 执行 `deploy/scholarctl upgrade`；
5. 核对新的 `/version`、`/docs/`、`/api/docs/json`、服务健康、登录、论文访问和后台功能。

`upgrade` 会先校验清单、拉取并检查整套目标镜像，再记录旧版本、旧镜像和目标版本，随后停止旧 Web/API，在无新增写入的窗口内备份数据并执行迁移。bundled 模式会生成 PostgreSQL custom-format 备份；本地文件存储会通过一次性容器生成同一时间戳的上传目录 `.tar.gz`。若备份失败，脚本会重新启动原有 API/Web，且不执行迁移。external 模式不会擅自操作学校数据库备份；数据库管理员完成快照后，需要显式执行 `SCHOLAR_EXTERNAL_BACKUP_CONFIRMED=true deploy/scholarctl upgrade`。使用 OSS 时必须先完成服务商侧备份，并以 `SCHOLAR_OBJECT_STORAGE_BACKUP_CONFIRMED=true` 显式确认。

如果迁移、启动、完整性审计或发布身份核验失败，脚本不会冒险把旧 API 自动接回可能已经迁移的数据库，而会保留失败阶段、旧/新镜像、数据库备份和上传备份的对应记录。执行以下命令查看最新恢复依据：

```bash
deploy/scholarctl recovery
```

该记录不执行自动数据库降级，也不包含部署密钥；运维人员应依据 Changelog 的数据库兼容说明决定修复目标版本还是成对恢复数据库、上传文件和旧应用镜像。

升级完成后脚本会自动执行完整性审计。也可随时手工运行：

```bash
deploy/scholarctl backup
deploy/scholarctl audit
```

恢复时必须使用同一时间点的数据库和上传文件备份：先停止服务，将 `scholar-<timestamp>.dump` 恢复到 PostgreSQL，再把 `scholar-uploads-<timestamp>.tar.gz` 解压到配置的上传目录或数据卷。OSS 与 external PostgreSQL 的恢复由学校相应服务完成。不要只恢复数据库而遗漏与论文提交关联的上传文件。

数据库迁移记录保存在同一 PostgreSQL 的 `_prisma_migrations` 表中。迁移只更新数据结构，不创建一套新业务数据库。任何版本都不得在未备份的正式数据上运行破坏性 seed。

## 7. 回滚原则

应用镜像可以切回旧版本，但数据库结构不一定向后兼容。若 Changelog 明确说明旧 API 不能运行在新结构上，回滚必须同时：

1. 停止新版本服务；
2. 恢复升级前 PostgreSQL 备份和相应文件快照；
3. 把 `.env` 的镜像恢复为旧版本；
4. 重新启动并核对 `/version`。

因此 `scholarctl` 不提供一个可能误伤数据的“一键降级”命令，也不会在 `stop` 时删除 volume。

## 8. 运维要求

- 每个机构至少保留一个 owner；
- `ENABLE_PUBLIC_SIGNUP` 默认关闭；
- 生产只通过 HTTPS 访问；
- 系统凭证、JWT 密钥、OAuth 密钥和数据库密码不得写入 Git；
- 定期验证 PostgreSQL 备份可以恢复；
- 本地存储部署还应成对验证数据库与上传文件备份可以恢复；
- 对象存储需要独立的版本、备份或生命周期策略；
- 使用 `/health` 做存活检查、`/health/ready` 做就绪检查、`/version` 核对发布身份；`scholarctl status` 会自动按发布清单复验运行版本；
- 学校定制优先通过配置、机构数据和外部身份适配实现，不维护长期分叉源码。
