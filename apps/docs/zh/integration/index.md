# 系统接入概览

Scholar 提供两种机构数据导入方式。两种入口最终调用同一套 JSON 导入服务，因此校验、幂等、审核和审计规则一致。

| 场景 | 推荐入口 | 身份 | 适合对象 |
| --- | --- | --- | --- |
| 偶尔导入或人工核对 | 机构管理后台 | 用户账号 | 机构管理员、获授权成员 |
| 定期同步教务或科研系统 | 批量导入 API | 系统凭证换取的短期 JWT | 机构信息系统 |

## 推荐接入流程

1. 由机构 owner 确认导入范围和数据负责人。
2. 人工操作时，为成员开启“允许数据导入”；系统同步时，由 owner 创建最小权限的系统凭证。
3. 先在测试环境提交少量数据，检查逐条结果和审核状态。
4. 使用稳定的 `Idempotency-Key` 重试失败的网络请求，避免重复写入。
5. 先同步论文，再同步带 `paper_dois` 的学者数据。
6. 定期轮换系统凭证，并在不再使用时立即撤销。

## 数据生效方式

- Airalogy Managed 租户：新数据进入托管审核流程；系统凭证只有提交权，没有审核权。
- 机构自托管实例：默认校验通过后直接写入；启用新论文审核流程后，导入更新先成为审核申请，人工批准并执行前不修改已发布元数据。

继续阅读[鉴权与权限](/zh/integration/authentication)或直接查看[批量导入 API](/zh/integration/bulk-import)。

## 人员目录同步

学校专有的数据提取和映射保留在私有适配器中。Scholar 接收有类型的人员事实，不接收账号角色。每个人使用稳定的来源 `externalId`，可关联多个机构编号。姓名或邮箱相同不会合并人员，新核验编号不替换主编号；人员可以尚未拥有登录账号。

客户端标准 manifest：

```json
{
  "sequence": 1,
  "mode": "full",
  "rows": [
    { "kind": "person", "externalId": "person-1", "name": "示例人员", "identifiers": ["STAFF-001"], "category": "staff", "status": "active" },
    { "kind": "unit", "externalId": "unit-1", "name": "示例学院", "active": true, "parentExternalId": null },
    { "kind": "position", "externalId": "post-1", "unitExternalId": "unit-1", "name": "研究人员", "active": true },
    { "kind": "appointment", "externalId": "appointment-1", "personExternalId": "person-1", "positionExternalId": "post-1", "status": "active", "startsAt": null, "endsAt": null }
  ]
}
```

每个来源的整数序号单调递增，网络失败后重试同一 manifest。每批最多 100,000 行，每页 500 行。`full` 包括来源的人员、单位、岗位及任职；部分更新使用 `incremental`，不可把被截断的数据标为全量。布尔值为 `true/false`，未知日期为 `null`。人员状态为 `active/departed/graduated/suspended`；任职状态为 `active/ended`。人员类别为 `staff/undergraduate/postgraduate/visitor/other/unknown`。省略某编号不会撤销它，编号撤销另由管理员执行。

以下路径相对于 API 基础地址：

1. `POST /v1/institutions/:slug/directory/sources/:sourceId/runs`：携带 `Idempotency-Key`，请求体为 `{ sequence, mode, expectedPages, expectedRows }`。
2. `PUT .../runs/:runId/pages/:page`：请求体 `{ rows }`，页码从 1 开始。相同页面可重试，内容冲突会拒绝。
3. `POST .../runs/:runId/validate`：请求体 `{}`。不完整或冲突的快照不改变人员。
4. `GET .../runs/:runId?offset=0`：查看任务及每页 100 条记录、变更前值和错误。
5. `POST .../runs/:runId/apply`：请求体 `{}`，原子应用校验结果。`needs_confirmation` 必须在人工管理页面确认，系统凭证不能绕过。

`pnpm directory:sync /private/path/directory.json` 自动完成上述协议。私有运行环境配置 `SCHOLAR_API_URL`（按部署包含 `/api`）、`SCHOLAR_INSTITUTION_SLUG`、`SCHOLAR_DIRECTORY_SOURCE_ID`、`SCHOLAR_DIRECTORY_CLIENT_ID`、`SCHOLAR_DIRECTORY_CLIENT_SECRET`。除回环开发地址外必须 HTTPS。设置整数 `SCHOLAR_DIRECTORY_SYNC_INTERVAL_SECONDS`（至少 60）可定时运行；私有提取器原子替换 manifest 并递增序号。同一进程不重叠执行，重启可安全重用原 manifest；也可由现有调度器单次调用。真实数据和密钥不得提交到公共仓库。

## 外部待办

可选配置：HTTPS 的 `REVIEW_INBOX_URL` 和 `REVIEW_PUBLIC_ORIGIN`，以及至少 32 字符的 `REVIEW_INBOX_SECRET`。JSON 通知包含 `eventId/taskId/sequence/eventType/currentStatus/institutionId/timestamp/recipientPersonIds` 及 Scholar 任务 `url`。`Idempotency-Key` 为事件 ID；`X-Scholar-Signature` 为 `sha256=` 加上对**原始请求体字节**计算的 HMAC-SHA256 十六进制摘要。

私有接收端必须校验签名和时间、按事件 ID 去重、按任务保存最大序号、应用 `currentStatus`（不能因迟到的创建消息重新打开终态任务）、将不透明人员 UUID 映射到校园接收人，并持久化成功后才确认。重试可刷新时间、请求体及签名，但事件身份不变。Scholar 按任务顺序投递、租约恢复并重试，八次失败后由管理员核查重试；对账发送当前状态。消息不含邮箱、学工号或文档内容。实际校园映射和消息协议需要单独测试的私有适配器，这不是审批回调接口。
