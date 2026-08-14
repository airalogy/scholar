export const assertDestructiveSeedAllowed = (configuredValue?: string): void => {
  if (configuredValue === 'true') {
    return
  }

  throw new Error(
    '种子脚本会清空核心业务表；仅可对可丢弃数据库显式设置 ALLOW_DESTRUCTIVE_SEED=true 后运行',
  )
}
