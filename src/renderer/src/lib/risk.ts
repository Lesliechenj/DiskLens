// F7 风险分级标签：✅安全可删 / ⚠️谨慎 / ❌别动，直接标在文件上
// 设计原则（写给小白）：
//   ❌ 别动   —— 系统文件/程序，删了系统可能出问题，该用卸载程序
//   ⚠️ 谨慎   —— 你自己的东西（文档/照片/视频/下载），删了可能找不回
//   ✅ 安全可删 —— 缓存/日志/临时/缩略图，删了顶多重新生成

import type { ScanNode } from '../../../shared/types'
import { extInfo, isCacheDirName } from './extDict'

export type RiskLevel = 'safe' | 'caution' | 'danger'

export interface RiskInfo {
  level: RiskLevel
  icon: string
  label: string
  /** 给小白的一句人话解释 */
  hint: string
}

export const RISK: Record<RiskLevel, RiskInfo> = {
  safe: {
    level: 'safe',
    icon: '✅',
    label: '安全可删',
    hint: '缓存或临时文件，删了会自动重新生成'
  },
  caution: {
    level: 'caution',
    icon: '⚠️',
    label: '谨慎',
    hint: '这可能是你自己的东西，删了不一定找得回'
  },
  danger: {
    level: 'danger',
    icon: '❌',
    label: '别动',
    hint: '系统或程序文件，删除可能导致软件/系统出问题'
  }
}

/** 命中即 ❌ 的系统关键文件名（小写比较） */
const DANGER_FILE_NAMES = new Set([
  'pagefile.sys',
  'hiberfil.sys',
  'swapfile.sys',
  'bootmgr',
  'bootmgr.efi',
  'ntuser.dat',
  'sam',
  'system',
  'software',
  'security',
  'default',
  'desktop.ini',
  'ntldr',
  'winload.exe',
  'ntoskrnl.exe',
  'hal.dll'
])

/** 命中即 ❌ 的系统关键目录名（小写比较） */
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
  'boot'
])

/** 路径中含这些片段（两侧带分隔符）即 ❌ */
const DANGER_PATH_SEGMENTS = [
  '\\windows\\',
  '/windows/',
  '\\program files',
  '/program files',
  '\\programdata',
  '/programdata',
  '\\system32',
  '/system32',
  '\\appdata\\',
  '/appdata/',
  '/etc/',
  '/usr/',
  '/bin/',
  '/sbin/',
  '/boot/',
  '/var/lib/'
]

/** 给一个节点定风险级。目录看名字/路径，文件看名字/后缀/所在路径 */
export function riskOf(node: ScanNode): RiskInfo {
  const name = node.name.toLowerCase()

  // 1) 系统关键文件/目录名 → 别动（最强信号，优先于一切）
  if (DANGER_FILE_NAMES.has(name) || DANGER_DIR_NAMES.has(name)) return RISK.danger

  // 2) 缓存/日志/临时/缩略图 → 安全可删
  //    注意这段要在"路径含 AppData → 别动"之前：AppData\Local\Temp 里躺的
  //    绝大多数是可删的临时文件，不能因为挂在 AppData 名下就判死刑
  //    （新手自测抓到：Temp 里的度假视频被误标 ❌）
  if (node.type === 'file') {
    const { category } = extInfo(node.name)
    if (category === 'cache') return RISK.safe
    if (name === 'thumbs.db' || name === 'thumbs.db:encryptable') return RISK.safe
  } else {
    if (isCacheDirName(node.name)) return RISK.safe
  }
  const lowerPath = node.path.toLowerCase()
  if (/[\\/](temp|tmp|cache|caches|logs|log)[\\/]/.test(lowerPath)) return RISK.safe

  // 3) 路径命中系统关键段 → 别动
  for (const seg of DANGER_PATH_SEGMENTS) {
    if (lowerPath.includes(seg)) return RISK.danger
  }

  // 4) 程序/安装包/系统组件 → 别动（该用卸载，不是硬删）
  if (node.type === 'file') {
    const { category } = extInfo(node.name)
    if (category === 'program' || category === 'system') return RISK.danger
  }

  // 5) 其余都是用户自己的东西 → 谨慎（默认档）
  return RISK.caution
}
