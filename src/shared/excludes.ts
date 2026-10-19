// 排除清单：这些目录默认勾选跳过，防误扫（扫到也是浪费时间）
// 小白场景：手滑选了 C 盘，也不该把 Windows/AppData 拖进图表里

export interface ExcludeItem {
  /** 匹配的目录名（basename，大小写不敏感） */
  name: string
  /** UI 上给用户看的人话说明 */
  desc: string
  /** 分组：系统保护 / 开发缓存（UI 分组展示） */
  group: 'system' | 'dev'
  /** 是否默认勾选 */
  defaultOn: boolean
}

/** 可选的排除项（系统保护目录默认勾选，开发缓存默认不勾） */
export const EXCLUDE_ITEMS: ExcludeItem[] = [
  { name: 'Windows', desc: 'Windows 系统目录', group: 'system', defaultOn: true },
  { name: 'AppData', desc: '软件配置和缓存（很多软件的根本身）', group: 'system', defaultOn: true },
  {
    name: '$Recycle.Bin',
    desc: '回收站（系统占用，不是你删的文件）',
    group: 'system',
    defaultOn: true
  },
  {
    name: 'System Volume Information',
    desc: '系统还原点/卷影副本',
    group: 'system',
    defaultOn: true
  },
  { name: '$WinREAgent', desc: '系统恢复临时目录', group: 'system', defaultOn: true },
  { name: 'Recovery', desc: '系统恢复分区内容', group: 'system', defaultOn: false },
  {
    name: 'Program Files',
    desc: '已安装的软件（要用卸载程序，别硬删）',
    group: 'system',
    defaultOn: false
  },
  { name: 'Program Files (x86)', desc: '32 位软件安装目录', group: 'system', defaultOn: false },
  { name: 'ProgramData', desc: '程序共享数据', group: 'system', defaultOn: false },
  { name: 'Windows.old', desc: '系统升级留下的旧系统备份', group: 'system', defaultOn: false },
  { name: 'node_modules', desc: '前端依赖包（开发项目缓存）', group: 'dev', defaultOn: false },
  { name: '.git', desc: 'Git 版本库数据', group: 'dev', defaultOn: false },
  { name: '__pycache__', desc: 'Python 字节码缓存', group: 'dev', defaultOn: false },
  { name: 'target', desc: 'Rust/Java 编译产物', group: 'dev', defaultOn: false }
]

/** 默认勾选的目录名列表（扫描器按 basename 匹配跳过） */
export const DEFAULT_EXCLUDE_NAMES: string[] = EXCLUDE_ITEMS.filter((d) => d.defaultOn).map(
  (d) => d.name
)

/** 全部可选项的目录名（兼容旧代码的平铺列表） */
export const ALL_EXCLUDE_NAMES: string[] = EXCLUDE_ITEMS.map((d) => d.name)

/** 系统保护组的目录名：风险分级里天然属于「别动」 */
export const SYSTEM_EXCLUDE_NAMES: string[] = EXCLUDE_ITEMS.filter((d) => d.group === 'system').map(
  (d) => d.name
)
