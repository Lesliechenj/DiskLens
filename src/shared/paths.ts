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
