// 人话格式化工具：给电脑小白看的，不甩术语

/** 字节数转人话（1024 进制，如 1536 → "1.5 KB"） */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / Math.pow(1024, i)
  // MB 以上保留 1 位小数，以下取整
  const digits = i >= 2 ? 1 : 0
  return `${value.toFixed(digits)} ${units[i]}`
}

/** 毫秒转人话（如 8300 → "8.3 秒"） */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} 毫秒`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} 秒`
  const minutes = Math.floor(ms / 60_000)
  const seconds = Math.round((ms % 60_000) / 1000)
  return `${minutes} 分 ${seconds} 秒`
}

/** 时间戳转本地时间（zh-CN，24 小时制） */
export function formatTime(ts: number): string {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('zh-CN', { hour12: false })
}

/** 千分位计数（如 12345 → "12,345"） */
export function formatCount(n: number): string {
  return n.toLocaleString('zh-CN')
}
