# 机构组织结构与审核流

[English](../en/institution-org-structure.md) | 简体中文

本文档说明 Airalogy Scholar 如何管理机构内部的复杂组织结构，并在此基础上解析论文审核流。

目标是同时满足以下场景：

- 机构内部存在学院、系、中心、实验室、委员会等多级节点
- 结构不一定是纯树状，可能存在网状或矩阵关系
- 同一个人可以在多个层级、多个节点上兼任岗位
- 机构可以通过一次性导入建立结构，之后再持续修改
- 论文审核人不是手工写死，而是从组织结构和岗位任职中自动解析

## 核心原则

### 1. 组织结构、平台账号、审核流三者解耦

- 组织结构不直接等于平台账号
- 结构中的“人”先进入机构目录，再决定是否绑定为平台 `user`
- 审核流配置的是“岗位解析规则”，不是“某几个固定账号”

这样可以避免导入花名册时直接创建错误账号，也能支持成员先入组织目录、后激活平台身份。

### 2. 允许网状结构，但审核链路只走可解释的规则

- 机构结构层允许存在多种边
- 当前实现中，`hierarchy` 边用于表达主层级关系
- 审核流里“向上找人”的逻辑，只沿 `hierarchy` 边解析
- 其他边类型例如 `matrix`、`committee`、`co_manage` 可以保留在结构图里，但不会被自动当成审批链

### 3. 审核单创建时会把审核步骤快照化

- 论文认领进入待审核状态时，会根据当时的组织结构和审核流生成 `content_review_step_instances`
- 后续即使机构结构调整，已在流转中的审核单也不会被重新改写
- 重新提交论文或重建认领时，会重新生成新的审核步骤快照

## 数据模型

当前后端新增了以下结构：

- `institution_org_nodes`
  - 机构中的组织节点
  - 示例：机构本级、学院、系、实验室、办公室、委员会
- `institution_org_edges`
  - 节点之间的关系
  - 当前推荐 `fromNodeId = 子节点`，`toNodeId = 父节点`
- `institution_org_people`
  - 机构目录中的人
  - 可绑定平台 `user`
  - 可关联 `institution_user_provisions`，用于预开通
- `institution_org_positions`
  - 某节点上的岗位
  - 示例：院长、科研秘书、PI、审核员
- `institution_org_appointments`
  - 某个人在某岗位上的任职
- `institution_review_workflows`
  - 审核流模板
- `institution_review_workflow_bindings`
  - 审核流与机构/节点的绑定关系
- `institution_review_workflow_steps`
  - 审核流步骤定义
- `content_review_cases`
  - 内容审核案例及当前状态
- `content_review_step_instances`
  - 审核单运行时步骤快照

同时，`paper_claims` 保留：

- `reviewNodeId`
  - 本次审核关联的组织节点
- `reviewCaseId`
  - 对应的统一审核案例

## 标准结构快照

机构组织结构通过一个“完整快照”维护，接口为：

- `GET /institutions/:slug/org-structure`
- `PUT /institutions/:slug/org-structure`

`PUT` 的标准结构如下：

```json
{
  "replaceMissing": true,
  "nodes": [
    {
      "key": "example-university-root",
      "name": "示例大学",
      "nodeType": "institution"
    },
    {
      "key": "life-school",
      "name": "生命科学学院",
      "nodeType": "college"
    },
    {
      "key": "wang-lab",
      "name": "王某某实验室",
      "nodeType": "lab"
    }
  ],
  "edges": [
    {
      "fromNodeKey": "life-school",
      "toNodeKey": "example-university-root",
      "edgeType": "hierarchy",
      "isPrimary": true
    },
    {
      "fromNodeKey": "wang-lab",
      "toNodeKey": "life-school",
      "edgeType": "hierarchy",
      "isPrimary": true
    }
  ],
  "people": [
    {
      "key": "scholar-wang",
      "name": "王老师",
      "email": "wang@example.edu",
      "createProvision": true
    },
    {
      "key": "secretary-li",
      "name": "李秘书",
      "email": "li@example.edu"
    }
  ],
  "positions": [
    {
      "key": "wang-lab-pi",
      "nodeKey": "wang-lab",
      "name": "PI",
      "code": "pi"
    },
    {
      "key": "life-school-secretary",
      "nodeKey": "life-school",
      "name": "科研秘书",
      "code": "research-secretary",
      "canReviewContent": true
    }
  ],
  "appointments": [
    {
      "key": "scholar-wang-as-pi",
      "personKey": "scholar-wang",
      "positionKey": "wang-lab-pi",
      "status": "active",
      "isPrimary": true
    },
    {
      "key": "li-as-secretary",
      "personKey": "secretary-li",
      "positionKey": "life-school-secretary",
      "status": "active"
    }
  ],
  "workflows": [
    {
      "key": "lab-paper-review",
      "name": "实验室论文审核流",
      "bindings": [
        {
          "type": "node_default",
          "nodeKey": "wang-lab",
          "priority": 100
        }
      ],
      "steps": [
        {
          "order": 1,
          "name": "实验室 PI 审核",
          "resolverType": "position",
          "resolverConfig": {
            "scope": "review_node",
            "positionCodes": ["pi"]
          }
        },
        {
          "order": 2,
          "name": "上级科研秘书审核",
          "resolverType": "position",
          "resolverConfig": {
            "scope": "ancestor",
            "positionCodes": ["research-secretary"],
            "fallbackInstitutionRoles": ["owner", "admin"]
          }
        }
      ]
    }
  ]
}
```

