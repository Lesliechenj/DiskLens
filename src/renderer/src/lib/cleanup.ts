// 清理建议：把"能安全删的东西"按类别收拢成一张清单
// 这是小白最想要的那一屏——不用懂图表，照着清单点就行
// 规则全部来自 shared/risk 与后缀词典，口径与图表上的风险标签一致

import type { ScanNode } from '../../../shared/types'
import type { IconName } from '../../../shared/iconNames'
import { extOf, extInfo, isCacheDirName } from '../../../shared/extCategories'
import { isSameOrInsidePath } from '../../../shared/paths'
import { riskOf } from '../../../shared/risk'

/** 一条清理建议 */
export interface CleanupGroup {
  id: string
  /** 标题（人话） */
  title: string
  /** 一句话解释，说清"删了会怎样" */
  desc: string
  icon: IconName
  /** 组内最大风险等级（渲染用色） */
  level: 'safe' | 'caution'
  /** 命中节点（按大小降序；存的是引用，不额外占内存） */
  nodes: ScanNode[]
  /** 命中总大小 */
  totalSize: number
  /** 命中总数 */
  count: number
}

/** 临时文件后缀（含未下载完的） */
const TEMP_EXTS = new Set([
  'tmp',
  'temp',
  'part',
  'crdownload',
  'download',
  'bak',
  'old',
  'swp',
  '~'
])
/** 日志后缀 */
const LOG_EXTS = new Set(['log', 'log1', 'etl', 'dmp', 'dump'])

interface Rule {
  id: string
  title: string
  desc: string
  icon: IconName
  level: 'safe' | 'caution' | 'danger'
  /** 判断一个节点是否命中（文件与目录分别判断前先看类型） */
  match: (node: ScanNode, lowerPath: string) => boolean
}

