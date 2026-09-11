# 机构身份与统一身份认证

[English](../en/institution-auth.md) | 简体中文

Airalogy Scholar 的每个部署实例或托管租户只服务一个机构。机构名称、身份服务地址、内部编号、校徽与真实数据都属于部署数据，不写死在通用源码中。

安装、初始化与升级见[部署说明](./deployment.md)。

## 身份模型

登录账号、机构身份和学者档案是三个不同概念：

- `users` 是登录账号。一个人可以先存在于机构名录中，之后才首次登录并创建账号。
- `institution_people` 是机构权威的人员记录。每人只有一个规范内部 ID（如工号或学号），并可分别关联 `user`、`scholar` 和激活预开通记录。
- `institution_person_identifiers` 在机构内统一保存主编号和经管理员核验的附加编号，记录撤销状态及登录凭证版本。
- `user_external_identities` 保存身份服务的登录映射。
- `institution_memberships` 保存角色和独立授权。
- `scholars` 是对外展示的学者档案，不是登录账号。

机构内部 ID 在当前机构内唯一，比较时不区分大小写，展示时保留原始写法。不应由邮箱、姓名、年份、学位层次或组织单位推导该 ID。Scholar UUID 和 user UUID 仍是平台内部技术标识，不替代机构 ID。

机构可以使用多种认证协议。每个已验证编号都必须通过主编号或经核验的附加编号，定位到同一机构人员。邮箱只是联系方式，不能自动重新绑定人员身份。

## 同一人拥有多个学号或工号

同一个人可能保留旧学号，又获得新学号或工号。系统保留原机构人员、用户账号、Scholar UUID、主编号、成员权限和论文绑定，新增经独立核验的附加编号，不按姓名或邮箱合并账号，也不替换主编号。新旧有效编号都能登录原账号；数据导入和论文作者绑定也支持有效的附加编号。

机构 owner 和平台管理员在**管理后台 → 机构 → 成员**处理编号及身份核验申请。普通 admin、获授权的导入或内容审核成员无此权限。机构 owner 不能修改平台管理员的编号；管理员自己的附加编号也须由另一位有权管理员核验。处理时必须明确选择目标人员，依据学校权威记录核实并记录依据。姓名、邮箱相同只能作为线索，不能作为充分证据。

学校 SSO 已认证成功但平台绑定冲突时，接口返回 `409`、原因 `institution_identity_conflict` 和有效期 15 分钟的随机核验凭据。该凭据只能用于 `POST /auth/institution-identity-requests` 和 `POST /auth/institution-identity-requests/status`，不是登录令牌。申请人声明旧账号属于本人，填写原编号和说明，只能查看自己的处理结果。SSO 认证失败或编号停用时不会签发该凭据。数据库只保存其哈希；浏览器按标签页临时保存，不放入 URL。

管理员可以通过、驳回或要求补充信息。通过申请只会向明确选定、已关联用户账号的人员增加编号，不提升权限，不合并不同人员或账号。内部核验依据写入审计记录，与反馈给申请人的说明分开保存。重复待处理申请和并发审核均有保护；同一已验证编号 24 小时内最多新建 3 次申请。凭据过期后重新统一登录，可以继续查看已有申请。

撤销编号后，该编号仍为原人员保留，不能分配给另一个人；恢复须再次核验，并递增编号版本。新签发的 SSO 登录凭证绑定实际登录编号及其版本，撤销立即使这些凭证失效，恢复不会使旧凭证重新生效。**升级前的 JWT 和密码登录凭证不含编号绑定，仍按原有效期工作**；撤销编号不等于撤销账号的所有会话。主编号可以保留展示但停止用于登录，其他已核验编号仍可正常使用。

迁移只补齐已有主编号，不推断附加编号。`pnpm db:verify:identity` 在本地测试数据库的随机临时 schema 中验证申请、权限、并发和撤销；`pnpm db:verify:upgrade` 验证原人员及论文绑定完整保留。两项测试均不会自动关联真实人员。

## 首次登录前预先绑定论文

有权管理员可先创建机构人员，再使用该人员的 Scholar 内部 UUID 或机构内部 ID，把论文中的某个作者绑定到该人。绑定直接指向 `institution_people`，因此不要求此人已经有用户账号。

当此人首次通过可验证的 SSO 或激活令牌登录时：

1. Scholar 读取并规范化机构内部 ID。
2. 将已存在的机构人员关联到已认证的用户。
3. 创建或修复默认 `member` 成员关系。
4. 该人账号中自动显示之前预先绑定的论文。