## 字段约定

### 节点 `nodes`

- `key`
  - 机构内唯一稳定标识
  - 推荐来源于外部系统编码或人为命名的稳定 key
- `nodeType`
  - 当前建议值包括：`institution`、`college`、`department`、`lab`、`office`、`committee`、`center`
  - 也允许自定义字符串

### 边 `edges`

- `fromNodeKey`
  - 推荐始终表示“子节点”
- `toNodeKey`
  - 推荐始终表示“父节点”
- `edgeType`
  - 当前审核流只把 `hierarchy` 当成主审批层级
- `isPrimary`
  - 当存在多条同类上级关系时，可用来表达主链路

### 人 `people`

- `key`
  - 机构内唯一稳定标识
- `userId`
  - 已知平台账号时可直接绑定
- `email`
  - 若未显式给 `userId`，系统会尝试按邮箱匹配已有 `user`
- `createProvision`
  - 为 `true` 时，若此人尚未绑定平台账号，系统会自动创建或更新 `institution_user_provisions`
  - 注意：这不会直接创建可登录账号，只会建立预开通记录

### 岗位 `positions`

- `key`
  - 机构内唯一稳定标识
- `code`
  - 可跨节点复用的岗位编码
  - 例如多个学院都可以有 `research-secretary`
- `canReviewContent`
  - 岗位是否具备审核性质的语义标记
  - 当前主要用于结构表达和后续扩展，不直接替代审核流解析

### 任职 `appointments`

- 一个人可以有多条任职记录
- 一个岗位也可以有多人共同任职
- `status = active` 且时间区间有效时，才会被审核流解析为当前有效任职

## 审核流配置规则

### 绑定规则

当前支持两类绑定：

- `institution_default`
  - 整个机构的默认审核流
- `node_default`
  - 某个组织节点的默认审核流

命中顺序：

1. 优先命中 `reviewNodeId` 对应节点的 `node_default`
2. 若多个节点流都命中，按 `priority` 高者优先
3. 若没有节点级流，则回退到 `institution_default`

### 步骤解析器

当前支持三类解析器：

- `user`
  - 直接指定 `userIds`
- `institution_role`
  - 按机构成员角色解析
  - 可使用 `owner`、`admin`、`member`、`reviewer`
- `position`
  - 按组织节点中的岗位解析

`position` 解析器当前支持以下 `scope`：

- `review_node`
  - 在 `reviewNodeId` 对应节点查岗位
- `ancestor`
  - 沿 `hierarchy` 向上逐层查找，命中最近一层即停止
- `specific_node`
  - 在指定 `nodeKey` 上查岗位
- `institution_root`
  - 在 `nodeType = institution` 的根节点上查岗位

### 兜底规则

如果岗位解析没有找到任何已绑定平台账号的有效任职人，可在 `resolverConfig.fallbackInstitutionRoles` 中指定兜底角色，例如：

```json
{
  "scope": "ancestor",
  "positionCodes": ["research-secretary"],
  "fallbackInstitutionRoles": ["owner", "admin"]
}
```

## 与平台账号的关系

导入组织结构时，系统会尽量自动完成以下动作：

1. 若 `people[].userId` 已提供，直接绑定到该平台用户
2. 若未提供 `userId`，但 `email` 能命中已有 `users.email`，则自动绑定该用户
3. 若 `createProvision = true` 且尚未命中平台用户，则自动创建或更新 `institution_user_provisions`
4. 一旦目录中的人绑定到平台用户，系统会确保存在对应 `institution_memberships`

注意：

- 当前实现不会因为导入名单而直接创建可登录 `user`
- 平台账号仍应通过原有注册、激活或机构登录流程产生

## 与论文审核的关系

### 提交论文

上传论文时，接口新增可选字段：

- `review_node_id`

若传入该字段，系统会把这篇论文认领绑定到对应组织节点的审核流。

### 审核流转

论文认领进入待审核后：

1. 系统根据 `institutionId + reviewNodeId` 解析命中的审核流
2. 系统把每个步骤解析成一条 `content_review_step_instances`
3. 第一步状态设为 `pending`，后续步骤状态设为 `queued`
4. 当前步骤通过后，下一步自动转为 `pending`
5. 最后一步通过后，`content_review_cases.status = approved`
6. 任一步要求修改后，`content_review_cases.status = changes_requested`

### 快照化

审核步骤中的候选审核人会在认领创建或重提时被快照化，因此：

- 机构后续改人、改岗位、改边关系，不会影响已在流转中的审核单
- 若需要按最新结构重新走流程，应通过论文修改/重提触发重建

## 当前已实现的后端接口

- `GET /institutions/:slug/org-structure`
  - 拉取当前机构组织结构快照
- `PUT /institutions/:slug/org-structure`
  - 以完整快照方式导入或更新机构组织结构
- `POST /papers/create`
  - 新增可选字段 `review_node_id`
- `PUT /papers/:id`
  - 新增可选字段 `review_node_id`

## 当前实现边界

- 当前前端管理界面尚未补齐，本次先提供后端数据结构和接口
- 组织结构更新采用“快照提交”模式，调用方应以 `GET` 返回结果为基础修改后再 `PUT`
- 当前审核流对“网状结构”的自动审批只沿 `hierarchy` 边解析
- 复杂的并行会签、加签、按比例通过等高级流程暂未实现

## 相关文档

- [论文审核状态机](./paper-review-workflow.md)
- [内容治理与角色边界](./content-governance.md)
- [API 架构](./api.md)
