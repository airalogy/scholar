# Scholar 开源发布清单

本仓库已按 Apache License 2.0、版本化容器交付和机构数据隔离进行整理，但当前私有仓库不能直接切换为公开仓库。正式开源应创建经过审计的干净发布仓库。

## 公开前必须完成

1. 确认杭州渊楠科技有限公司对拟发布代码、文档和 Airalogy 品牌资产拥有相应权利。
2. 对历史贡献者完成著作权与贡献授权核对；无法确认的代码应重写或移除。
3. 扫描当前文件和完整 Git 历史中的密钥、账号、内网地址、个人信息、机构数据和真实研究数据。
4. 不把当前仓库的旧 Git 历史原样公开。通过经审计的源码快照建立新的公开历史，保留必要的作者归属说明。
5. 从最终通用 schema 生成干净的初始迁移基线，不把含有客户专属标识符的内部历史迁移复制到公开快照。
6. 确认任何客户机构的名称、校徽、截图、数据和部署配置均未进入公开快照。
7. 生成并审查第三方依赖和前端素材清单，确认其许可证允许当前分发方式；仓库自带素材同时核对 `ASSETS.md`。
8. 运行空库迁移、升级迁移、`pnpm check`、生产镜像构建、Compose 安装和离线导入烟测。
9. 确认 `CHANGELOG.md` 与 `CHANGELOG.zh-CN.md` 只从首次公开版本开始记录公开历史；发布时补充准确日期，并创建完全一致的 `vX.Y.Z` tag。

## 生成公开源码快照

当工作区已提交且 `pnpm check` 全部通过后，把当前已审计状态导出到一个全新目录：

```bash
node scripts/create-public-source-snapshot.mjs ../scholar-public
```

该命令会拒绝未提交工作区，排除全部内部升级迁移，从最终 Prisma schema 生成单一 `3.0` 初始迁移，扫描常见密钥形态，并写入带文件 SHA-256 的 `PUBLIC-SNAPSHOT-MANIFEST.json`。公开快照中的中英文 Changelog 只保留从 `3.0.0` 开始的公开发布历史。还可通过逗号分隔的 `PUBLIC_SNAPSHOT_FORBIDDEN_MARKERS` 传入不得公开的客户名称、域名和内部主机名；这些标记只应保存在私有发布环境，不应写入公开代码。新目录仍需人工复核资产和贡献归属，然后在其中建立新 Git 历史；不应向当前私有远程强制推送改写历史。

在一次性 PostgreSQL 数据库或独立空 schema 上验证实际导出的源码形态：

```bash
PUBLIC_SNAPSHOT_DATABASE_URL='postgresql://.../scholar?schema=public_snapshot' \
  pnpm public:snapshot:verify
```

该验证会在临时目录重新导出快照，按锁文件安装依赖，执行 Prisma 校验与生成、格式、lint、类型、全部测试、生产构建、构建产物烟测、初始迁移和数据完整性审计，最后删除临时目录。`PUBLIC_SNAPSHOT_DATABASE_URL` 必须指向非 `public` 的一次性 schema；验证器会先删除并重建该 schema，不得指向任何需要保留的数据。

## 私有归档仓库与公共仓库切换

1. 先完成最终私有分支合并、权利核对、敏感信息扫描和公开快照验证。
2. 将当前私有 `airalogy/scholar` 改名为 `airalogy/archived-scholar`，更新所有内部克隆和生产环境的 Git remote，再将其归档并继续保持私有。
3. 新建完全空白的公共 `airalogy/scholar`，不得使用 Fork、Template、Mirror，也不得推送私有仓库的 Git 对象。
4. 在审计后的快照中初始化新的 `main` 和 DCO 签署根提交，配置保护规则并等待 CI 通过。
5. 公共 3.x 使用 `scholar-api` 和 `scholar-web` 两个 GHCR 包；公开发布前必须删除同名私有 2.x 包，首次发布创建与新公共仓库关联的全新包，不得复用旧镜像。

GitHub 在仓库改名后提供的旧地址重定向，会在同名公共仓库建立后失效。任何仍指向 `airalogy/scholar.git` 的旧部署都可能连接到全新的无关历史，因此创建公共仓库前必须完成 remote 更新。

## 推荐的 GitHub 仓库设置

- 默认分支为 `main`；禁止强推和删除；
- 合并必须通过 Pull Request、至少一次审核、解决全部对话并通过 CI `verify`、`deployment-config` 和 `container-build`；
- 启用 Dependabot alerts、secret scanning、push protection 和 private vulnerability reporting；
- Actions 默认权限为只读，仅 release workflow 获得 packages、attestations 和 contents 写权限；
- 对 `v*` 标签设置保护规则，发布标签不得移动或复用；
- 启用不可变 Release（如果 GitHub 组织策略支持）；
- 包仓库公开前先核对 API 与 Web 镜像的可见性和下载权限；
- 不在公开 Issue 中处理学校内部故障、真实数据或安全漏洞。

## 发布后边界

Apache License 2.0 允许他人使用、修改和商业分发代码，也提供贡献者专利许可与专利诉讼终止条款。它不授予 Airalogy 商标，不要求杭州渊楠科技有限公司免费提供部署、迁移、培训、定制、运维、安全响应或 SLA。

大学部署中的数据、校徽、身份系统参数、域名证书和密钥归部署方控制。官方商业交付可以在同一开源代码之上提供国内镜像、离线包、SSO 适配、数据治理、升级验证和持续运维。
