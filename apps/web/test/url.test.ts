import { describe, expect, it } from 'vitest'
import { resolveSafeHttpUrl } from '../src/utils/url'

describe('safe link URLs', () => {
  it('allows explicit HTTP(S) URLs and application-relative paths', () => {
    expect(resolveSafeHttpUrl('https://example.com/scholar')).toBe(
      'https://example.com/scholar',
    )
    expect(resolveSafeHttpUrl('/api/files/preview')).toBe('/api/files/preview')
  })

  it('rejects executable, protocol-relative, and malformed URLs', () => {
    expect(resolveSafeHttpUrl('javascript:alert(1)')).toBeUndefined()
    expect(resolveSafeHttpUrl('//evil.example/path')).toBeUndefined()
    expect(resolveSafeHttpUrl('not a URL')).toBeUndefined()
  })
})
