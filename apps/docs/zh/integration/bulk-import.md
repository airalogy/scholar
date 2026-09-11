# 批量导入 API

论文导入遵循 Scholar 的版本化标准 JSON 格式。每批 1–500 条，请求体不超过 10 MB。后台 CSV 导入也转换成同一格式，服务器会再次逐条校验。

人工账号需要机构数据导入权限，普通成员必须启用 `can_import_data`。系统通过 `/auth/integration-token`，使用 `client_id` 和 `client_secret` 换取短期 JWT。示例密钥仅使用 `YOUR_CLIENT_SECRET` 等占位符，不应把真实凭证放进源代码。详见[鉴权与权限](/zh/integration/authentication)。

## 接口一览

以下路径相对于 API 根地址；通过网站网关访问时加 `/api` 前缀。

| 方法 | 路径 | 权限 |
| --- | --- | --- |
| POST | `/v2/institutions/:slug/imports/papers` | `papers:import`；仅预览 |
| POST | `/v2/institutions/:slug/imports/:importId/apply` | `papers:import`；确认选中行 |
| POST | `/v2/institutions/:slug/imports/:importId/review` | 平台管理员账号；不接受系统 JWT |
| GET | `/v2/institutions/:slug/imports` | `imports:read` |
| GET | `/v2/institutions/:slug/imports/:importId` | `imports:read` |
| GET | `/v2/institutions/:slug/imports/:importId/items/:itemId` | `imports:read`；差异、问题和决定 |
| GET | `/v2/institutions/:slug/paper-fields` | `papers:import` |
| PUT | `/v2/institutions/:slug/paper-fields` | 机构成员管理权限；JSON 中提供字段 `key`；不接受系统 JWT |
| POST | `/v1/institutions/:slug/imports/scholars` | `scholars:import` |
| GET | `/v1/institutions/:slug/imports/:importId` | `imports:read`；旧版及学者导入结果 |

历史列表支持 `limit`（1–100，默认 20）与 `offset`。完整字段约束以实例的 [OpenAPI 文档](/zh/reference/openapi)为准。

## 唯一标识与请求幂等

预览请求必须提供长度 8–128 的 `Idempotency-Key`。相同 key 和请求体返回原批次；相同 key 配不同内容返回 `409`。网络超时后使用原 key 重试，不同批次和不同接口版本使用不同 key。

每篇论文需要题名（或多语言主标题），以及至少一种稳定标识：

- `doi`：去除 URL 前缀并规范大小写。
- `identifiers`：带命名空间的字符串，如 Scopus EID、CNKI、WOS 编号或稳定馆藏编号。
- `paper_id`：数据库中已存在的 Scholar 论文 UUID。

不生成虚假 DOI，不按题名或作者姓名去重。多个编号指向不同论文时会报冲突，不会自动合并；导入不能替换已有 DOI。

## 预览论文

```bash
curl -X POST 'https://scholar.example.edu/api/v2/institutions/example-university/imports/papers' \
  -H 'Authorization: Bearer YOUR_INTEGRATION_JWT' \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: papers-2026-09-01-001' \
  -d '{
    "schema_version": 2,
    "source": "library-catalog",
    "items": [
      {
        "source_row": 2,
        "paper": {
          "doi": "10.1000/example.1",
          "titles": [
            {"language": "en", "title": "A reproducible research example", "is_primary": true},
            {"language": "zh", "title": "可复现研究示例", "kind": "translated"}
          ],
          "language_tags": ["en"],
          "document_type": "article",
          "publish_year": 2026,
          "authors": [
            {"source_key": "author-1", "name": "Example Author", "order": 1, "corresponding": true}
          ],
          "sources": [{"provider": "library-catalog", "collected_on": "2026-09-01"}]
        }
      }
    ]
  }'
```

响应结构为 `{ "code": 0, "data": { "id": "...", "status": "ready", "summary": {}, "items": [] } }`。预览保存导入记录，但会回滚对论文、作者、期刊、元数据审计和检索任务的试写。行级 `created/updated/unchanged` 表示预计变更，不代表已经入库。

## 确认、审核与重试

```bash
curl -X POST 'https://scholar.example.edu/api/v2/institutions/example-university/imports/IMPORT_ID/apply' \
  -H 'Authorization: Bearer YOUR_INTEGRATION_JWT' \
  -H 'Content-Type: application/json' \
  -d '{"item_ids":["ITEM_ID"],"acknowledge_warnings":true}'
```

省略 `item_ids` 表示确认所有可处理行；检查告警后才能设置 `acknowledge_warnings`。自托管实例应用确认后的有效行；Airalogy Managed 租户转入平台审核。审核请求使用 `decision: "approve" | "reject"`、非空 `notes`，以及可选的 `item_ids` 与 `acknowledge_warnings`。系统凭证没有审核权限。

