// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { renderSafeMarkdown } from '../src/utils/markdown'

describe('safe Markdown rendering', () => {
  it('keeps supported Markdown formatting', () => {
    const html = renderSafeMarkdown('**Scholar**\n\n[Paper](https://example.com/paper)')

    expect(html).toContain('<strong>Scholar</strong>')
    expect(html).toContain('href="https://example.com/paper"')
  })

  it('removes executable HTML and unsafe URLs', () => {
    const html = renderSafeMarkdown(
      '<img src=x onerror="alert(1)"> [unsafe](javascript:alert(1))',
    )

    expect(html).not.toContain('<img')
    expect(html).not.toContain('onerror')
    expect(html).not.toContain('javascript:')
  })

  it('adds only the trusted streaming cursor markup', () => {
    const html = renderSafeMarkdown('Streaming response', true)

    expect(html.match(/typing-cursor/gu)).toHaveLength(1)
  })
})
