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
  /** 要扫描的根路径（支持一次扫多个盘/多个目录） */
  rootPaths: string[]
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
  /** 根节点（单路径 = 目录本身；多路径 = 「全部磁盘」虚拟根） */
  root: ScanNode
  /** 这次扫描包含的根路径（用于状态栏/快照/重扫） */
  roots: string[]
  /** 是否是一次多路径扫描（根节点为虚拟根） */
  multi: boolean
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

/** 视图类型：同一棵树的多种渲染方式 */
export type ViewKind =
  | 'treemap'
  | 'sunburst'
  | 'tree'
  | 'types'
  | 'bytype'
  | 'bigfiles'
  | 'folders'
  | 'age'
  | 'duplicates'
  | 'archives'
  | 'cleanup'
  | 'trash'

/** 查重的候选文件（渲染层按大小分组后交给主进程比对内容） */
export interface DuplicateCandidateFile {
  /** 完整路径 */
  path: string
  /** 修改时间（毫秒时间戳）：UI 用它决定"默认保留哪一份" */
  mtime: number
}

/** 查重候选组：大小相同的文件才可能内容相同 */
export interface DuplicateCandidateGroup {
  /** 文件大小（字节） */
  size: number
  /** 同大小的文件（至少 2 个） */
  files: DuplicateCandidateFile[]
}

/** 查重进度（主进程经 IPC 实时上报） */
export interface DuplicateProgress {
  /** 阶段：抽样比对 / 完整校验 */
  phase: 'partial' | 'full'
  /** 已完成的候选组 / 总候选组 */
  doneGroups: number
  totalGroups: number
  /** 已完成的文件 / 总文件 */
  doneFiles: number
  totalFiles: number
  /** 已读取字节数 */
  hashedBytes: number
  /** 当前文件路径 */
  current: string
}

/** 一组内容完全相同的文件 */
export interface DuplicateGroup {
  /** 稳定 id（用最小路径，React key 用） */
  id: string
  /** 文件大小（字节） */
  size: number
  /** 组内文件（至少 2 个） */
  files: DuplicateCandidateFile[]
  /** 可回收空间 = size × (份数 - 1) */
  wasted: number
}

/** 查重结果 */
export interface DuplicateResult {
  /** 内容完全相同的组（按可回收空间降序） */
  groups: DuplicateGroup[]
  /** 送进来时大小相同的候选组数 */
  candidateGroups: number
  /** 参与内容比对的候选文件数 */
  candidateFiles: number
  /** 完整校验过的文件数 */
  hashedFiles: number
  /** 可回收空间合计 */
  totalWasted: number
  /** 耗时（毫秒） */
  durationMs: number
  /** 读不了的文件（最多 50 条样本） */
  errors: string[]
  /** 读失败的文件总数 */
  errorCount: number
}

/** 查重启动结果（主进程 await 整个查重过程后返回） */
export interface DuplicateStartResult {
  ok: boolean
  /** 用户取消 */
  cancelled?: boolean
  /** 失败原因 */
  message?: string
  /** 成功时的结果 */
  result?: DuplicateResult
}

/** 批量移到回收站的单条结果 */
export interface TrashOutcome {
  path: string
  ok: boolean
  /** 失败时的人话原因（主进程只回原始错误，翻译在渲染层） */
  message?: string
}

/** 批量移到回收站的进度（主进程逐条上报，UI 显示进度条） */
export interface TrashProgress {
  /** 已完成条数 */
  done: number
  /** 总条数 */
  total: number
  /** 正在处理的路径 */
  current: string
}

/** 回收站里的一条记录（Windows $Recycle.Bin 解析结果） */
export interface TrashEntry {
  /** 稳定 id：分区|SID|序号 */
  id: string
  /** 原始文件名 */
  name: string
  /** 删除前的完整路径 */
  originalPath: string
  /** 删除时间（毫秒时间戳） */
  deletedAt: number
  /** 大小（字节） */
  size: number
  /** 回收站里的内容文件（$R…） */
  contentPath: string
  /** 回收站里的元数据文件（$I…） */
  infoPath: string
  /** 所在分区根路径，如 C:\ */
  drive: string
  /** 内容文件是否还在（可能已被清空） */
  exists: boolean
  /** 原来是不是文件夹 */
  isFolder: boolean
}