姓名和邮箱可作为管理员人工核对的提示，但不能证明身份。如果 user、scholar、预开通记录或内部 ID 之间发生冲突，系统返回冲突并要求管理员处理，不自动覆盖原绑定。

## 登录方式

`GET /auth/institutions` 返回当前配置机构及其 `allowedMethods`：

- `provision_token`：管理员预先创建机构人员和一次性激活记录。
- `sso`：浏览器跳转到机构统一身份认证服务。

账号密码登录在启用时仍属于平台登录方式，不作为单独的机构名录登录方式。管理员仍需将该账号绑定到规范机构人员，之后它才获得机构成员关系和预绑定论文。

前端只展示当前唯一机构已开启的登录方式，不让终端用户选择租户或机构数据作用域。

## 通用 SSO 配置

当前通用适配器支持 OAuth 2.0 Authorization Code：

```dotenv
ENABLE_INSTITUTION_LOGIN=true
INSTITUTION_SSO_ENABLED=true
INSTITUTION_SSO_TYPE=oauth2
INSTITUTION_SSO_PROVIDER_ID=institution-sso
INSTITUTION_SSO_DISPLAY_NAME=Institution Single Sign-On
INSTITUTION_SSO_AUTHORIZATION_URL=https://identity.example.edu/oauth/authorize
INSTITUTION_SSO_TOKEN_URL=https://identity.example.edu/oauth/token
INSTITUTION_SSO_USERINFO_URL=https://identity.example.edu/oauth/userinfo
INSTITUTION_SSO_CLIENT_ID=scholar
INSTITUTION_SSO_CLIENT_SECRET=replace-with-provider-secret
INSTITUTION_SSO_REDIRECT_URI=https://scholar.example.edu/institution_sso_callback
INSTITUTION_SSO_SCOPE=basic
INSTITUTION_SSO_INTERNAL_ID_FIELD=employee_id
INSTITUTION_SSO_EMAIL_FIELD=email
INSTITUTION_SSO_NAME_FIELD=name
INSTITUTION_SSO_USERINFO_TOKEN_MODE=bearer
```

- `INSTITUTION_SLUG` 指定当前实例唯一服务的机构。
- `INSTITUTION_SSO_INTERNAL_ID_FIELD` 必须指向工号、学号等机构内部恒定标识，支持 `profile.employee_id` 等点分路径。
- provider ID 与规范化内部 ID 共同构成外部登录映射。投产后不得在没有数据迁移的情况下改变其语义。
- 邮箱和姓名字段只是档案属性，不是身份主键。
- `bearer` 通过 `Authorization` 头传递 access token；只有身份服务强制要求时才使用 `query`。
- 生产回调地址必须精确指向 `/institution_sso_callback`。

## SSO 首次登录

1. 验证签名 state，交换 authorization code 并读取用户信息。
2. 读取并规范化机构内部 ID；缺失时拒绝登录。
3. 使用该 ID 查找机构人员和外部登录映射。
4. 若两者已有的 user 绑定不一致，立即拒绝并返回冲突。
5. 复用已绑定用户；没有任何绑定时才创建平台账号。
6. 在同一事务中绑定机构人员、外部身份与 user。
7. 创建或修复默认 `member` 成员关系。

SSO 成功只证明机构认证通过，不自动授予 `owner`、`admin`、内容审核或数据导入权限。

## 访问与生命周期边界

- `CONTENT_ACCESS_MODE=public` 仅允许匿名访问明确标记为公开且已审核的内容；`authenticated` 要求登录后访问机构论文库。
- 成员名录、内部 ID、预开通记录、审核范围、密钥和后台权限都不公开。
- 公开学者和论文接口不返回机构内部 ID。
- 移除成员关系只撤销权限，不删除平台账号、机构人员、学者档案或历史论文作者绑定。
- 新机构应创建独立部署实例或托管租户。跨机构人员合并不属于本仓库当前支持的产品模型。

## 新增认证协议适配器

新的 SSO 适配器必须：

1. 使用通用源码、路由和环境变量名称。
2. 复用已签名 state、安全 `returnTo` 和回调响应帮助函数。
3. 将身份解析为当前机构的规范内部 ID。
4. 在事务中统一写入 `user_external_identities` 和 `institution_people`。
5. 默认只建立 `member` 关系。
6. 测试缺失 ID、重复绑定、冲突绑定和首次登录后的论文可见性。

机构名称、校徽、客户域名和真实身份服务参数必须保留在源码仓库之外。
