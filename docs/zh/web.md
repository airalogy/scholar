# Web（apps/web）

[English](../en/web.md) | 简体中文

## 技术栈与版本（来自 `apps/web/package.json`）

- **Vue**: `^3.5.41`
- **Vite**: `^8.2.0`
- **Arco Design Vue**: `^2.58.0`
- **Vue Router**: `^4.2.0`
- **HTTP Client**: 原生 Fetch API 的项目级封装
- **Markdown safety**: Marked `^17.0.3` + DOMPurify `^3.4.13`

## 官方文档链接

- **Vue 3**
  - https://vuejs.org/
  - https://vuejs.org/guide/introduction.html
  - https://vuejs.org/api/
- **Vite**
  - https://vite.dev/
  - https://vite.dev/guide/
  - https://vite.dev/config/
- **Arco Design Vue**
  - https://arco.design/vue
  - https://arco.design/vue/docs/start
  - https://arco.design/vue/component/overview
- **Vue Router**
  - https://router.vuejs.org/
  - https://router.vuejs.org/guide/
  - https://router.vuejs.org/api/
- **Fetch API**
  - https://developer.mozilla.org/docs/Web/API/Fetch_API
- **DOMPurify**
  - https://github.com/cure53/DOMPurify

## 项目相关要点（建议 AI 参考）

- **组件与页面**
  - 使用 Vue 3 SFC，建议遵循项目约定：`<script setup lang="ts">`。
- **类型检查**
  - 使用 `vue-tsc --noEmit`（脚本：`pnpm -C apps/web type-check`）。
- **API 与内容安全**
  - 普通 JSON 与 SSE 请求均使用 `src/api/client.ts` 的地址、鉴权和 `401` 处理；流式生成必须支持 `AbortSignal`。
  - 任何经 `v-html` 渲染的 AI Markdown 必须调用 `renderSafeMarkdown`，数据库或 API 返回的链接必须经 `resolveSafeHttpUrl` 过滤。
- **开发与构建**
  - 开发：`vite`
  - 构建：`vite build`
- **Lint**
  - `pnpm lint` 只检查；需要修改文件时显式运行 `pnpm lint:fix`。
- **路由**
  - 基于 Vue Router 4；新增页面/路由时，优先查找项目现有路由组织方式再扩展。
  - 首页、登录入口和功能路由不应再写死为固定能力，当前统一由 `GET /auth/public-config` 返回的公开配置驱动。
- **内容治理与管理台**
  - 实验室主页权限边界与角色模型见[内容治理](./content-governance.md)。
  - 论文审核状态、公开展示规则和前端展示边界见[论文审核流程](./paper-review-workflow.md)。
  - 学位论文专题、提交人工作区、结构化编辑器和机构审核台见[学位论文流程](./degree-thesis-workflow.md)。
  - 学位论文入口必须跟随 `features.degreeTheses`；审核员可进入队列，但只有机构 owner/admin 可配置审核流程。
  - 机构管理台中的“预开通成员”与登录弹窗中的“机构成员激活”流程见[内容治理](./content-governance.md)。
  - 登录弹窗中的机构 SSO 若采用 `jit_member`，前端需要明确提示“首次 SSO 自动开通平台账号并加入机构，无需单独注册”，但不能据此暗示管理权限。
  - 私有化部署时，侧边栏中的 AI Chat、上传入口、品牌 logo，以及登录弹窗中的 Airalogy / 机构入口，都应跟随后端公共配置动态显示，而不是在页面里写死。
  - 当 `paperUpload` 被禁用时，上传页入口、空状态里的上传 CTA 等前端跳转都应一并收敛，避免用户落到后端已禁用的接口上。
  - 如果是面向某一家机构交付私有化版本，具体部署 runbook 与推荐能力组合见[私有化部署](./private-deployment.md)。
  - 机构论文库中的“作者绑定”弹窗、机构成员页中的论文统计，以及它们对应的权限边界，见[内容治理](./content-governance.md)。
  - 机构成员展示与统计口径，例如“绑定论文数”与“已审核论文数”的区别，见[论文审核流程](./paper-review-workflow.md)。
  - 登录弹窗中“先机构、后登录方式”的扩展规则见[机构认证](./institution-auth.md)。
