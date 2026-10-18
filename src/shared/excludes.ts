// F6 排除清单：这些目录默认勾选跳过，防误扫（扫到也是浪费时间）
// 小白场景：手滑选了 C 盘，也不该把 Windows/AppData 拖进图表里

export interface ExcludeItem {
  /** 匹配的目录名（basename，大小写不敏感） */
  name: string
  /** UI 上给用户看的人话说明 */
  desc: string
}

/** 默认排除项（UI 默认勾选，用户可取消） */
export const DEFAULT_EXCLUDE_DIRS: ExcludeItem[] = [
  { name: 'Windows', desc: 'Windows 系统目录' },
  { name: 'AppData', desc: '软件配置和缓存（很多软件的根本身）' },
  { name: '$Recycle.Bin', desc: '回收站（系统占用，不是你删的文件）' },
  { name: 'System Volume Information', desc: '系统还原点/卷影副本' }
]

/** 默认勾选的目录名列表（扫描器按 basename 匹配跳过） */
export const DEFAULT_EXCLUDE_NAMES: string[] = DEFAULT_EXCLUDE_DIRS.map((d) => d.name)
