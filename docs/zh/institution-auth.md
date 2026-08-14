# 机构登录与统一身份认证

[English](../en/institution-auth.md) | 简体中文

本文档说明 Airalogy Scholar 的通用机构登录模型。任何大学或研究机构都应通过部署配置和机构数据接入，不在产品源码中增加机构专属分支、名称或路由。

单机构私有化部署的安装、初始化与升级流程见[私有化部署](./private-deployment.md)。

## 账号与机构身份

- `users` 是全平台唯一的用户账号。
- `user_external_identities` 保存身份提供方与外部唯一 ID 的映射。
- `institution_memberships` 表示用户在某机构中的成员身份和角色。
- `institution_user_provisions` 表示机构管理员预开通及用户激活过程。

同一个人不应因加入多个机构而生成多个 `user`。外部身份映射和机构成员关系分开存储，以便未来接入多个身份提供方。

## 登录方式

`GET /auth/institutions` 返回当前部署开放的机构及 `allowedMethods`：

- `provision_token`：机构管理员预开通后，用户通过激活令牌进入。
- `platform_account`：使用已有平台账号。
- `sso`：跳转到机构统一身份认证服务。

当只有一个机构时，前端直接展示该机构的登录方式；当未来支持多机构时，先选择机构，再展示其允许的方式。前端不写死机构名称、认证地址或成员规则。

## 通用 SSO 配置

当前通用适配器支持 OAuth 2.0 Authorization Code 流程。开启时需要同时设置：

```dotenv
ENABLE_INSTITUTION_LOGIN=true
INSTITUTION_SSO_ENABLED=true
INSTITUTION_SSO_TYPE=oauth2
INSTITUTION_SSO_PROVIDER_ID=institution-sso
INSTITUTION_SSO_DISPLAY_NAME=Institution Single Sign-On
INSTITUTION_LOGIN_INSTITUTION_SLUG=example-university
INSTITUTION_SSO_AUTHORIZATION_URL=https://identity.example.edu/oauth/authorize
INSTITUTION_SSO_TOKEN_URL=https://identity.example.edu/oauth/token
INSTITUTION_SSO_USERINFO_URL=https://identity.example.edu/oauth/userinfo
INSTITUTION_SSO_CLIENT_ID=scholar
INSTITUTION_SSO_CLIENT_SECRET=replace-with-provider-secret
INSTITUTION_SSO_REDIRECT_URI=https://scholar.example.edu/institution_sso_callback
INSTITUTION_SSO_SCOPE=basic
INSTITUTION_SSO_EXTERNAL_ID_FIELD=sub
INSTITUTION_SSO_EMAIL_FIELD=email
INSTITUTION_SSO_NAME_FIELD=name
INSTITUTION_SSO_USERINFO_TOKEN_MODE=bearer
```

说明：

- `INSTITUTION_SSO_PROVIDER_ID` 和外部 ID 组成全局唯一身份映射，投产后不应随意修改。
- `INSTITUTION_LOGIN_INSTITUTION_SLUG` 指向数据库中已存在的 `institutions.slug`；私有部署留空时使用 `PRIVATE_INSTITUTION_SLUG`。
- 用户信息字段支持点分路径，例如 `profile.email`。
- `INSTITUTION_SSO_USERINFO_TOKEN_MODE=bearer` 通过 `Authorization: Bearer` 传递令牌；仅当身份服务要求查询参数时使用 `query`。
- 生产回调地址必须精确指向 `/institution_sso_callback`。

## SSO 首次登录

1. 后端验证 state，交换 access token 并读取用户信息。
2. 使用 `provider + externalId` 查找 `user_external_identities`。
3. 若外部身份已映射，登录对应的平台用户。
4. 若尚未映射但同邮箱账号已是该机构成员，将已验证的外部身份绑定到该账号。
5. 否则创建新的平台账号和外部身份映射。
6. 创建或补齐 `institution_memberships`，默认角色固定为 `member`。

SSO 只证明用户通过了机构身份认证，不自动授予 `owner`、`admin`、论文审核或数据导入权限。高权限继续通过预开通、机构管理或审批链路授予。

## 访问边界

- 公开接口只暴露机构名称、登录方式、SSO 展示名称和授权入口。
- 不公开成员列表、预开通记录、审核范围或后台权限。
- 公网版仅允许用户切换到自己已绑定的机构论文库。
- 私有版通过 `PRIVATE_INSTITUTION_SLUG` 固定默认论文库，不公开其他机构。

## 成员离开机构

成员离开时不删除平台 `user`，而是撤销对应的 `institution_memberships` 和该机构下的 `lab_memberships`。撤销后用户失去该机构后台、私有内容和实验室管理权限。若用户是某实验室最后一名 `owner`，必须先完成角色交接。

## 新增协议适配器

当新机构使用当前 OAuth 2.0 适配器无法表达的协议时，新适配器应：

1. 使用通用 provider ID，不以机构名称命名源码文件、路由或环境变量。
2. 复用 OAuth state 签名、安全 `returnTo` 和回调响应帮助函数。
3. 统一写入 `user_external_identities`，不在 `users` 表新增某机构专属字段。
4. 默认只建立 `member` 级成员关系。
5. 在正式发布前补齐配置验证、回调失败、重复身份和首次登录测试。

机构名称、校徽、水印、客户域名和真实身份提供方参数都属于部署数据，不提交到通用源码仓库。
