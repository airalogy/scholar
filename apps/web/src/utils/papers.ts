export const hasPublishYear = (value: number | null | undefined): value is number => {
  return typeof value === 'number' && value > 0
}
