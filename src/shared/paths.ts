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
