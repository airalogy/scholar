import DOMPurify from 'dompurify'
import { marked } from 'marked'

const ALLOWED_MARKDOWN_TAGS = [
  'a',
  'blockquote',
  'br',
  'code',
  'del',
  'em',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'li',
  'ol',
  'p',
  'pre',
  'strong',
  'table',
  'tbody',
  'td',
  'th',
  'thead',
  'tr',
  'ul',
] as const

marked.use({ breaks: true })

const insertTypingCursor = (html: string): string => {
  const cursor = '<span class="typing-cursor"></span>'
  const lastClosingTag = html.lastIndexOf('</')
  if (lastClosingTag === -1) {
    return `${html}${cursor}`
  }

  return `${html.slice(0, lastClosingTag)}${cursor}${html.slice(lastClosingTag)}`
}

export const renderSafeMarkdown = (text: string, showCursor = false): string => {
  const rendered = marked.parse(text) as string
  const sanitized = DOMPurify.sanitize(rendered, {
    ALLOWED_TAGS: [...ALLOWED_MARKDOWN_TAGS],
    ALLOWED_ATTR: ['class', 'href', 'title'],
  })

  return showCursor && text ? insertTypingCursor(sanitized) : sanitized
}
