import { PDFParse } from 'pdf-parse'

export interface SplitTextOptions {
  chunkSize?: number
  chunkOverlap?: number
}

const DEFAULT_CHUNK_SIZE = 1000
const DEFAULT_CHUNK_OVERLAP = 100
const wordSegmenter = new Intl.Segmenter('zh-CN', { granularity: 'word' })

const normalizeOptionalString = (value: string | null | undefined): string | null => {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export const pdfToMarkdown = async (buffer: Buffer): Promise<string> => {
  const parser = new PDFParse({ data: buffer })
  try {
    const result = await parser.getText()
    return result.text
  } finally {
    await parser.destroy()
  }
}

export const buildPaperEmbeddingText = (title: string, abstract: string | null): string | null => {
  const normalizedTitle = normalizeOptionalString(title)
  const normalizedAbstract = normalizeOptionalString(abstract)

  if (!normalizedTitle && !normalizedAbstract) {
    return null
  }

  if (!normalizedTitle) {
    return normalizedAbstract
  }

  if (!normalizedAbstract) {
    return normalizedTitle
  }

  return `${normalizedTitle}\n\n${normalizedAbstract}`
}

export const splitText = async (
  text: string,
  options: SplitTextOptions = {},
): Promise<string[]> => {
  const normalizedText = text.trim()
  if (normalizedText.length === 0) {
    return []
  }

  const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE
  const chunkOverlap = options.chunkOverlap ?? DEFAULT_CHUNK_OVERLAP
  if (!Number.isInteger(chunkSize) || chunkSize < 1) {
    throw new Error('chunkSize must be a positive integer')
  }
  if (!Number.isInteger(chunkOverlap) || chunkOverlap < 0 || chunkOverlap >= chunkSize) {
    throw new Error('chunkOverlap must be a non-negative integer smaller than chunkSize')
  }

  const characters = Array.from(normalizedText)
  const chunks: string[] = []
  const step = chunkSize - chunkOverlap

  for (let start = 0; start < characters.length; start += step) {
    const chunk = characters
      .slice(start, start + chunkSize)
      .join('')
      .trim()
    if (chunk) {
      chunks.push(chunk)
    }

    if (start + chunkSize >= characters.length) {
      break
    }
  }

  return chunks
}

export const tokenizeText = (text: string): string[] => {
  return Array.from(wordSegmenter.segment(text), ({ segment }) => segment)
}

export const buildTsvText = (text: string): string => {
  return tokenizeText(text)
    .filter((token) => token.trim())
    .join(' ')
}
