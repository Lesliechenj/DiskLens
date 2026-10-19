// DiskLens 统一数据契约：扫描产物 = 一棵 JSON 树
// 所有视图（面积图/旭日图/类型构成/大文件/文件夹/清理建议）只是同一份数据的不同渲染
// → 切换视图不重复扫盘；筛选与搜索 = 前端过滤这棵树

/** 节点类型 */
export type NodeType = 'file' | 'dir'

/** 树节点：文件或目录 */
export interface ScanNode {
  /** 文件/目录名（不含路径） */
  name: string
  /** 完整路径 */
  path: string
  /** 占用空间（字节）：文件 = 自身大小；目录 = 子节点递归累计 */
  size: number
  /** 节点类型 */
  type: NodeType
  /** 修改时间（毫秒时间戳）；目录取子节点中的最大值 */
  mtime: number
  /** 子节点（仅目录有） */
  children?: ScanNode[]
}

/** 扫描进度（经 IPC 实时上报） */
export interface ScanProgress {
  /** 已扫描文件数 */
  files: number
  /** 已遍历目录数 */
  dirs: number
  /** 已累计字节数 */
  bytes: number
  /** 当前正在遍历的目录路径 */
  currentPath: string
  /** 已耗时（毫秒），由扫描进程给出，避免渲染层时钟漂移 */
  elapsedMs: number
}

/** 扫描请求参数 */
export interface ScanRequest {
  /** 要扫描的根路径 */
  rootPath: string
  /** 排除清单：目录名（basename）命中即整棵跳过 */
  excludeNames: string[]
}

/** 扫描统计（扫完才知道的总量） */
export interface ScanStats {
  /** 文件总数 */
  files: number
  /** 目录总数 */
  dirs: number
}

/** 扫描完成后的完整结果 */
export interface ScanResult {
  /** 根节点（被扫描的目录本身） */
  root: ScanNode
  /** 无权限/读取失败被跳过的路径样本（最多 SKIPPED_SAMPLE_LIMIT 条） */
  skipped: string[]
  /** 被跳过的路径总数（样本可能被截断，这个数才是真实值） */
  skippedCount: number
  /** 被排除清单跳过、未遍历的目录数 */
  excluded: number
  /** 扫描耗时（毫秒） */
  durationMs: number
  /** 文件/目录总量统计 */
  stats: ScanStats
}

/** 扫描状态机 */
export type ScanStatus = 'idle' | 'scanning' | 'done' | 'error'

/** 视图类型：同一棵树的六种渲染方式 */
export type ViewKind = 'treemap' | 'sunburst' | 'types' | 'bigfiles' | 'folders' | 'cleanup'

/** 批量移到回收站的单条结果 */
export interface TrashOutcome {
  path: string
  ok: boolean
  /** 失败时的人话原因（主进程只回原始错误，翻译在渲染层） */
  message?: string
}

/** 磁盘分区信息（首页磁盘列表） */
export interface DriveInfo {
  /** 根路径，如 "C:\\" 或 "/" */
  path: string
  /** 显示用盘符/名称，如 "C:" 或 "/" */
  label: string
  /** 卷标（读不到为空串） */
  volumeName: string
  /** 总容量（字节） */
  totalBytes: number
  /** 可用容量（字节） */
  freeBytes: number
  /** 已用容量（字节） */
  usedBytes: number
  /** 是否可移动介质（U 盘/移动硬盘），读不到按 false */
  removable: boolean
}

/** 主题模式 */
export type ThemeMode = 'dark' | 'light' | 'system'

/** 窗口尺寸记忆 */
export interface WindowBounds {
  x?: number
  y?: number
  width: number
  height: number
  maximized: boolean
}

/** 应用设置（主进程 JSON 持久化） */
export interface AppSettings {
  /** 主题：深色 / 浅色 / 跟随系统 */
  theme: ThemeMode
  /** 排除清单：命中即整棵跳过的目录名 */
  excludes: string[]
  /** 图表忽略小于此字节的直接子项（0 = 不过滤），只影响展示不影响统计 */
  minChildSize: number
  /** 记住上次扫描的路径 */
  rememberPath: boolean
  /** 最近一次扫描路径 */
  lastPath: string
  /** 最近扫描过的路径（最多 8 条，去重） */
  recentPaths: string[]
  /** 窗口位置尺寸 */
  windowBounds: WindowBounds | null
}

/** 导出报告：CSV 表格 */
export interface ExportPayload {
  /** 建议文件名（不含扩展名） */
  fileName: string
  /** 表头 */
  header: string[]
  /** 数据行（全部按字符串处理，避免 CSV 注入问题由主进程统一处理） */
  rows: string[][]
}
