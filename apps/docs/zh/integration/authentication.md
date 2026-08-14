# 鉴权与权限

批量导入不是公开写接口。每次请求都必须同时满足“调用主体有导入权限”和“目标机构与授权范围一致”。

## 用户账号

使用管理后台或用户 JWT 调用导入接口时：

- `platform_admin`、机构 `owner/admin` 默认可以导入。
- 普通 `member` 只有在成员设置中开启 `can_import_data` 后才能导入。
- 用户只能操作自己有权访问的机构。
- 数据导入权限与成员管理、论文审核等权限相互独立。

## 系统凭证

只有机构 `owner` 和 `platform_admin` 可以创建、轮换或撤销系统凭证。机构 admin 和普通 member 不能管理凭证，也不能查看已经创建的明文密钥。

可授予的权限范围为：

| Scope | 用途 |
| --- | --- |
| `papers:import` | 导入论文 |
| `scholars:import` | 导入学者资料 |
| `imports:read` | 查询导入记录和逐条结果 |

系统凭证默认有效期为 90 天，每个机构最多保留 10 个有效凭证。`client_secret` 只在创建或轮换时显示一次，应保存到密钥管理系统，不得写入代码、日志或工单。

## 换取短期令牌

```bash
curl -X POST 'https://scholar.example.edu/api/auth/integration-token' \
  -H 'Content-Type: application/json' \
  -d '{
    "client_id": "YOUR_CLIENT_ID",
    "client_secret": "YOUR_CLIENT_SECRET"
  }'
```

成功后返回有效期 1 小时的 JWT。调用导入接口时使用：

```http
Authorization: Bearer YOUR_INTEGRATION_JWT
```

Scholar 会在每次请求时检查凭证的机构、权限、有效期、撤销状态和版本。轮换或撤销凭证后，旧 JWT 会立即失效。

::: warning 安全边界
系统 JWT 只能访问明确允许的集成接口，不能访问普通用户、成员管理、审核或全局学者写接口。生产环境必须通过 HTTPS 使用凭证和令牌。
:::