托管模式的新机构认领仍需经过内容审核才能公开。两种模式都会保留已有认领的附件、提交人、范围和审核决定；元数据更新不会隐式重新批准曾被退回的论文。

行状态包含 `ready`、`pending_review`、`completed`、`rejected`、`error`，准备过程中可能是 `pending`。批次状态包含 `previewing`、`ready`、`pending_review`、`completed`、`completed_with_errors`。单行详情包括字段差异、问题、决定历史及独立的内容审核状态。

确认时重新检查权限与数据指纹。若预览后数据或字段定义改变，应使用新 key 重新预览，不强行覆盖。重复确认不会再次应用已完成行；修正失败行后作为新批次提交。

## 结构化字段

| 字段 | 含义 |
| --- | --- |
| `titles` | BCP 47 语言标签、题名、原文/翻译/机器翻译类型及唯一主标题 |
| `language_tags`、`document_type`、`publication_status` | 论文语种、成果类型、正式出版或提前在线发表状态 |
| `authors` | 本篇署名、顺序、稳定来源键、通讯/共同贡献标记、可选 ORCID 及署名机构键 |
| `affiliations` | 原始署名文字、机构、院系、国家及可选 ROR |
| `journal` | 期刊 UUID 或校验正确的 ISSN/eISSN/ISSN-L；不按名称自动合并 |
| `funding` | 原始基金文字及可选资助方、项目编号、来源键 |
| `sources` | 数据来源、外部编号与 ISO 采集日期 |
| `institution_metadata` | 归属单位、机构署名、合作信息及有类型约束的 `custom_fields` |
| `rankings` | 明确的期刊评价版本、学科层级、学科、指标、分区与 Top 标记 |
| `indicators` | 论文级、带观测日期的 ESI 高被引/热点记录，支持明确的 `false` |

导入作者姓名不会识别或合并真实账号。先保留论文署名，后续通过机构身份管理核实人员绑定。`author_id` 只能引用该论文已有的作者身份。

JCR 必须明确 JIF/JCI 指标和学科；中科院分区必须明确大类/小类及 CAS 指标。学科列表与分区数量不一致时，不自动逐项配对。版本记录体系、版本号、修订号、年份/日期和来源；导入版本是草稿，已发布版本不可改写，纠错需要新修订版。

## 自定义字段与空值

先定义机构专用字段再导入。支持文本、数值、布尔、日期、单选和多选，并配置必填、范围、选项与可见范围。字段键保持稳定，修改约束不能使已有值失效；已使用字段应停用，不应改换含义。

- 省略可选字段会保留数据库原值。
- 布尔值必须使用 JSON `true`/`false`，不能用数字或字符串替代。
- `null` 只清空允许为空的字段，例如可选自定义值或未知的作者标记，不是所有字段通用的清空指令。
- 创建时必填自定义值不能缺失，也不能清空；更新时省略已有的必填值可以保留它。
- 无效的可选自定义值产生告警且不写入；必填字段错误会拒绝该行。

通用 CSV 映射支持显式配置 `0/1 → false/true`。空白默认省略，不等于 `false`；清空可选自定义值需要明确选择映射规则。

机构特有的列名映射与清洗规则由接入方保存在私有配置中。原始文件和导入报告是私有数据，不属于 Scholar 源代码；标准 JSON 是系统接入边界。

## 旧版论文接口

兼容已有接入的 `POST /v1/institutions/:slug/imports/papers` 保留 DOI 必填模式，不提供 v2 的预览确认流程。其中 `paper_type` 和 `language` 为旧版整数枚举，不是字符串。新接入、多语言题名、外部编号、作者与期刊信息应使用 v2。

托管模式下，v1 对已有认领的元数据刷新单独待审。平台管理员可调用 `POST /v1/institutions/:slug/imports/:importId/review`，提交 `status: "approved" | "rejected"` 与非空 `notes`。新认领仍走内容审核，两条路径都不会重置已有认领。

## 导入学者

学者使用机构范围内唯一的 `external_id`。该接口字段存放机构的规范工号/学号。外部系统不需要生成 Scholar UUID，也不能把邮箱或姓名当作身份主键。平台会分别关联机构人员、学者档案、用户账号和预绑定论文。

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
        "college": ["生命科学学院"],
        "title": "研究员",
        "email": "researcher@example.edu",
        "research_directions": [{"name": "合成生物学"}],
        "subject_codes": ["0710"],
        "paper_dois": ["10.1000/example.1"]
      }
    ]
  }'
```

`paper_dois` 只能引用数据库中已经存在的论文，因此首次同步时应先导入论文。Airalogy Managed 租户中的学者资料变更经托管审核后生效；机构自托管实例直接应用变更。

## 查询 v1 结果

创建响应包含 `data.id`、总体统计和逐条结果。逐条 `action` 可能为：

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
