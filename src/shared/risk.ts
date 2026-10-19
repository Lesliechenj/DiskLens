// 风险分级标签：安全可删 / 谨慎 / 别动，直接标在文件上
// 设计原则（写给小白）：
//   别动   —— 系统文件/程序，删了系统可能出问题，该用卸载程序
//   谨慎   —— 你自己的东西（文档/照片/视频/下载），删了可能找不回
//   安全可删 —— 缓存/日志/临时/缩略图，删了顶多重新生成
// 放在 shared：主进程导出报告也要标风险，口径必须一致

import type { ScanNode } from './types'
import type { IconName } from './iconNames'
import { extInfo, isCacheDirName, type ExtCategory } from './extCategories'

export type RiskLevel = 'safe' | 'caution' | 'danger'

export interface RiskInfo {
  level: RiskLevel
  /** 图标语义名（渲染层画） */
  icon: IconName
  label: string
  /** 给小白的一句人话解释 */
  hint: string
}

export const RISK: Record<RiskLevel, RiskInfo> = {
  safe: {
    level: 'safe',
    icon: 'riskSafe',
    label: '安全可删',
    hint: '缓存或临时文件，删了会自动重新生成'
  },
  caution: {
    level: 'caution',
    icon: 'riskCaution',
    label: '谨慎',
    hint: '这可能是你自己的东西，删了不一定找得回'
  },
  danger: {
    level: 'danger',
    icon: 'riskDanger',
    label: '别动',
    hint: '系统或程序文件，删除可能导致软件/系统出问题'
  }
}

/** 风险等级排序权重（视图里按风险分组/排序用） */
export const RISK_ORDER: Record<RiskLevel, number> = { safe: 0, caution: 1, danger: 2 }

/** 命中即「别动」的系统关键文件名（小写比较） */
const DANGER_FILE_NAMES = new Set([
  'pagefile.sys',
  'hiberfil.sys',
  'swapfile.sys',
  'bootmgr',
  'bootmgr.efi',
  'bootnxt',
  'ntuser.dat',
  'ntuser.ini',
  'sam',
  'system',
  'software',
  'security',
  'default',
  'ntldr',
  'winload.exe',
  'winresume.exe',
  'ntoskrnl.exe',
  'hal.dll',
  'boot.ini',
  'bcd'
])

/** 命中即「安全可删」的缓存类文件名（缩略图缓存/文件夹配置，删了系统自己重建） */
const SAFE_FILE_NAMES = new Set(['thumbs.db', 'ea dir', '.ds_store', 'desktop.ini'])

/** 命中即「别动」的系统关键目录名（小写比较） */
const DANGER_DIR_NAMES = new Set([
  'windows',
  'system32',
  'syswow64',
  'winsxs',
  'servicing',
  'program files',
  'program files (x86)',
  'programdata',
  'system volume information',
  '$recycle.bin',
  'perflogs',
  'boot',
  'recovery',
  'efi',
  '$windows.~bt',
  '$windows.~ws',
  'recycler'
])

/** 路径中含这些片段（两侧带分隔符）即「别动」 */
const DANGER_PATH_SEGMENTS = [
  '/windows/',
  '/windows\\',
  '/program files',
  '/program files (x86)',
  '/programdata',
  '/system32',
  '/syswow64',
  '/boot/',
  '/efi/',
  '/etc/',
  '/usr/bin/',
  '/usr/sbin/',
  '/usr/lib/',
  '/bin/',
  '/sbin/',
  '/var/lib/',
  '/system/library/'
]

/** 路径中含这些片段即「安全可删」（缓存/日志/临时） */
const SAFE_PATH_SEGMENTS = [
  '/temp/',
  '/tmp/',
  '/cache/',
  '/caches/',
  '/logs/',
  '/log/',
  '/crashdumps/',
  '/crashpad/',
  '/thumbnails/',
  '/shadercache/',
  '/gpu_cache/',
  '/inetcache/',
  '/webcache/'
]

/** 目录里装的东西天然可删 → 目录本身也算安全 */
const SAFE_CATEGORIES: ExtCategory[] = ['cache']

/** 目录里装的东西删了会出问题 → 目录也算别动 */
const DANGER_CATEGORIES: ExtCategory[] = ['system', 'program']

/** 给一个节点定风险级。目录看名字/路径，文件看名字/后缀/所在路径 */
export function riskOf(node: ScanNode): RiskInfo {
  const name = node.name.toLowerCase()
  const lowerPath = node.path.toLowerCase().replace(/\\/g, '/')

  // 1) 系统关键文件/目录名 → 别动（最强信号，优先于一切）
  if (DANGER_FILE_NAMES.has(name) || DANGER_DIR_NAMES.has(name)) return RISK.danger

  // 2) 缓存/日志/临时/缩略图 → 安全可删
  //    注意这段要排在"路径含 AppData → 别动"之前：AppData/Local/Temp 里躺的
  //    绝大多数是可删的临时文件，不能因为挂在 AppData 名下就判死刑
  if (SAFE_FILE_NAMES.has(name)) return RISK.safe
  if (node.type === 'file') {
    const { category } = extInfo(node.name)
    if (category === 'cache') return RISK.safe
  } else if (isCacheDirName(node.name)) {
    return RISK.safe
  }
  for (const seg of SAFE_PATH_SEGMENTS) {
    if (lowerPath.includes(seg)) return RISK.safe
  }

  // 3) 路径命中系统关键段 → 别动
  for (const seg of DANGER_PATH_SEGMENTS) {
    if (lowerPath.includes(seg)) return RISK.danger
  }

  // 4) 程序/安装包/系统组件 → 别动（该用卸载，不是硬删）
  if (node.type === 'file') {
    const { category } = extInfo(node.name)
    if (DANGER_CATEGORIES.includes(category)) return RISK.danger
  }

  // 5) 其余都是用户自己的东西 → 谨慎（默认档）
  return RISK.caution
}

/** 快速判断是否"安全可删"（清理建议用，省掉构造 RiskInfo 的开销） */
export function isSafeToDelete(node: ScanNode): boolean {
  return riskOf(node).level === RISK.safe.level
}

/** 类别是否属于缓存类（清理建议按类别收集时用） */
export function isCacheCategory(category: ExtCategory): boolean {
  return SAFE_CATEGORIES.includes(category)
}
