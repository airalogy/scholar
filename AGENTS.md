# AGENTS.md

本文件用于指导 AI 编码助手在本项目中的工作规范与约定。

## 通用编码规范（全局适用）

本项目采用 **JavaScript Standard Style**，关键要求如下：

- 使用 2 个空格缩进，禁用制表符
- 关键字后空格，函数名与括号之间留空格
- 使用单引号，模板字符串用反引号
- 不使用分号
- 优先 `const`，其次 `let`，避免 `var`，不留未使用变量
- 使用 `===` / `!==`
- 统一用 `async/await`，避免 `.then()`
- 函数优先箭头函数

TypeScript 约定：

- 函数参数和返回值必须写类型
- 避免 `any`
- 对象类型用 `interface`，联合/复杂类型用 `type`

格式化与检查：

- 后端使用 `oxfmt` 与 `oxlint`，前端使用 ESLint Flat Config
- `pnpm lint` 只执行检查；需要自动修复时显式运行子项目的 `lint:fix` 或后端 `fmt`

## 项目工作流（全局适用）

Git 规则：

- 未经用户明确要求，不执行 `git add` / `git commit` / `git push`
- 提交前要列出文件、说明变更，并等待确认
- 提交信息格式：`type(scope): description`

文档规则：

- 未经用户明确要求，不新增 `README.md`、`QUICKSTART.md`、说明文档等

大型变更：

- 先给出变更计划与涉及文件清单，等待确认后再改

## 后端规范（适用于 `apps/api`）

- 使用 Fastify 约定与 RESTful 风格
- API 响应必须与 TypeBox Schema 一致；新增版本化业务接口统一使用 `{ code, data?, message? }`
- 统一使用 Fastify 日志
- 使用环境变量：`PORT`、`HOST`、`LOG_LEVEL`、`TRUST_PROXY`
- 避免代码文件过长，必要时拆分为多个模块。

## 前端规范（适用于 `apps/web`）

- Vue 3 SFC，`<script setup lang="ts">`
- 文件名与组件名用 PascalCase
- CSS 类名用 kebab-case，样式尽量 `scoped`
- 模板避免复杂逻辑，`v-for` 必须有稳定 `key`
- 使用入口文件中按需注册的 Arco Design 组件，避免恢复全量组件和样式导入
- AI Markdown 经 `v-html` 渲染前必须使用 `renderSafeMarkdown`；数据库/API 返回的链接必须经 `resolveSafeHttpUrl` 过滤
- JSON 与 SSE 请求统一通过 `src/api/client.ts` 处理 API Base URL、Bearer Token 和 `401`；流式请求必须支持取消

## AI 能力规范（适用于 `apps/api/src/ai` 与 `apps/api/src/routes/chat`）

- 普通对话与 Scholar RAG 统一由主后端 `/chat` 提供
- 模型客户端、embedding、提示词、检索工具和 mode handler 统一放在 `apps/api/src/ai`
- `apps/api/src/routes/chat` 只负责鉴权、HTTP/SSE 协议、会话归属和历史持久化
- 新增对话能力时使用明确的 `mode` handler 隔离提示词和检索逻辑，并在后端统一登记 mode
- 不在前端直接调用模型服务，鉴权、流式协议和模型配置统一由 `apps/api` 管理

## 前端使用 Figma MCP 规范

- 使用 Figma MCP 时，优先下载设计稿中的图标和图片文件
- 避免自行绘制或重新创建图标，直接使用设计稿提供的资源
- 确保下载的资源与设计稿保持一致的视觉效果和尺寸

## 参考资料

- API 框架文档索引：`docs/zh/api.md`
- 前端框架文档索引：`docs/zh/web.md`
