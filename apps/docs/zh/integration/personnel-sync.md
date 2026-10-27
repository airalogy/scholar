# 人员同步接口规范

面向学校信息中心和系统供应商。Airalogy Scholar 接收标准 JSON；人事、教务等上游数据提取、列名映射、清洗和来源整合由学校的私有适配层负责。这不是 SCIM 服务端，也不要求学校替换已有人员系统。

配套资料：[六类记录字段字典](/zh/integration/personnel-fields)、[图书馆维护手册](/zh/administration/personnel-review)、[OpenAPI](/zh/reference/openapi)。接口路径版本 `/v1` 与数据批次的 `schemaVersion` 是两个概念；支持哪些字段以部署版本为准，不应给尚未升级的实例发送 v2 数据。

人员同步业务字段统一采用区分大小写的 `camelCase`，例如 `externalId`、`personExternalId`、`expectedRows`；`external_id` 等替代拼写会被拒绝。下文令牌交换保留 `client_id`、`access_token` 等既有字段，`doctoral_student` 等枚举值也保持原样。旧论文/学者导入接口仍按各自字段字典调用，不要对所有接口统一转换键名。

## 1. 接入前准备

1. 机构 owner 或平台管理员创建人员数据来源，提供机构 `slug` 和来源 UUID `sourceId`。学校确认该来源负责的人员范围、全量完整性和上游责任人。
2. 创建只含 `directory:sync` 且绑定该来源的系统凭证（`directorySourceId`）。不能与论文、学者导入权限混用。普通 admin 或具有 `can_import_data` 的成员不因此获得人员同步管理权。
3. 在密钥管理系统保存凭证，确认 HTTPS API 基础地址，例如 `https://scholar.example.edu/api`；不要把密钥或真实人员数据放入公共仓库、截图和日志。
4. 先用测试来源完成下方样例和验收，初期使用增量同步，或关闭缺失停用的全量同步。切换为目录准入、审核授权和流程配置由管理员独立完成。

来源配置中：`enabled` 控制是否允许新同步，`authoritative` 声明权威来源，`deactivateMissing` 控制全量缺失停用；只有权威来源才能开启后者。`maxDeactivationPercent`（0–100）限制一次批量停用比例，超过阈值需要人工确认；`expectedIntervalHours`（1–720）用于发现同步延迟，并非自动拉取学校数据。

## 2. 标识与所有权

| 标识 | 谁提供 | 用途 |
| --- | --- | --- |
| `sourceId` | Scholar 创建来源后返回 | 限定同步来源和凭证权限 |
| `person.externalId` | 学校适配器 | 同一真实人员的稳定来源键；换学号或工号时保留 |
| `identifiers` | 学校已核实的学工号等编号 | 连接 SSO 身份；可有多个，不按姓名或邮箱合并 |
| `institution_people.id` | Scholar | 内部人员 UUID；外部同步引用人员仍用 `personExternalId` |
| 登录账号 ID / 学者档案 ID | Scholar | 内部关联属性为 `userId` / `scholarId`，均不属于人员同步输入 |

同一人员只归一个来源记录；其他来源或另一个来源键不能抢占。权威来源可通过**一致且无冲突的已有编号**认领原先尚未归属来源的人员，不依赖姓名或邮箱。多个上游系统的权威整合在私有适配器中完成。已撤销或属于不同人员的编号必须先核验，不要自动改号、合并或新建替代人员规避冲突。

## 3. 同步版本、批次与限制

`schemaVersion: 1` 支持 `person/unit/position/appointment`；版本 2 额外支持 `identity/relationship`。省略版本时默认 1。v1 的 `category` 继续兼容，但不会自动推断博士生、PI 等精确身份。

创建批次的请求字段如下；这不是包含 `rows` 的客户端 manifest：

| 字段 | 必填 | 约束 |
| --- | --- | --- |
| `schemaVersion` | 否 | 整数 1 或 2；默认 1 |
| `sequence` | 是 | 每来源递增整数，1–2147483647；新批次必须高于该来源已应用序号，不要求连续 |
| `mode` | 是 | `incremental` 或 `full` |
| `expectedPages` | 是 | 整数 1–1000；页码为 1 至此值 |
| `expectedRows` | 是 | 整数 0–100000；所有页面行数之和须完全一致 |