const RULES: Rule[] = [
  {
    id: 'temp',
    title: '临时文件',
    desc: '软件运行时留下的半成品，删了会自动重新生成，不影响使用',
    icon: 'broom',
    level: 'safe',
    match: (node, lowerPath) =>
      node.type === 'file' &&
      (TEMP_EXTS.has(extOf(node.name)) || /\/temp\/|\/tmp\/|\\temp\\|\\tmp\\/.test(lowerPath))
  },
  {
    id: 'logs',
    title: '日志与崩溃转储',
    desc: '软件记录运行过程用的，平时没人看，删了只会少些排查线索',
    icon: 'scrollText',
    level: 'safe',
    match: (node, lowerPath) =>
      node.type === 'file' && (LOG_EXTS.has(extOf(node.name)) || /\/logs?\//.test(lowerPath))
  },
  {
    id: 'cache-dirs',
    title: '缓存目录',
    desc: '浏览器/软件攒下的缓存，删了最多重新下载一次',
    icon: 'cache',
    level: 'safe',
    match: (node) => node.type === 'dir' && isCacheDirName(node.name)
  },
  {
    id: 'cache-files',
    title: '缓存文件',
    desc: '各种 .cache 文件，属于"再生资源"',
    icon: 'database',
    level: 'safe',
    match: (node) => node.type === 'file' && extInfo(node.name).category === 'cache'
  },
  {
    id: 'recycle',
    title: '回收站占用',
    desc: '你删过但还在回收站里占地方的文件，清空回收站才能真正腾出空间',
    icon: 'recycle',
    level: 'caution',
    match: (node) => /\$recycle\.bin|\/\.trash/i.test(node.path)
  },
  {
    id: 'old-system',
    title: '旧系统备份',
    desc: '系统升级留下的 Windows.old，确认新系统没问题后可以删',
    icon: 'monitor',
    level: 'caution',
    match: (node) => node.name.toLowerCase() === 'windows.old'
  },
  {
    id: 'system-update',
    title: '系统更新缓存',
    desc: 'Windows 更新下载过的安装包，更新装好后可以清掉（系统需要时会重新下载）',
    icon: 'export',
    level: 'safe',
    match: (node, lowerPath) =>
      node.type === 'file' &&
      (/\/softwaredistribution\/download/.test(lowerPath) ||
        /\/softwaredistribution\/deliveryoptimization/.test(lowerPath) ||
        /\/deliveryoptimization\//.test(lowerPath))
  },
  {
    id: 'error-reports',
    title: '错误报告与崩溃转储',
    desc: '系统/软件崩溃时留下的报告和内存转储，普通用户一般用不到',
    icon: 'scrollText',
    level: 'safe',
    match: (node, lowerPath) =>
      node.type === 'file' &&
      (/\/wer\//.test(lowerPath) ||
        /\/minidump\//.test(lowerPath) ||
        /\/livekernelreports\//.test(lowerPath))
  },
  {
    id: 'prefetch',
    title: '系统预读文件',
    desc: 'Windows 用来加快启动的预读缓存，删了系统会自己重建',
    icon: 'cache',
    level: 'safe',
    match: (node, lowerPath) => node.type === 'file' && /\/prefetch\//.test(lowerPath)
  },
  {
    id: 'installers',
    title: '下载的安装包',
    desc: '装完就不用的 exe/msi 安装包，留着占地方',
    icon: 'package',
    level: 'caution',
    match: (node, lowerPath) =>
      node.type === 'file' &&
      (extOf(node.name) === 'exe' || extOf(node.name) === 'msi') &&
      /download|下载/.test(lowerPath)
  },
  {
    id: 'archives',
    title: '未解压的压缩包',
    desc: '解压完的 zip/rar 原件，内容还在的话可以清掉',
    icon: 'archive',
    level: 'caution',
    match: (node) =>
      node.type === 'file' && ['zip', 'rar', '7z', 'tar', 'gz'].includes(extOf(node.name))
  }
]

/**
 * 找出"整棵子树里一个文件都没有"的目录，只保留最外层那几个。
 * 为什么要最外层：删掉父目录时子空目录会一起进回收站，重复列出会让数字虚高。
 * 后序遍历（显式栈），深目录树不爆栈。
 */
function findTopEmptyDirs(root: ScanNode): ScanNode[] {
  const hasContent = new Map<ScanNode, boolean>()
  const post: { node: ScanNode; visited: boolean }[] = [{ node: root, visited: false }]
  while (post.length > 0) {
    const item = post.pop()!
    if (!item.visited) {
      post.push({ node: item.node, visited: true })
      for (const kid of item.node.children ?? []) post.push({ node: kid, visited: false })
      continue
    }
    const node = item.node
    if (node.type === 'file') {
      hasContent.set(node, true)
      continue
    }
    // 只要有一个孩子是文件 / 有内容的目录，这个目录就不算空
    let content = false
    for (const kid of node.children ?? []) {
      if (hasContent.get(kid)) {
        content = true
        break
      }
    }
    hasContent.set(node, content)
  }

  const empty: ScanNode[] = []
  const stack: ScanNode[] = [...(root.children ?? [])]
  while (stack.length > 0) {
    const node = stack.pop()!
    if (node.type !== 'dir') continue
    if (!hasContent.get(node)) {
      // 整棵都空：收下它，不再往下走（避免父子重复）
      if (riskOf(node).level !== 'danger') empty.push(node)
      continue
    }
    for (const kid of node.children ?? []) stack.push(kid)
  }
  return empty.sort((a, b) => a.path.localeCompare(b.path))
}

/**
 * 扫一遍树，产出清理建议（按可腾出空间降序）。
 * 已经判定为「别动」的节点一律不进建议——宁可少建议，不可误删。
 */
export function findCleanupGroups(root: ScanNode): CleanupGroup[] {
  const buckets = new Map<string, { nodes: ScanNode[]; totalSize: number; count: number }>()
  for (const rule of RULES) buckets.set(rule.id, { nodes: [], totalSize: 0, count: 0 })

  const stack: ScanNode[] = [root]
  // 已经选了父目录当清理项，就不再把里面的文件重复列一遍
  const claimed: string[] = []
  while (stack.length > 0) {
    const node = stack.pop()!
    if (claimed.some((parent) => isSameOrInsidePath(node.path, parent))) continue
    const lowerPath = node.path.toLowerCase().replace(/\\/g, '/')
    for (const rule of RULES) {
      if (!rule.match(node, lowerPath)) continue
      // 双保险：风险分级说「别动」的，不进清理清单
      if (rule.id !== 'recycle' && riskOf(node).level === 'danger') continue
      const bucket = buckets.get(rule.id)!
      bucket.totalSize += node.size
      bucket.count += 1
      bucket.nodes.push(node)
      claimed.push(node.path)
      break // 一个节点只归一类，避免重复计算
    }
    for (const kid of node.children ?? []) stack.push(kid)
  }

  const groups: CleanupGroup[] = []
  for (const rule of RULES) {
    const bucket = buckets.get(rule.id)!
    if (bucket.count === 0 || bucket.totalSize <= 0) continue
    groups.push({
      id: rule.id,
      title: rule.title,
      desc: rule.desc,
      icon: rule.icon,
      level: rule.level === 'danger' ? 'caution' : rule.level,
      nodes: bucket.nodes.sort((a, b) => b.size - a.size),
      totalSize: bucket.totalSize,
      count: bucket.count
    })
  }

  // 空文件夹单独补一组：它们不占空间，但能让目录清爽（WinDirStat 也会标出来）
  const emptyDirs = findTopEmptyDirs(root)
  if (emptyDirs.length > 0) {
    groups.push({
      id: 'empty-dirs',
      title: '空文件夹',
      desc: '里面一个文件都没有。删掉只是让目录更清爽，有些软件下次运行会自己重建',
      icon: 'folderOpen',
      level: 'safe',
      nodes: emptyDirs,
      totalSize: 0,
      count: emptyDirs.length
    })
  }
  return groups
}

/**
 * 合并多份清理建议（整盘扫描 + 系统垃圾扫描）。
 * 同一个规则 id 合并成一组，按路径去重，避免同一个文件被算两次。
 */
export function mergeCleanupGroups(...lists: CleanupGroup[][]): CleanupGroup[] {
  const merged = new Map<string, CleanupGroup>()
  for (const list of lists) {
    for (const group of list) {
      const current = merged.get(group.id)
      if (!current) {
        merged.set(group.id, {
          ...group,
          nodes: [...group.nodes],
          level: group.level
        })
        continue
      }
      const seen = new Set(current.nodes.map((node) => node.path))
      for (const node of group.nodes) {
        if (seen.has(node.path)) continue
        seen.add(node.path)
        current.nodes.push(node)
        current.totalSize += node.size
        current.count++
      }
      // 只要有一边判为谨慎，整组就按谨慎显示
      if (group.level === 'caution') current.level = 'caution'
    }
  }
  return [...merged.values()].sort((a, b) => b.totalSize - a.totalSize)
}