/** 回收站整体列表 */
export interface TrashListing {
  entries: TrashEntry[]
  /** 仍存在的内容合计大小 */
  totalSize: number
  /** 记录条数 */
  totalCount: number
  /** 扫描过的分区 */
  scannedDrives: string[]
  /** 读不了的分区/目录（无权限等） */
  errors: string[]
  /** 是否有分区因为权限没读到 */
  blocked: boolean
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

/** 管理员授权策略 */
export type CleanupElevation = 'auto' | 'always' | 'never'

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
  /** 最近一次扫描路径（多路径用 ; 分隔） */
  lastPath: string
  /** 最近扫描过的路径（最多 8 条，去重） */
  recentPaths: string[]
  /** 窗口位置尺寸 */
  windowBounds: WindowBounds | null
  /** 新手模式：更大的字、更明显的下一步引导、路径显示在文件名下面 */
  beginnerMode: boolean
  /** 是否已经看过首次新手引导 */
  onboarded: boolean
  /** 扫描完成后自动保存快照（下次打开可恢复，不必重扫） */
  autoSnapshot: boolean
  /** 清理时何时请求管理员授权（一次授权，整批执行） */
  cleanupElevation: CleanupElevation
}

/** 一次清理的目标（文件或目录） */
export interface CleanupTarget {
  path: string
  name: string
  size: number
  type: NodeType
  mtime: number
  /** 来自哪条清理建议（报告分组用） */
  groupId?: string
  groupTitle?: string
}

/** 清理执行结果里的单条结果 */
export interface CleanupOutcome {
  path: string
  ok: boolean
  message?: string
  /** 是否需要管理员权限才能删 */
  needsAdmin?: boolean
}

/** 清理报告里的分组汇总 */
export interface CleanupReportGroup {
  id: string
  title: string
  count: number
  size: number
  successCount: number
}

/** 清理报告（渲染层弹窗 + 主进程 HTML 文件共用） */
export interface CleanupReport {
  id: string
  createdAt: number
  /** 这次清理的范围说明，如「C: / D: / E:」 */
  scope: string
  /** 普通权限 / 管理员授权 */
  mode: 'normal' | 'elevated'
  targets: CleanupTarget[]
  outcomes: CleanupOutcome[]
  beforeDrives: DriveInfo[]
  afterDrives: DriveInfo[]
  groups: CleanupReportGroup[]
  /** 目标总大小 */
  totalBytes: number
  /** 实际释放（成功项） */
  freedBytes: number
  itemCount: number
  successCount: number
  failedCount: number
  durationMs: number
  /** 是否已把本次清理项从回收站彻底删除 */
  purged?: boolean
  /** 彻底删除后实际释放的字节数 */
  purgedBytes?: number
  /** 从回收站彻底删除的条目数 */
  purgedCount?: number
  /** 详细 HTML 报告路径 */
  reportPath: string
}

/** 清理执行请求 */
export interface CleanupExecuteRequest {
  targets: CleanupTarget[]
  /** 范围说明（用于报告标题） */
  scope: string
  /** 覆盖设置里的授权策略 */
  elevation?: CleanupElevation
  /**
   * 清理后是否把本次项目从回收站彻底删除（不可恢复）。
   * 只有用户明确勾选时才传 true；默认只进回收站。
   */
  purgeAfter?: boolean
}

/** 清理执行结果 */
export interface CleanupExecuteResult {
  ok: boolean
  report?: CleanupReport
  /** 用户在 UAC 弹窗里点了取消 */
  elevationCancelled?: boolean
  message?: string
}

/** 扫描快照元信息（首页恢复上次扫描用） */
export interface SnapshotMeta {
  path: string
  createdAt: number
  roots: string[]
  totalBytes: number
  files: number
  dirs: number
  /** 快照文件大小（字节） */
  fileBytes: number
}

/** 压缩包信息行 */
export interface ArchiveInfo {
  path: string
  name: string
  size: number
  mtime: number
  /** 小写扩展名 */
  ext: string
  /** zip 可读出条目数；其它格式为 undefined */
  entryCount?: number
  /** zip 解压后总大小 */
  unpackedBytes?: number
  /** 读取失败原因 */
  error?: string
}

/** 压缩包内容条目（zip 查看器） */
export interface ArchiveEntry {
  name: string
  size: number
  compressedSize: number
  isDir: boolean
}

/** 压缩包内容查看结果 */
export interface ArchiveInspection {
  path: string
  entries: ArchiveEntry[]
  totalSize: number
  unpackedBytes: number
  truncated: boolean
  error?: string
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
