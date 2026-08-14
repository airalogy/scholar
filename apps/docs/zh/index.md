---
layout: home

hero:
  name: Airalogy Scholar 文档
  text: 使用、管理与系统接入指南
  tagline: 与 Airalogy Scholar 产品版本同步交付，帮助机构管理员和系统集成人员安全地管理学术数据。
  actions:
    - theme: brand
      text: 查看机构接入指南
      link: /zh/integration/
    - theme: alt
      text: 批量导入 API
      link: /zh/integration/bulk-import

features:
  - title: 机构数据接入
    details: 使用管理后台或系统凭证导入论文和学者数据，所有写入均受机构范围和权限控制。
  - title: 可执行 API 参考
    details: 通过 Airalogy Scholar 提供的 Swagger UI 查看当前版本的完整请求结构和响应 Schema。
  - title: 中英文对照
    details: 中文与英文页面保持对应，可在页面顶部随时切换语言。
---

## 从哪里开始

- 机构管理员：阅读[管理后台导入](/zh/administration/data-import)，了解成员授权、CSV 预览和导入历史。
- 系统集成人员：从[鉴权与权限](/zh/integration/authentication)开始，再阅读[批量导入 API](/zh/integration/bulk-import)。

::: tip 当前产品版本
本文档适用于 Airalogy Scholar `v{{ $frontmatter.scholarVersion }}`。接口字段以当前 Airalogy Scholar 实例的 [OpenAPI 文档](/zh/reference/openapi)为准。
:::
