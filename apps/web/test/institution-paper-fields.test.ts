// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, type App } from 'vue'
import i18n from '@/i18n'
import InstitutionPaperFields from '@/components/InstitutionPaperFields.vue'
import { saveBibliographyField, type BibliographyField } from '@/api/bibliography'

vi.mock('@/api/bibliography', () => ({ saveBibliographyField: vi.fn() }))
const field: BibliographyField = { key: 'flag', label: '匿名字段', label_en: 'Anonymous field', field_type: 'boolean', options: [], visibility: 'admin', is_active: true, is_required: false, display_order: 0 }
let app: App | undefined
const settle = async (): Promise<void> => { for (let i = 0; i < 30; i++) { await Promise.resolve(); await nextTick() } }
const mount = async (disabled = false): Promise<void> => {
  const root = document.createElement('div'); document.body.append(root)
  app = createApp(InstitutionPaperFields, { slug: 'anonymous', fields: [field], disabled }).use(i18n)
  app.mount(root); await settle()
}
const click = async (text: string): Promise<void> => {
  const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find(value => value.textContent === text)!
  button.click(); await settle()
}
const submit = async (): Promise<void> => {
  document.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  await settle()
}
beforeEach(() => { vi.resetAllMocks(); i18n.global.locale.value = 'zh-CN' })
afterEach(() => { app?.unmount(); app = undefined; document.body.replaceChildren() })

describe('institution paper field configuration', () => {
  it('keeps stable keys, allows deactivation and sends real booleans', async () => {
    await mount(); await click('编辑字段')
    expect(document.querySelector<HTMLInputElement>('[name="key"]')?.disabled).toBe(true)
    document.querySelector<HTMLInputElement>('[name="is_active"]')!.click(); await settle()
    vi.mocked(saveBibliographyField).mockResolvedValue({ ...field, is_active: false })
    await submit()
    expect(saveBibliographyField).toHaveBeenCalledWith('anonymous', expect.objectContaining({ key: 'flag', is_active: false, is_required: false }), expect.any(AbortSignal))
    expect(document.querySelector('[role="status"]')?.textContent).toContain('重新预览')
  })
  it('prevents a new field from overwriting an existing key', async () => {
    await mount(); await click('新增字段')
    const input = document.querySelector<HTMLInputElement>('[name="key"]')!
    input.value = 'flag'; input.dispatchEvent(new Event('input', { bubbles: true })); await settle()
    await submit()
    expect(saveBibliographyField).not.toHaveBeenCalled()
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('字段标识已存在')
  })
  it('keeps unsaved input after a server constraint conflict', async () => {
    await mount(); await click('编辑字段')
    vi.mocked(saveBibliographyField).mockRejectedValue(new Error('Existing values conflict'))
    await submit()
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('Existing values conflict')
    expect(document.querySelector('form')).not.toBeNull()
  })
  it('disables actions while the parent is busy and switches labels with the locale', async () => {
    i18n.global.locale.value = 'en-US'
    await mount(true)
    expect(document.body.textContent).toContain('Anonymous field')
    expect([...document.querySelectorAll('button')].every(button => button.disabled)).toBe(true)
  })
})
