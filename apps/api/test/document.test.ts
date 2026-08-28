import assert from 'node:assert/strict'
import test from 'node:test'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import {
  buildBm25DocumentStatistics,
  buildPaperEmbeddingText,
  buildPaperIndexText,
  buildTsvText,
  normalizeSearchTerms,
  pdfToMarkdown,
  splitText,
  tokenizeText,
} from '../src/utils/document'

test('document text helpers build deterministic embedding input', async () => {
  assert.equal(buildPaperEmbeddingText(' A title ', ' An abstract '), 'A title\n\nAn abstract')
  assert.equal(buildPaperEmbeddingText(' A title ', null), 'A title')
  assert.equal(buildPaperEmbeddingText(' ', ' '), null)
  assert.equal(
    buildPaperIndexText(' A title ', ' An abstract ', ' Full PDF text '),
    'A title\n\nAn abstract\n\nFull PDF text',
  )

  assert.deepEqual(await splitText('abcdefghij', { chunkSize: 4, chunkOverlap: 1 }), [
    'abcd',
    'defg',
    'ghij',
  ])
  assert.deepEqual(await splitText('   '), [])
  await assert.rejects(splitText('text', { chunkSize: 4, chunkOverlap: 4 }))
})

test('document tokenization works without native segmentation dependencies', () => {
  const tokens = tokenizeText('学者 research timeline')
  assert.equal(tokens.includes('学者'), true)
  assert.equal(tokens.includes('research'), true)
  assert.equal(buildTsvText('学者 research').includes('research'), true)

  assert.deepEqual(normalizeSearchTerms('BM25, BM25 学者!'), ['bm25', 'bm25', '学者'])
  assert.deepEqual(buildBm25DocumentStatistics('BM25 BM25 学者'), {
    length: 3,
    termFrequencies: { bm25: 2, 学者: 1 },
  })
})

test('PDF text extraction uses the dedicated PDF parser', async () => {
  const document = await PDFDocument.create()
  const page = document.addPage()
  const font = await document.embedFont(StandardFonts.Helvetica)
  page.drawText('Scholar PDF extraction', { x: 40, y: 700, font, size: 12 })

  const pdf = Buffer.from(await document.save())
  const text = await pdfToMarkdown(pdf)
  assert.match(text, /Scholar PDF extraction/u)
})
