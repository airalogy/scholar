# 批量导入 API

批量导入接口统一使用 JSON。单次请求最多包含 500 条记录，并且必须提供 `Idempotency-Key`。

系统接入前，先通过 `/auth/integration-token` 使用 `client_id` 和 `client_secret` 换取短期 JWT；示例中的密钥占位符统一写作 `YOUR_CLIENT_SECRET`。人工导入则要求账号所属角色具备导入能力，普通成员必须单独启用 `can_import_data`。完整流程见[鉴权与权限](/zh/integration/authentication)。

## 接口一览

| 方法 | 路径 | 所需权限 |
| --- | --- | --- |
| `POST` | `/v1/institutions/:slug/imports/papers` | `papers:import` |
| `POST` | `/v1/institutions/:slug/imports/scholars` | `scholars:import` |
| `GET` | `/v1/institutions/:slug/imports` | `imports:read` |
| `GET` | `/v1/institutions/:slug/imports/:importId` | `imports:read` |

通过 Scholar 网站访问 API 时，请在上述路径前加 `/api`，例如 `/api/v1/institutions/example-university/imports/papers`。完整字段定义请以当前 Scholar 实例的 [OpenAPI 文档](/zh/reference/openapi)为准。

## 幂等规则

`Idempotency-Key` 长度为 8–128 个字符，并按“机构 + 导入类型”隔离：

- 相同 key 和相同请求体会返回原导入结果，不会重复写入。
- 相同 key 但请求体不同会返回 `409`。
- 网络超时后应使用原 key 重试，不要生成新 key。

## 导入论文

论文以规范化 DOI 为幂等标识。每条记录至少包含 `title` 和 `doi`。

```bash
curl -X POST 'https://scholar.example.edu/api/v1/institutions/example-university/imports/papers' \
  -H 'Authorization: Bearer YOUR_INTEGRATION_JWT' \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: papers-2026-08-14-001' \
  -d '{
    "items": [
      {
        "title": "A reproducible research example",
        "doi": "https://doi.org/10.1000/example.1",
        "publish_year": 2026,
        "paper_type": "journal_article",
        "language": "en",
        "journal_name": "Example Journal",
        "keywords": ["reproducibility", "data"]
      }
    ]
  }'
```

DOI 会自动去除 URL 前缀、规范大小写。公有多机构模式中，新论文或元数据差异进入审核，不会直接覆盖其他机构使用的全局论文资料。

## 导入学者

学者使用机构范围内唯一的 `external_id`。外部系统不需要生成 Scholar UUID；平台会维护机构学者映射。

```bash
curl -X POST 'https://scholar.example.edu/api/v1/institutions/example-university/imports/scholars' \
  -H 'Authorization: Bearer YOUR_INTEGRATION_JWT' \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: scholars-2026-08-14-001' \
  -d '{
    "items": [
      {
        "external_id": "HR-00042",
        "name": "示例学者",
        "college": "生命科学学院",
        "title": "研究员",
        "email": "researcher@example.edu",
        "research_directions": ["合成生物学"],
        "subject_codes": ["0710"],
        "paper_dois": ["10.1000/example.1"]
      }
    ]
  }'
```

`paper_dois` 只能引用数据库中已经存在的论文，因此首次同步时应先导入论文。公有多机构模式中的学者资料变更由平台管理员审核后生效。

## 查询结果

创建响应包含 `import_id`、总体统计和逐条结果。逐条 `action` 可能为：

- `created`：已创建。
- `updated`：已更新。
- `unchanged`：数据无变化。
- `pending`：等待审核。
- `error`：该条校验或处理失败。

批次状态可能为 `processing`、`pending_review`、`completed`、`completed_with_errors`、`rejected` 或 `failed`。部分记录失败时，修正失败数据后应使用新的 `Idempotency-Key` 提交新的批次。

```bash
curl 'https://scholar.example.edu/api/v1/institutions/example-university/imports/IMPORT_ID' \
  -H 'Authorization: Bearer YOUR_INTEGRATION_JWT'
```

::: tip 请求大小
每批最多 500 条，服务器请求体上限为 10 MB。对于大数据集，请使用稳定顺序分批并为每一批生成可追踪的 key。
:::
