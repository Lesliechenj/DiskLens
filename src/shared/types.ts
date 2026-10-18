// DiskLens 统一数据契约：扫描产物 = 一棵 JSON 树
// 四个图表（V1 先两个）只是同一份数据的不同渲染 → 切换视图不重复扫盘
// 筛选 = 前端过滤这棵树

/** 树节点：文件或目录 */
export interface ScanNode {
  /** 文件/目录名（不含路径） */
  name: string
  /** 完整路径 */
  path: string
  /** 占用空间（字节）：文件 = 自身大小；目录 = 子节点递归累计 */
  size: number
  /** 节点类型 */
  type: 'file' | 'dir'
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
}

/** 扫描完成后的完整结果 */
export interface ScanResult {
  /** 根节点（被扫描的目录本身） */
  root: ScanNode
  /** 无权限/读取失败被跳过的目录列表（F1：跳过并记录，不弹窗不打断） */
  skipped: string[]
  /** 扫描耗时（毫秒） */
  durationMs: number
}

/** 扫描状态机 */
export type ScanStatus = 'idle' | 'scanning' | 'done' | 'error'
