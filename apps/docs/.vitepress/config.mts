import { readFileSync } from 'node:fs'
import { defineConfig, type DefaultTheme } from 'vitepress'

const productVersion = readFileSync(new URL('../../../VERSION', import.meta.url), 'utf8').trim()

const zhSidebar: DefaultTheme.Sidebar = [
  {
    text: '开始使用',
    items: [
      { text: '文档首页', link: '/zh/' },
      { text: '系统接入概览', link: '/zh/integration/' },
    ],
  },
  {
    text: '机构管理',
    items: [
      { text: '管理控制台', link: '/zh/administration/' },
      { text: '管理后台导入', link: '/zh/administration/data-import' },
    ],
  },
  {
    text: '系统接入',
    items: [
      { text: '鉴权与权限', link: '/zh/integration/authentication' },
      { text: '批量导入 API', link: '/zh/integration/bulk-import' },
    ],
  },
  {
    text: 'API 参考',
    items: [
      { text: 'OpenAPI 与 Swagger', link: '/zh/reference/openapi' },
    ],
  },
]

const enSidebar: DefaultTheme.Sidebar = [
  {
    text: 'Getting Started',
    items: [
      { text: 'Documentation Home', link: '/en/' },
      { text: 'Integration Overview', link: '/en/integration/' },
    ],
  },
  {
    text: 'Institution Administration',
    items: [
      { text: 'Admin Console', link: '/en/administration/' },
      { text: 'Admin Console Import', link: '/en/administration/data-import' },
    ],
  },
  {
    text: 'System Integration',
    items: [
      { text: 'Authentication and Access', link: '/en/integration/authentication' },
      { text: 'Bulk Import API', link: '/en/integration/bulk-import' },
    ],
  },
  {
    text: 'API Reference',
    items: [
      { text: 'OpenAPI and Swagger', link: '/en/reference/openapi' },
    ],
  },
]

const sharedThemeConfig: DefaultTheme.Config = {
  search: {
    provider: 'local',
  },
  socialLinks: [
    { icon: 'github', link: 'https://github.com/airalogy/scholar' },
  ],
}

const zhThemeConfig: DefaultTheme.Config = {
  ...sharedThemeConfig,
  nav: [
    { text: '机构接入', link: '/zh/integration/' },
    { text: '批量导入', link: '/zh/integration/bulk-import' },
    { text: 'API 参考', link: '/zh/reference/openapi' },
    {
      text: `v${productVersion}`,
      link: `https://github.com/airalogy/scholar/releases/tag/v${productVersion}`,
    },
  ],
  sidebar: zhSidebar,
  outline: { label: '本页目录', level: [2, 3] },
  docFooter: { prev: '上一页', next: '下一页' },
  returnToTopLabel: '返回顶部',
  sidebarMenuLabel: '目录',
  darkModeSwitchLabel: '外观',
  langMenuLabel: '语言',
  footer: {
    message: '文档与 Airalogy Scholar 产品版本同步交付',
    copyright: 'Copyright © Hangzhou Airalogy Technology Co., Ltd.',
  },
}

const enThemeConfig: DefaultTheme.Config = {
  ...sharedThemeConfig,
  nav: [
    { text: 'Integration', link: '/en/integration/' },
    { text: 'Bulk Import', link: '/en/integration/bulk-import' },
    { text: 'API Reference', link: '/en/reference/openapi' },
    {
      text: `v${productVersion}`,
      link: `https://github.com/airalogy/scholar/releases/tag/v${productVersion}`,
    },
  ],
  sidebar: enSidebar,
  outline: { label: 'On this page', level: [2, 3] },
  docFooter: { prev: 'Previous page', next: 'Next page' },
  returnToTopLabel: 'Return to top',
  sidebarMenuLabel: 'Menu',
  darkModeSwitchLabel: 'Appearance',
  langMenuLabel: 'Language',
  footer: {
    message: 'Documentation is delivered with the matching Airalogy Scholar product version',
    copyright: 'Copyright © Hangzhou Airalogy Technology Co., Ltd.',
  },
}

export default defineConfig({
  base: '/docs/',
  title: 'Airalogy Scholar Documentation',
  description: 'Airalogy Scholar product documentation',
  cleanUrls: true,
  lastUpdated: false,
  head: [
    ['meta', { name: 'theme-color', content: '#00498f' }],
    ['meta', { name: 'application-name', content: 'Airalogy Scholar Documentation' }],
  ],
  locales: {
    zh: {
      label: '简体中文',
      lang: 'zh-CN',
      title: 'Airalogy Scholar 文档',
      description: 'Airalogy Scholar 使用、机构管理与系统接入文档',
      link: '/zh/',
      themeConfig: zhThemeConfig,
    },
    en: {
      label: 'English',
      lang: 'en-US',
      title: 'Airalogy Scholar Documentation',
      description: 'User, institution administration, and integration documentation for Airalogy Scholar',
      link: '/en/',
      themeConfig: enThemeConfig,
    },
  },
  themeConfig: sharedThemeConfig,
  transformPageData(pageData) {
    pageData.frontmatter.scholarVersion = productVersion
  },
})
