// 清理建议：把"能安全删的东西"按类别收拢成一张清单
// 这是小白最想要的那一屏——不用懂图表，照着清单点就行
// 规则全部来自 shared/risk 与后缀词典，口径与图表上的风险标签一致

import type { ScanNode } from '../../../shared/types'
import { extOf, extInfo, isCacheDirName } from '../../../shared/extCategories'
import { riskOf } from '../../../shared/risk'

/** 一条清理建议 */
export interface CleanupGroup {
  id: string
  /** 标题（人话） */
  title: string
  /** 一句话解释，说清"删了会怎样" */
  desc: string
  icon: string
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
  icon: string
  level: 'safe' | 'caution' | 'danger'
  /** 判断一个节点是否命中（文件与目录分别判断前先看类型） */
  match: (node: ScanNode, lowerPath: string) => boolean
}

const RULES: Rule[] = [
  {
    id: 'temp',
    title: '临时文件',
    desc: '软件运行时留下的半成品，删了会自动重新生成，不影响使用',
    icon: '🧹',
    level: 'safe',
    match: (node, lowerPath) =>
      node.type === 'file' &&
      (TEMP_EXTS.has(extOf(node.name)) || /\/temp\/|\/tmp\/|\\temp\\|\\tmp\\/.test(lowerPath))
  },
  {
    id: 'logs',
    title: '日志与崩溃转储',
    desc: '软件记录运行过程用的，平时没人看，删了只会少些排查线索',
    icon: '🗒️',
    level: 'safe',
    match: (node, lowerPath) =>
      node.type === 'file' && (LOG_EXTS.has(extOf(node.name)) || /\/logs?\//.test(lowerPath))
  },
  {
    id: 'cache-dirs',
    title: '缓存目录',
    desc: '浏览器/软件攒下的缓存，删了最多重新下载一次',
    icon: '♻️',
    level: 'safe',
    match: (node) => node.type === 'dir' && isCacheDirName(node.name)
  },
  {
    id: 'cache-files',
    title: '缓存文件',
    desc: '各种 .cache 文件，属于"再生资源"',
    icon: '💾',
    level: 'safe',
    match: (node) => node.type === 'file' && extInfo(node.name).category === 'cache'
  },
  {
    id: 'recycle',
    title: '回收站占用',
    desc: '你删过但还在回收站里占地方的文件，清空回收站才能真正腾出空间',
    icon: '🗑️',
    level: 'caution',
    match: (node) => /\$recycle\.bin|\/\.trash/i.test(node.path)
  },
  {
    id: 'old-system',
    title: '旧系统备份',
    desc: '系统升级留下的 Windows.old，确认新系统没问题后可以删',
    icon: '🪟',
    level: 'caution',
    match: (node) => node.name.toLowerCase() === 'windows.old'
  },
  {
    id: 'installers',
    title: '下载的安装包',
    desc: '装完就不用的 exe/msi 安装包，留着占地方',
    icon: '📦',
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
    icon: '🗜️',
    level: 'caution',
    match: (node) =>
      node.type === 'file' && ['zip', 'rar', '7z', 'tar', 'gz'].includes(extOf(node.name))
  }
]

/**
 * 扫一遍树，产出清理建议（按可腾出空间降序）。
 * 已经判定为「别动」的节点一律不进建议——宁可少建议，不可误删。
 */
export function findCleanupGroups(root: ScanNode): CleanupGroup[] {
  const buckets = new Map<string, { nodes: ScanNode[]; totalSize: number; count: number }>()
  for (const rule of RULES) buckets.set(rule.id, { nodes: [], totalSize: 0, count: 0 })

  const stack: ScanNode[] = [root]
  while (stack.length > 0) {
    const node = stack.pop()!
    const lowerPath = node.path.toLowerCase().replace(/\\/g, '/')
    for (const rule of RULES) {
      if (!rule.match(node, lowerPath)) continue
      // 双保险：风险分级说「别动」的，不进清理清单
      if (rule.id !== 'recycle' && riskOf(node).level === 'danger') continue
      const bucket = buckets.get(rule.id)!
      bucket.totalSize += node.size
      bucket.count += 1
      bucket.nodes.push(node)
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
  return groups
}