每页最多 500 条，上传页请求体最多 4 MiB。创建批次必须提供长度 1–128 的 `Idempotency-Key`；键绑定来源。同来源、同键重复创建返回原批次；版本、序号、模式或数量不同返回冲突。同一批次不得重复 `(kind, externalId)`。

### 增量、全量和空值

- `incremental` 仅处理提交的记录，没提交的记录保留；每条记录仍需全部必填字段。
- `full` 声明完整来源快照，不是当前查询页、当前学院或本次变更集合。只有 `authoritative=true`、`deactivateMissing=true` 且完整校验后才执行缺失停用；v1 全量不结束 v2 身份/关系，v2 全量须覆盖该来源六类记录。
- 停用保留人员、编号和历史，不硬删除。人员停用、身份/关系批量结束和审核授权减少都可能触发确认。
- 不完整分页、抓取失败或超时不能转换为空全量。`expectedRows: 0` 在协议上允许，但只有业务确认确实为空时才可使用；空批次仍须上传一页 `{"rows":[]}`。
- 可空字段的 `null` 不等于省略；布尔值不是数字。`email` 省略保留、`null` 清空；必填日期的 `null` 会写入未知时间；编号空数组非法。详见[空值语义](/zh/integration/personnel-fields#省略、空值和结束关系)。

## 4. 完整联调样例

业务接口的共同前缀为 `/v1/institutions/:slug/directory/sources/:sourceId`，相对于上述 API 基础地址；调用均需 Bearer 令牌：

| 方法与后缀 | 请求 | 成功响应的 `data` |
| --- | --- | --- |
| `POST /runs` | 批次声明 + `Idempotency-Key` | 批次对象 |
| `PUT /runs/:runId/pages/:page` | `{rows}` | `null` |
| `POST /runs/:runId/validate` | `{}` | 预览后的批次对象 |
| `POST /runs/:runId/apply` | `{}`；人工确认另需说明 | 应用后的批次对象 |
| `GET /runs/:runId?offset=0` | 无请求体 | `{run,rows}` |

下载[虚构人员同步示例](/examples/personnel-sync-v2.json)，保存为 `personnel-sync-v2.json`。包含 11 条记录：两名人员、两个单位、两个岗位、两条任职、两个身份、一条导师关系，覆盖全部六类记录。它是**增量**样例，不是任何学校的完整人员名册，不要改成生产全量覆盖。

客户端 manifest 为 `{ schemaVersion, sequence, mode, rows }`。仓库提供的 `pnpm directory:sync /private/path/personnel-sync-v2.json` 自动分页、校验并应用；其环境变量和定时运行说明见[接入概览](/zh/integration/#人员目录同步)。单次执行未完成应用（如待人工确认）返回退出码 2。manifest 总大小上限 30 MiB，每页仍须满足服务端上限。

自行对接时，下面展示完整 HTTP 顺序。命令依赖 `curl` 和 `jq`；替换实例地址、来源和机构。凭证由私有运行环境注入 `SCHOLAR_DIRECTORY_CLIENT_ID`、`SCHOLAR_DIRECTORY_CLIENT_SECRET`。不要开启 shell 调试、打印令牌响应或使用 `curl -v`。

### 4.1 换取令牌

`POST /auth/integration-token` 的返回体**不带** `{ code, data }` 包装：

```bash
set -euo pipefail
API='https://scholar.example.edu/api'
SLUG='example-university'
SOURCE_ID='00000000-0000-4000-8000-000000000001'
TOKEN=$(jq -n '{client_id: env.SCHOLAR_DIRECTORY_CLIENT_ID, client_secret: env.SCHOLAR_DIRECTORY_CLIENT_SECRET}' |
  curl --fail-with-body --silent --show-error "$API/auth/integration-token" \
    -H 'Content-Type: application/json' --data-binary @- | jq -er '.access_token')
RUNS="$API/v1/institutions/$SLUG/directory/sources/$SOURCE_ID/runs"
```

```json
{ "access_token": "YOUR_INTEGRATION_JWT", "token_type": "bearer", "expires_in": 3600, "scope": "directory:sync" }
```

令牌有效期 1 小时；每次请求还会检查凭证是否过期、撤销或轮换。过期时重新换取令牌后续传原批次，不要创建重复数据。系统令牌只能使用允许的同步接口，不能管理来源、改准入政策、授予审核权限或审批内容。

### 4.2 创建批次

新测试来源的请求示例：

<!-- contract: directory-run -->
```json
{ "schemaVersion": 2, "sequence": 1, "mode": "incremental", "expectedPages": 1, "expectedRows": 11 }
```

```bash
RUN=$(jq '{schemaVersion, sequence, mode, expectedPages: 1, expectedRows: (.rows | length)}' personnel-sync-v2.json |
  curl --fail-with-body --silent --show-error "$RUNS" \
    -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
    -H 'Idempotency-Key: example-directory-1' --data-binary @-)
RUN_ID=$(printf '%s' "$RUN" | jq -er '.data.id')
```

成功返回 HTTP 200 和 `{ "code": 0, "data": { ...批次对象... } }`。首次状态为 `staging`，重复请求也可能返回原来的 `validated`、`needs_confirmation`、`failed` 或 `applied` 状态。应检查状态再执行后续步骤；已应用直接结束，未暂存状态不能再次 PUT 页面。

### 4.3 上传页面

首次 `staging` 批次调用 `PUT .../runs/:runId/pages/1`，请求体只包含 `rows`，不包含 manifest 的其他字段：

```bash
jq '{rows}' personnel-sync-v2.json |
  curl --fail-with-body --silent --show-error -X PUT "$RUNS/$RUN_ID/pages/1" \
    -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' --data-binary @-
```

成功返回 `{"code":0,"data":null}`，表示已暂存，不代表已经更新人员。多页时逐页上传并保存页码；重试相同页面必须保留完全一致的 JSON 内容及字段/行顺序，不能在原页上修订数据。

### 4.4 校验、查看差异、应用

<!-- contract: directory-apply -->
```json
{}
```

```bash
curl --fail-with-body --silent --show-error "$RUNS/$RUN_ID/validate" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{}'
curl --fail-with-body --silent --show-error "$RUNS/$RUN_ID?offset=0" \
  -H "Authorization: Bearer $TOKEN"
```

校验成功仍不修改人员。检查状态、数量及差异后，仅 `validated` 可以按下面方式自动应用：

```bash
curl --fail-with-body --silent --show-error "$RUNS/$RUN_ID/apply" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{}'
```

`needs_confirmation` 必须交管理员检查并在后台附理由确认；自动同步不得填写 `confirmDeactivation: true` 试图绕过。应用会重新校验最新数据，原子提交整个批次；一行冲突则整批回滚，不是逐行部分写入。

`validate` 和 `apply` 均返回 `{code:0,data:批次对象}`。以下为成功应用响应的**字段摘录**，不是完整对象：

```json
{ "code": 0, "data": {
  "id": "00000000-0000-4000-8000-000000000002",
  "schemaVersion": 2, "sequence": 1, "mode": "incremental", "status": "applied",
  "expectedPages": 1, "expectedRows": 11,
  "createdCount": 11, "updatedCount": 0, "deactivatedCount": 0,
  "endedIdentityCount": 0, "endedRelationshipCount": 0, "error": null
} }
```

计数针对所有记录类型，不是仅人员数；更新计数也不保证每条都有字段差异。查询批次返回 `{code:0,data:{run,rows}}`：`run` 为同一批次对象，`rows` 每次最多 100 条，使用 `offset=0/100/200` 分页。记录含 `kind/externalId/payload/previousSnapshot/outcome/error`；预览成功的写入会回滚，因此不要仅靠单行 `outcome` 判断校验或应用成功，要检查 `run.status`。错误详情和前值可能含个人信息，只在受控渠道使用。

## 5. 状态、错误与安全重试

正常顺序为 `staging → validated → applied`；高影响变更为 `staging → needs_confirmation → 人工确认后 applied`。数据校验失败可记录为 `failed`；鉴权失败、缺页、旧序号等拒绝不一定改变已有状态。HTTP 成功不代表业务已经生效，最终以 `applied` 为准。

错误响应通常为 `{"code":409,"message":"..."}`，实际文本可能随版本变化，不要靠英文错误字符串编程。网关错误可能不是 JSON。

| HTTP / 状态 | 常见原因 | 处理方式 |
| --- | --- | --- |
| 400 | 字段、类型、枚举、版本、页码或数量不符 | 按字段字典修正；已接受的页面不可原地改，修订数据使用新键、新序号建批 |
| 401 | 令牌失效、凭证无效或被轮换 | 检查凭证后重新换令牌，保留原批次和幂等键；不要无限重试失效凭证 |
| 403 | scope 不足、来源未绑定、系统令牌调用管理接口 | 由 owner 核对授权；换学工号或增加权限字段不能解决 |
| 404 | 来源、批次或机构路径错误/不可见 | 检查部署实例和标识，不能跨机构探测 |
| 409 | 序号过期、幂等键/页面冲突、缺页、编号或引用冲突、批次状态不允许 | 查询原批次；补齐尚未暂存的页面，或修复上游后建立新批次。不得自动合并人员 |
| 413 | 单页超过 4 MiB | 重新分批并更新声明的页数；不能仅压低行数声明 |
| 429 | 实例限流 | 遵守 `Retry-After`（如有），有界退避重试 |
| 5xx / 断网 / 超时 | 服务或网络故障，是否提交成功未知 | 先查原批次，未确认前不换键；指数退避并限制重试次数，持续失败告警 |
| `needs_confirmation` | 人员/身份/关系或授权大规模停用 | 暂停自动应用，交有权管理员核查，不能由机器确认 |

创建请求超时且没有 `runId` 时，用相同 `Idempotency-Key` 和相同声明重发，取回原批次。页面超时用原内容重发。应用超时先 GET；已 `applied` 不再创建新批次，原 apply 可幂等重试。待校验内容需要修订时保留旧失败批次，用高于已应用序号的**新序号和新键**提交修订版。一个来源串行应用批次，避免较新批次先成功导致旧批次过期。退出定时任务不等于撤销已提交批次。

## 6. 人员变化如何提交

| 变化 | 上游提交 | 预期结果 |
| --- | --- | --- |
| 入校但尚未登录 | `person` 及需要的组织/身份关系 | 先有人员档案；符合准入规则的首次 SSO 再创建普通账号 |
| 同一人新增学号/工号 | 同一 `externalId`，提交经核验的 `identifiers` | 保留人员与论文绑定；新编号不能属于其他人 |
| 调岗 / 兼任 | 结束旧任职或添加新的任职键 | 保留历史；兼任可并存；不自动恢复或新增审核授权 |
| 换导师 | 更新或结束对应 `relationship`，保留主体 | 保存版本；旧任务不自动改派，必要时管理员新开审核轮次 |
| 离职 / 毕业 | 完整 `person` 记录，`status` 改为 `departed/graduated` | 限制准入，保留资料和历史，撤销相应权限 |
| 返校 | 同一人员键恢复 `active` 并同步新关系 | 不新建重复人员；旧高权限需重新明确授权 |
| 学院改名 / 合并 | 改名保留键；合并按真实新单位建键并结束旧关系 | 保留历史，不重写过去论文署名 |
| 源系统错误 | 优先修复上游/适配器后增量提交 | 必要的临时更正须由另一管理员核验、有期限、留痕 |

## 7. 联调验收清单

在测试环境用虚构人员完成并记录批次 ID、结果、失败原因及修复方式；不要把真实人员明细放入公共 Issue。

- [ ] 11 条样例完整应用；重复创建/页面/应用不产生重复人员。
- [ ] 人员无账号时可预建档；首次 SSO 对上已核实编号，成为普通用户，不获得审核权。
- [ ] 同名不同编号保持两人；一人两个编号保持一个人员档案；冲突编号失败且整批不写入。
- [ ] 姓名更新、邮箱省略/清空、日期 `null`、`true/false` 和错误 `0/1` 的结果符合字典。
- [ ] 缺页、重复行、错误跨源引用、组织循环、已应用旧序号均被阻止；失败不使人员批量离校。
- [ ] 增量漏人不删除；完整权威全量大量停用转人工确认，系统凭证无法确认。
- [ ] v1 全量保留 v2 身份/关系；v2 缺失结束关系时保留历史并检查批量保护。
- [ ] 调岗/离职后旧审核权失效；返校或重新任职不恢复旧授权；导师变更不重写旧审核轮次。
- [ ] 撤销/轮换凭证后旧 JWT 无法使用；跨来源调用、成员管理和审批接口被拒绝。
- [ ] 在创建、分页、应用三个阶段模拟超时并恢复，使用原幂等键查证最终状态。
- [ ] 多身份和多单位的审核规则完成试运行；资料未核验或规则同级冲突不能直接入库。
- [ ] 交接源系统负责人、私有适配器、调度周期、告警、凭证轮换、批次查验和人工确认责任人。

## 审核与纠错管理 API

以下接口仅供机构 owner / 平台管理员的人类登录会话使用，系统 JWT 被拒绝，响应使用 `{ code, data }`：

| 接口（共同前缀 `/v1/institutions/:slug`） | 用途 |
| --- | --- |
| `GET /directory/people/:personId/history` | 来源、身份、关系、任职及更正记录 |
| `GET /directory/organization-history` | 观测到的组织关系历史 |
| `GET/POST /directory/corrections` | 查看/申请临时更正 |
| `POST /directory/corrections/:id/decision` | `approve`、`reject`、`revoke`，需 `notes` |
| `GET/POST /review-governance/routes` | 查看规则、发布新版本 |
| `POST /review-governance/simulate` | 对人员和发表时单位试运行 |
| `POST /review-governance/cases/:caseId/reroute` | 当前待审材料开始新轮次，需 `versionId`、`notes` |

更正请求包含 `personId`、`field`（`name` 或 `admission`）、`value`、`expiresAt`、`reason`。临时准入的值固定为 `allow`，最长 7 天；姓名最长 30 天。申请人、批准人及被更正人员的账号不能违反独立核验要求。不会修改源状态或授予权限。

规则请求包含 `key`、`name`、`contentType`、`priority`、`identityCodes`、`nodeIds`、`requestKinds`、`enabled`、`expectedRevision`、`notes`、`steps`。创建时 `expectedRevision` 为 0，更新时使用当前版本号；过期版本拒绝写入。每机构最多 100 个规则代号。阶段沿用治理流程的 `name`、`groups`、`deadlineHours`、可选 `ccPersonIds`。新增组类型 `supervisors`、`responsible` 对应显式授权角色 `supervisor`、`responsible`。

`requestKinds` 为 `submission`、`metadata`、`attribution`、`access`、`bibliography`、`institutional_withdrawal`（包括恢复）。试运行请求包含 `contentType`、`requestKind`、`personIds`、`nodeIds`；它只预览已发布规则。规则冲突作为结果中的阻塞原因返回，不产生任务。历史查询采用 `offset` 分页；规则列表可用 `history=true` 包含旧版本。

## 升级注意

数据库迁移为现有任职与组织边建立观测基线，保留既有人员、编号、论文和审核轮次。不推断基线以前的历史。身份规则需要先补齐 v2 数据；升级不自动启用目录准入或审核流程。

启用治理默认流程后，新材料和受治理的批量导入/变更沿用同一审核路径；旧审批轮次不会被规则更新改写。旧的单步导入审核不能用于绕过已启用的治理流程。上线前请按[维护手册](/zh/administration/personnel-review)验证样例和交接事项。
