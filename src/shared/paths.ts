// 路径校验结果 → 人话错误提示（纯函数，可单测）
// 新手第一坑：把「C盘」当路径输、或者选了个文件就来扫——
// 不能甩一句 ENOENT 了事，要告诉他哪儿错了、怎么改

export interface PathCheckResult {
  /** 路径是否存在 */
  exists: boolean
  /** 是否是目录 */
  isDir: boolean
}

/** 校验不过时返回人话提示；通过返回 null */
export function pathErrorMessage(check: PathCheckResult): string | null {
  if (!check.exists) {
    return '找不到这个路径。检查三处：①「C盘」要写成「C:/」；② 斜杠用 / 不是 \\；③ 有没有错别字或多余空格。'
  }
  if (!check.isDir) {
    return '这是一个文件，不是文件夹。DiskLens 是扫整个文件夹的——把文件所在的那个文件夹选进来。'
  }
  return null
}

/** 宽容解析用户输入的路径：把「C盘」「C:」「c:/」「"C:\Users\x"」都掰成可用路径（纯函数） */
export function normalizeUserPath(raw: string): string {
  let input = raw.trim()
  // 去掉成对引号（从资源管理器"复制为路径"粘出来的常见形态）
  if (
    (input.startsWith('"') && input.endsWith('"')) ||
    (input.startsWith("'") && input.endsWith("'"))
  ) {
    input = input.slice(1, -1).trim()
  }
  // 「C盘」「c盘」→ 「C:/」
  const cnDisk = /^([a-zA-Z])\s*盘$/.exec(input)
  if (cnDisk) return `${cnDisk[1].toUpperCase()}:/`
  // 光秃秃的盘符「C:」「c」→ 「C:/」
  if (/^[a-zA-Z]$/.test(input)) return `${input.toUpperCase()}:/`
  if (/^[a-zA-Z]:$/.test(input)) return `${input.slice(0, 2)}/`
  // 反斜杠统一成正斜杠（Windows 也能吃，且提示文案里教的就是 /）
  return input.replace(/\\/g, '/')
}

/** 是否是盘符根路径（如 C:/），用于「扫整个盘」的特别提示 */
export function isDriveRoot(path: string): boolean {
  return /^[a-zA-Z]:\/?$/.test(path) || path === '/'
}

/** 取路径最后一段（文件名/目录名），末尾斜杠自动忽略 */
export function baseNameOf(path: string): string {
  const clean = path.replace(/[\\/]+$/, '')
  const index = Math.max(clean.lastIndexOf('/'), clean.lastIndexOf('\\'))
  return index >= 0 ? clean.slice(index + 1) : clean
}

/** 取父目录（拖进来的是文件时，扫它所在的文件夹） */
export function parentDirOf(path: string): string {
  const clean = path.replace(/[\\/]+$/, '')
  const index = Math.max(clean.lastIndexOf('/'), clean.lastIndexOf('\\'))
  if (index <= 0) return clean
  const parent = clean.slice(0, index)
  // Windows 盘符根：C: → C:/
  return /^[a-zA-Z]:$/.test(parent) ? `${parent}/` : parent
}

/**
 * 把用户输入拆成多个路径：支持换行、英文分号、竖线。
 * 例：`C:/  D:/  E:/` 或 `C:/;D:/` 都能一次扫。
 */
export function splitUserPaths(raw: string): string[] {
  return raw
    .split(/[\r\n;|]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

/** 多路径输入 → 规范化后的路径数组（去重、保持顺序） */
export function normalizeUserPaths(raw: string): string[] {
  const seen = new Set<string>()
  const paths: string[] = []
  for (const item of splitUserPaths(raw)) {
    const normalized = normalizeUserPath(item)
    if (!normalized) continue
    const key = normalized.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    paths.push(normalized)
  }
  return paths
}

/** 路径列表 → 一行显示（报告/状态栏用） */
export function formatPathList(paths: string[], max = 6): string {
  if (paths.length === 0) return ''
  if (paths.length <= max) return paths.join(' · ')
  return `${paths.slice(0, max).join(' · ')} 等 ${paths.length} 个位置`
}

/** 判断 child 是否就是 parent 或在 parent 里面（大小写/斜杠都不敏感） */
export function isSameOrInsidePath(child: string, parent: string): boolean {
  const normalize = (value: string): string =>
    value.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
  const c = normalize(child)
  const p = normalize(parent)
  if (!p) return false
  return c === p || c.startsWith(`${p}/`)
}

/** Windows 上这些位置需要管理员权限才能删；其它平台恒为 false */
const WINDOWS_PROTECTED_ROOTS = [
  'c:/windows',
  'c:/program files',
  'c:/program files (x86)',
  'c:/programdata',
  'c:/$recycle.bin',
  'c:/system volume information',
  'c:/recovery',
  'c:/boot',
  'c:/efi',
  'c:/perflogs',
  'c:/config.msi',
  'c:/documents and settings',
  'c:/windows.old'
]

/** 这个路径是否属于"普通权限删不动，需要管理员"的位置 */
export function isProtectedPath(path: string): boolean {
  const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
  if (!/^[a-z]:\//.test(normalized)) return false
  // 盘符根（C:/）本身也不能当普通文件删
  if (/^[a-z]:$/.test(normalized)) return true
  return WINDOWS_PROTECTED_ROOTS.some(
    (root) => normalized === root || normalized.startsWith(`${root}/`)
  )
}

/** 这批路径里是否至少有一个需要管理员权限 */
export function needsAdminForPaths(paths: string[]): boolean {
  return paths.some((path) => isProtectedPath(path))
}
