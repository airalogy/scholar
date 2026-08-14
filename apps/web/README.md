# @airalogy/scholar-web

位于 `apps/web` 的 Vue 3 + Vite + Arco Design 前端应用。

## 技术栈

- **Vue 3** - 渐进式 JavaScript 框架
- **Vite 8** - 前端构建工具
- **Arco Design 2.58** - 字节跳动企业级 UI 组件库
- **Vue Router 4** - 官方路由管理器
- **Fetch API** - 由 `src/api/client.ts` 统一封装鉴权、超时与错误处理
- **Marked + DOMPurify** - 渲染并清洗 AI Markdown，禁止可执行 HTML 和 URL
- **TypeScript** - 类型安全

## 开发

### 启动开发服务器

```bash
pnpm dev
```

应用运行在 `http://localhost:5173`

### 构建

```bash
pnpm build
```

生产构建会同时生成 `dist/third-party-licenses.md`，记录实际进入浏览器 bundle 的第三方许可证；生产镜像会保留该文件。

### 预览构建结果

```bash
pnpm preview
```

## 项目结构

```
src/
├── main.ts               # 应用入口
├── App.vue               # 根组件
├── style.sass            # 全局样式
├── api/                  # 接口请求封装
├── components/           # 可复用组件
├── composables/          # 组合式逻辑
├── router/               # 路由配置
├── theme/                # 主题与设计变量
└── views/                # 页面视图
```

## API 代理

开发环境下，接口请求统一代理到主后端：

```typescript
// 请求 /api/users 会代理到 http://localhost:3000/users
apiClient.get('/users')

// 学者推荐与普通聊天统一调用主后端 /chat
apiClient.postStream('/chat', {
  messages,
  mode: 'scholar_recommendation',
  stream: true,
})
```

SSE 请求与普通 JSON 请求使用同一个 API Base URL、Bearer Token 和 `401` 处理；用户停止生成时会同时取消浏览器和后端模型请求。

代理配置位于 `vite.config.ts`。

产品名称、品牌 logo、机构 logo 和机构水印由 `GET /auth/public-config` 统一控制。机构资产只能使用后端下发并经过 HTTP(S)/同域路径校验的 URL，不能硬编码到通用前端仓库。

## 代码质量

```bash
# ESLint 检查（不修改文件）
pnpm lint

# ESLint 自动修复
pnpm lint:fix

# TypeScript 类型检查
pnpm type-check

# 单元测试
pnpm test
```

## 相关文档

- [Vue 3 文档](https://vuejs.org/)
- [Vite 文档](https://vitejs.dev/)
- [Arco Design Vue 文档](https://arco.design/vue)
- [Vue Router 文档](https://router.vuejs.org/)
- [单机构私有化部署说明](../../docs/private-deployment.md)
