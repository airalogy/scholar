import { computed } from 'vue'
import arcoEnUS from '@arco-design/web-vue/es/locale/lang/en-us'
import arcoZhCN from '@arco-design/web-vue/es/locale/lang/zh-cn'
import { SUPPORTED_LOCALES, getCurrentLocale, setAppLocale, type AppLocale } from '@/i18n'

const ARCO_LOCALE_MAP = {
  'zh-CN': arcoZhCN,
  'en-US': arcoEnUS,
} as const

const LANGUAGE_OPTIONS: Array<{ value: AppLocale, labelKey: string }> = [
  { value: 'zh-CN', labelKey: 'language.zhCN' },
  { value: 'en-US', labelKey: 'language.enUS' },
]

export const isAppLocale = (value: string): value is AppLocale => {
  return SUPPORTED_LOCALES.includes(value as AppLocale)
}

export function useLocale() {
  const locale = computed<AppLocale>(() => getCurrentLocale())
  const arcoLocale = computed(() => ARCO_LOCALE_MAP[locale.value])

  const updateLocale = (value: AppLocale): void => {
    setAppLocale(value)
  }

  return {
    locale,
    arcoLocale,
    languageOptions: LANGUAGE_OPTIONS,
    updateLocale,
  }
}
