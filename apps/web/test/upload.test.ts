// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, type App } from 'vue'
import i18n from '@/i18n'
import Upload from '@/views/Upload.vue'
import { uploadPaper } from '@/api/papers'
import { getMyProfile } from '@/api/users'
import { getInstitution } from '@/api/institutions'

vi.mock('@/api/papers', () => ({ uploadPaper: vi.fn() }))
vi.mock('@/api/users', () => ({ getMyProfile: vi.fn() }))
vi.mock('@/api/institutions', () => ({ getInstitution: vi.fn(), listInstitutionCatalog: vi.fn() }))
let app: App | undefined
const settle = async (): Promise<void> => { for (let i = 0; i < 20; i++) { await Promise.resolve(); await nextTick() } }
const setInput = (index: number, value: string): void => {
  const input = document.querySelectorAll<HTMLInputElement>('input.form-input')[index]
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
}
const selectFile = (size = 10): void => {
  const input = document.querySelector<HTMLInputElement>('input[type=file]')!
  const file = new File(['%PDF-1.7'], 'example.pdf', { type: 'application/pdf' })
  Object.defineProperty(file, 'size', { value: size })
  Object.defineProperty(input, 'files', { value: [file], configurable: true })
  input.dispatchEvent(new Event('change', { bubbles: true }))
}
const submit = async (): Promise<void> => {
  document.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  await settle()
}
beforeEach(async () => {
  vi.resetAllMocks()
  i18n.global.locale.value = 'zh-CN'
  vi.mocked(getMyProfile).mockResolvedValue({ institution_memberships: [{ id: 'institution', slug: 'example', name: 'Example', role: 'member' }], lab_memberships: [] } as never)
  vi.mocked(getInstitution).mockResolvedValue({ labs: [] } as never)
  const root = document.createElement('div')
  document.body.append(root)
  app = createApp(Upload).use(i18n)
  app.component('router-link', { template: '<a><slot /></a>' })
  app.mount(root)
  await settle()
  setInput(0, 'Example paper')
  setInput(1, '10.1234/example')
  selectFile()
  await settle()
})
afterEach(() => { app?.unmount(); app = undefined; document.body.replaceChildren() })

describe('paper upload', () => {
  it('rejects an arXiv ID in the DOI field before transferring any file', async () => {
    setInput(1, '2609.05072v1')
    await submit()
    expect(uploadPaper).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain(i18n.global.t('upload.invalidDoi'))
  })

  it('rejects oversized PDFs locally', async () => {
    selectFile(25 * 1024 * 1024 + 1)
    await settle()
    expect(document.body.textContent).toContain(i18n.global.t('upload.fileTooLarge'))
    expect(uploadPaper).not.toHaveBeenCalled()
  })

  it('preserves input on network failure and normalizes DOI URLs', async () => {
    setInput(1, 'https://doi.org/10.1234/EXAMPLE')
    vi.mocked(uploadPaper).mockRejectedValue(new TypeError('Failed to fetch'))
    await submit()
    expect(vi.mocked(uploadPaper).mock.calls[0][1].doi).toBe('10.1234/example')
    expect(document.body.textContent).toContain(i18n.global.t('upload.networkError'))
    expect(document.querySelector<HTMLInputElement>('input.form-input')?.value).toBe('Example paper')
    expect(document.body.textContent).toContain('example.pdf')
  })

  it('prevents duplicate submissions and lets users cancel without clearing the form', async () => {
    vi.mocked(uploadPaper).mockImplementation(async (_file, _data, signal) => await new Promise((_resolve, reject) => {
      signal?.addEventListener('abort', () => reject(new Error('Request cancelled')))
    }))
    await submit()
    await submit()
    expect(uploadPaper).toHaveBeenCalledOnce()
    document.querySelector<HTMLButtonElement>('.cancel-upload-btn')!.click()
    await settle()
    expect(vi.mocked(uploadPaper).mock.calls[0][2]?.aborted).toBe(true)
    expect(document.body.textContent).toContain(i18n.global.t('upload.cancelled'))
    expect(document.body.textContent).toContain('example.pdf')
  })

  it('cancels the request on navigation away', async () => {
    vi.mocked(uploadPaper).mockImplementation(() => new Promise(() => {}))
    await submit()
    app!.unmount(); app = undefined
    expect(vi.mocked(uploadPaper).mock.calls[0][2]?.aborted).toBe(true)
  })
})
