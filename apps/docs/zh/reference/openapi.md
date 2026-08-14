# OpenAPI 与 Swagger

Scholar API 使用 TypeBox Schema 生成 OpenAPI 文档。交互式接口定义与当前运行的 API 代码来自同一个版本，是请求字段、状态码和响应结构的权威参考。

## 访问地址

通过 Scholar 网站访问时：

- <a href="/api/docs" target="_blank" rel="noopener">Swagger UI：`/api/docs`</a>
- <a href="/api/docs/json" target="_blank" rel="noopener">OpenAPI JSON：`/api/docs/json`</a>

直接访问 API 服务时，对应路径为 `/docs` 和 `/docs/json`。

## 使用建议

1. 先在 Swagger UI 中确认当前 Scholar 版本提供的路径和 Schema。
2. 使用 OpenAPI JSON 生成类型或客户端时，将生成物固定到产品版本，不要在生产系统中动态下载。
3. 人类可读的接入说明以本文档为主；字段级约束以当前 Scholar 实例的 OpenAPI 为准。
4. Swagger 页面可以公开读取，但执行受保护的接口仍必须提供有效 JWT 并通过权限检查。

::: warning 不要粘贴生产密钥
在共享屏幕、工单或公共测试环境中使用 Swagger 时，不要输入真实 `client_secret`。建议使用短期测试凭证，并在测试后撤销。
:::
