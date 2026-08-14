export interface ParsedCsvRow {
  rowNumber: number
  values: string[]
}

export interface ParsedCsvRecord {
  rowNumber: number
  record: Record<string, string>
}

const normalizeCell = (value: string): string => {
  return value.trim()
}

export const parseCsv = (input: string): ParsedCsvRow[] => {
  const text = input.replace(/^\uFEFF/u, '')
  const rows: ParsedCsvRow[] = []
  let values: string[] = []
  let value = ''
  let inQuotes = false
  let rowNumber = 1

  const pushRow = (): void => {
    const nextValues = [...values, value].map(normalizeCell)
    if (nextValues.some((cell) => cell.length > 0)) {
      rows.push({ rowNumber, values: nextValues })
    }
    values = []
    value = ''
    rowNumber += 1
  }

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]

    if (character === '"') {
      if (inQuotes && text[index + 1] === '"') {
        value += '"'
        index += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (!inQuotes && character === ',') {
      values.push(value)
      value = ''
      continue
    }

    if (!inQuotes && (character === '\n' || character === '\r')) {
      if (character === '\r' && text[index + 1] === '\n') {
        index += 1
      }
      pushRow()
      continue
    }

    value += character
  }

  if (inQuotes) {
    throw new Error('CSV contains an unclosed quoted field')
  }

  if (value.length > 0 || values.length > 0) {
    pushRow()
  }

  return rows
}

export const parseStrictCsvRecords = (
  input: string,
  expectedHeaders: string[],
): ParsedCsvRecord[] => {
  const rows = parseCsv(input)
  if (rows.length === 0) {
    throw new Error('CSV is empty')
  }

  const headers = rows[0].values.map((header) => header.toLowerCase())
  const expected = expectedHeaders.map((header) => header.toLowerCase())
  if (
    headers.length !== expected.length ||
    headers.some((header, index) => header !== expected[index])
  ) {
    throw new Error(`CSV headers must be exactly: ${expectedHeaders.join(', ')}`)
  }

  return rows.slice(1).map((row) => {
    if (row.values.length !== headers.length) {
      throw new Error(`Row ${row.rowNumber} has ${row.values.length} cells; expected ${headers.length}`)
    }

    return {
      rowNumber: row.rowNumber,
      record: Object.fromEntries(headers.map((header, index) => [header, row.values[index]])),
    }
  })
}
