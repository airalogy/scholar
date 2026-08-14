import { createHash } from 'node:crypto'
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib'

export interface PdfWatermarkOptions {
  visibleTextLines: string[]
  metadataFingerprint: string
  mode: 'preview' | 'download'
}

const clamp = (value: number, min: number, max: number): number => {
  return Math.min(max, Math.max(min, value))
}

const normalizeVisibleText = (value: string): string => {
  return value.replace(/\s+/g, ' ').trim()
}

export const applyPdfWatermark = async (
  sourceBuffer: Buffer,
  options: PdfWatermarkOptions,
): Promise<Buffer> => {
  const pdfDoc = await PDFDocument.load(sourceBuffer)
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const visibleText = options.visibleTextLines
    .map(normalizeVisibleText)
    .filter((value) => value.length > 0)
    .join(' | ')

  pdfDoc.setProducer('Airalogy Scholar')
  pdfDoc.setCreator('Airalogy Scholar protected file service')
  pdfDoc.setSubject(`trace:${options.metadataFingerprint}`)
  pdfDoc.setKeywords([
    'airalogy-protected',
    `mode:${options.mode}`,
    `trace:${options.metadataFingerprint}`,
  ])

  if (!visibleText) {
    return Buffer.from(await pdfDoc.save())
  }

  for (const page of pdfDoc.getPages()) {
    const { width, height } = page.getSize()
    const fontSize = clamp(Math.min(width, height) / 22, 16, 26)
    const textWidth = font.widthOfTextAtSize(visibleText, fontSize)
    const stepX = Math.max(textWidth + 72, width * 0.66)
    const stepY = Math.max(fontSize * 5, 140)

    for (let y = -height * 0.25; y < height * 1.2; y += stepY) {
      for (let x = -width * 0.5; x < width * 1.2; x += stepX) {
        page.drawText(visibleText, {
          x,
          y,
          size: fontSize,
          font,
          rotate: degrees(-32),
          color: rgb(0.68, 0.12, 0.12),
          opacity: 0.12,
        })
      }
    }

    page.drawText(
      `trace:${createHash('sha256').update(options.metadataFingerprint).digest('hex').slice(0, 12)}`,
      {
        x: 14,
        y: 10,
        size: 6,
        font,
        color: rgb(0.35, 0.35, 0.35),
        opacity: 0.16,
      },
    )
  }

  return Buffer.from(await pdfDoc.save())
}
