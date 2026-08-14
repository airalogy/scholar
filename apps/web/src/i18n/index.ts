import { createI18n } from 'vue-i18n'
import zhCN from '@/locales/zh-CN'
import enUS from '@/locales/en-US'

export const SUPPORTED_LOCALES = ['zh-CN', 'en-US'] as const
export type AppLocale = typeof SUPPORTED_LOCALES[number]

const LOCALE_STORAGE_KEY = 'scholar-locale'
const DEFAULT_LOCALE: AppLocale = 'zh-CN'

const resolveInitialLocale = (): AppLocale => {
  const stored = localStorage.getItem(LOCALE_STORAGE_KEY)
  if (stored && SUPPORTED_LOCALES.includes(stored as AppLocale)) {
    return stored as AppLocale
  }

  return DEFAULT_LOCALE
}

export const i18n = createI18n({
  legacy: false,
  globalInjection: true,
  locale: resolveInitialLocale(),
  fallbackLocale: DEFAULT_LOCALE,
  messages: {
    'zh-CN': zhCN,
    'en-US': enUS,
  },
})

export const getCurrentLocale = (): AppLocale => {
  return i18n.global.locale.value as AppLocale
}

export const setAppLocale = (locale: AppLocale): void => {
  i18n.global.locale.value = locale
  localStorage.setItem(LOCALE_STORAGE_KEY, locale)
  document.documentElement.lang = locale
}

document.documentElement.lang = getCurrentLocale()

export default i18n
