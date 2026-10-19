// 人话格式化工具：给电脑小白看的，不甩术语

/** 字节数转人话（1024 进制，如 1536 → "1.5 KB"） */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / Math.pow(1024, i)
  // TB 级保留 2 位、GB/MB 级 1 位、更小取整——一眼能读的长度
  const digits = i >= 4 ? 2 : i >= 2 ? 1 : 0
  return `${value.toFixed(digits)} ${units[i]}`
}

/** 毫秒转人话（如 8300 → "8.3 秒"） */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '0 毫秒'
  if (ms < 1000) return `${Math.round(ms)} 毫秒`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} 秒`
  const minutes = Math.floor(ms / 60_000)
  const seconds = Math.round((ms % 60_000) / 1000)
  if (minutes < 60) return `${minutes} 分 ${seconds} 秒`
  const hours = Math.floor(minutes / 60)
  return `${hours} 小时 ${minutes % 60} 分`
}

/** 时间戳转本地时间（zh-CN，24 小时制） */
export function formatTime(ts: number): string {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('zh-CN', { hour12: false })
}

/** 时间戳转"多久以前"，超过一年回落完整日期 */
export function formatRelativeTime(ts: number, now = Date.now()): string {
  if (!ts) return '—'
  const diff = now - ts
  if (diff < 0) return formatTime(ts)
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour
  if (diff < minute) return '刚刚'
  if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`
  if (diff < 30 * day) return `${Math.floor(diff / day)} 天前`
  if (diff < 365 * day) return `${Math.floor(diff / (30 * day))} 个月前`
  return new Date(ts).toLocaleDateString('zh-CN')
}

/** 千分位计数（如 12345 → "12,345"） */
export function formatCount(n: number): string {
  if (!Number.isFinite(n)) return '0'
  return Math.round(n).toLocaleString('zh-CN')
}

/** 百分比：分母为 0 返回 "0.0"；极小值显示 "<0.1" 而不是骗人的 0.0 */
export function formatPercent(part: number, total: number, digits = 1): string {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0 || part <= 0) return '0.0'
  const pct = (part / total) * 100
  if (pct > 0 && pct < 0.1) return '<0.1'
  return pct.toFixed(digits)
}

/** 短路径显示：中间省略，保住盘符和文件名 */
export function ellipsisPath(path: string, max = 60): string {
  if (path.length <= max) return path
  const headLen = Math.max(12, Math.floor(max * 0.35))
  const tailLen = Math.max(12, Math.floor(max * 0.55))
  return `${path.slice(0, headLen)}…${path.slice(-tailLen)}`
}
