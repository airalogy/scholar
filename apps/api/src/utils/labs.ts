export const buildLabSlug = (name: string): string => {
  return name.trim().toLowerCase().replace(/[/_]+/g, '-').replace(/\s+/g, '-').replace(/-+/g, '-')
}
