# Airalogy Scholar 发布流程

[English](../en/releasing.md) | 简体中文

Airalogy Scholar 作为一个完整产品发布，内部由独立运行的 Web、API、迁移任务和可选 PostgreSQL 服务组成。每次发布必须把这些组件绑定到同一个经过验证的产品版本和不可变镜像摘要。

## 发布要求

- 使用干净的 `main` 提交，并确保全部必需检查通过。
- 每次提交使用 `git commit -s` 签署开发者原创声明（DCO）。
- 保持 `VERSION`、各包版本以及中英文 Changelog 一致。
- 审查数据库迁移、兼容性说明、存储要求和回滚条件。
- 不得把部署凭证、机构数据、私有地址或客户专属素材加入仓库或发布包。

## 验证发布源码

创建标签前运行标准仓库检查：

```bash
pnpm install --frozen-lockfile
pnpm audit:prod
pnpm release:source:manifest
pnpm check
pnpm release:check
```

本地 pre-push、CI 和 Release 共用 `pnpm check`，包含依赖许可证校验；pre-push 还会执行生产依赖安全审计。若要在本地同时执行隔离的书目数据库测试，须显式设置 `BIBLIOGRAPHY_TEST_DATABASE_URL`，指向可丢弃的测试数据库；未配置时会明确提示跳过。CI 与 Release 始终执行数据库校验，云端容器构建和镜像发布仍是独立检查环节。本地检查通过不等于正式发布一定成功。

如需从零验证，提供一个可丢弃的 PostgreSQL schema。验证器会删除并重建指定 schema，因此绝不能指向需要保留的数据。

```bash
RELEASE_SOURCE_DATABASE_URL='postgresql://.../scholar?schema=release_source' \
  pnpm release:source:verify
```

清单命令会原样保留已发布的初始迁移与全部增量迁移，扫描形似凭证的内容，校验 Changelog 基线，并在 `RELEASE-SOURCE-MANIFEST.json` 中记录文件的实际摘要。不得重新生成或替换已发布迁移。发布源码检查会在已提交清单与当前源码不一致时失败，包括迁移文件变动。

CI 同时验证空库和含已有机构身份、论文绑定的升级样例。需要单独运行升级验证时，设置 `DATABASE_URL` 后执行 `pnpm db:verify:upgrade`；它使用随机命名的 schema，并在同一连接中整体回滚样例和迁移。

## 创建发布

1. 在 `VERSION`、包元数据、`CHANGELOG.md` 和 `CHANGELOG.zh-CN.md` 中设置最终版本与日期。
2. 在干净的发布提交上运行 `pnpm release:check`。
3. 创建与 `VERSION` 完全一致的附注标签 `vX.Y.Z`。
4. 推送标签并等待 Release 工作流完成。

使用已登录的 GitHub CLI 查询已有运行：

```bash
gh run list --workflow release.yml --limit 5
pnpm ci:watch RUN_ID --repo airalogy/scholar
```

将 `RUN_ID` 替换为准确对应此次发布标签的运行编号。查询工具只读取状态，不会重启工作流或执行发布；默认每 15 秒查询一次，最多等待一小时。临时网络错误最多连续重试三次，逐次延长间隔；认证或权限错误不重试。可通过 `--interval SECONDS` 和 `--timeout SECONDS` 调整等待时间。退出码分别表示确认成功（`0`）、确认未成功，例如失败或取消（`1`）、因查询错误或超时而无法确认结果（`2`）。遇到 `2` 应重新查询同一运行或查看 GitHub 页面，不要认定发布失败或重新推送标签。

该工作流会：

- 重复执行数据库、源码、许可证、lint、类型、测试与构建校验；
- 构建 `linux/amd64` 和 `linux/arm64` 的 API 与 Web 镜像；
- 为每个镜像发布 SBOM 和构建来源证明；
- 在发布清单中记录不可变镜像摘要；
- 对准确的发布版 Compose 配置执行烟测；
- 发布部署归档、校验和与机器可读清单。

发布标签不可移动。如果已发布版本存在缺陷，应在 `main` 修复后发布新的补丁版本，不得移动或复用原标签。

## 发布后验证

- 确认 GitHub Release 已发布，且包含部署归档、校验和、JSON 清单和环境变量清单。
- 确认 `ghcr.io/airalogy/scholar-api:X.Y.Z` 与 `ghcr.io/airalogy/scholar-web:X.Y.Z` 可公开拉取并与记录摘要一致。
- 在空环境安装发布版本，验证 `/healthz`、`/api/version`、`/docs/en/`、`/docs/zh/` 和 `/api/docs/json`。
- 保持 `main` 必须通过 PR 和必要检查，使用线性历史，并禁止强推和删除。
- 保持 Dependabot alerts、secret scanning、push protection 和 private vulnerability reporting 开启。
