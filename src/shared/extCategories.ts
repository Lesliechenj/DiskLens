// 后缀名人话词典：给电脑小白看的"这是什么文件"
// .pdf → "PDF 文档"、.mp4 → "视频文件"……未知后缀回落"其他文件"
// 放在 shared 是因为主进程（导出报告）和渲染层（图表配色/风险分级）都要用同一份口径

import type { IconName } from './iconNames'

/** 文件大类（用于图表配色、统计、风险判定的中间层） */
export type ExtCategory =
  | 'video' // 视频
  | 'image' // 图片
  | 'audio' // 音频
  | 'doc' // 文档
  | 'archive' // 压缩包
  | 'program' // 程序/安装包
  | 'code' // 代码/开发
  | 'system' // 系统文件
  | 'cache' // 缓存/临时
  | 'other' // 其他

/** 大类展示信息：图标、颜色（深色背景与浅色背景都够对比度） */
export interface CategoryMeta {
  label: string
  /** 图标语义名（渲染层 components/icons.tsx 负责画出来） */
  icon: IconName
  color: string
  /** 一句话解释，给小白 */
  hint: string
}

export const CATEGORY_META: Record<ExtCategory, CategoryMeta> = {
  video: { label: '视频', icon: 'film', color: '#8b7bf7', hint: '电影、录屏、短视频' },
  image: { label: '图片', icon: 'image', color: '#38bdf8', hint: '照片、截图、设计图' },
  audio: { label: '音频', icon: 'audio', color: '#f472b6', hint: '音乐、录音、播客' },
  doc: { label: '文档', icon: 'doc', color: '#34d399', hint: '办公文档、笔记、电子书' },
  archive: { label: '压缩包', icon: 'archive', color: '#fbbf24', hint: 'zip / rar 等打包文件' },
  program: { label: '程序', icon: 'program', color: '#f87171', hint: '安装包、可执行程序' },
  code: { label: '代码', icon: 'code', color: '#60a5fa', hint: '源码、配置、数据文件' },
  system: { label: '系统', icon: 'system', color: '#94a3b8', hint: '系统组件与配置文件' },
  cache: { label: '缓存', icon: 'cache', color: '#a3e635', hint: '临时文件、日志，删了会重新生成' },
  other: { label: '其他', icon: 'other', color: '#64748b', hint: '没见过的后缀' }
}

export interface ExtInfo {
  /** 人话标签，如 "PDF 文档" */
  label: string
  category: ExtCategory
}

/** 取小写扩展名（不含点）；无扩展名/点开头的隐藏文件返回 '' */
export function extOf(name: string): string {
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return '' // 无点 / ".gitignore" 这类点开头
  return name.slice(dot + 1).toLowerCase()
}

const DICT: Record<string, ExtInfo> = {
  // —— 视频 ——
  mp4: { label: '视频文件', category: 'video' },
  mkv: { label: '视频文件', category: 'video' },
  avi: { label: '视频文件', category: 'video' },
  mov: { label: '视频文件', category: 'video' },
  wmv: { label: '视频文件', category: 'video' },
  flv: { label: '视频文件', category: 'video' },
  webm: { label: '视频文件', category: 'video' },
  m4v: { label: '视频文件', category: 'video' },
  mpg: { label: '视频文件', category: 'video' },
  mpeg: { label: '视频文件', category: 'video' },
  rmvb: { label: '视频文件', category: 'video' },
  vob: { label: 'DVD 视频', category: 'video' },
  ts: { label: '视频文件', category: 'video' }, // Transport Stream：录屏/电视录像常见
  m2ts: { label: '视频文件', category: 'video' },

  // —— 图片 ——
  jpg: { label: '图片文件', category: 'image' },
  jpeg: { label: '图片文件', category: 'image' },
  png: { label: '图片文件', category: 'image' },
  gif: { label: '动图', category: 'image' },
  bmp: { label: '图片文件', category: 'image' },
  webp: { label: '图片文件', category: 'image' },
  svg: { label: '矢量图片', category: 'image' },
  ico: { label: '图标文件', category: 'image' },
  heic: { label: '手机照片', category: 'image' },
  avif: { label: '图片文件', category: 'image' },
  tif: { label: '图片文件', category: 'image' },
  tiff: { label: '图片文件', category: 'image' },
  raw: { label: '相机原始照片', category: 'image' },
  psd: { label: 'Photoshop 工程图', category: 'image' },

  // —— 音频 ——
  mp3: { label: '音频文件', category: 'audio' },
  wav: { label: '音频文件', category: 'audio' },
  flac: { label: '无损音频', category: 'audio' },
  aac: { label: '音频文件', category: 'audio' },
  ogg: { label: '音频文件', category: 'audio' },
  m4a: { label: '音频文件', category: 'audio' },
  wma: { label: '音频文件', category: 'audio' },
  ape: { label: '无损音频', category: 'audio' },

  // —— 文档 ——
  pdf: { label: 'PDF 文档', category: 'doc' },
  doc: { label: 'Word 文档', category: 'doc' },
  docx: { label: 'Word 文档', category: 'doc' },
  xls: { label: 'Excel 表格', category: 'doc' },
  xlsx: { label: 'Excel 表格', category: 'doc' },
  ppt: { label: 'PPT 演示', category: 'doc' },
  pptx: { label: 'PPT 演示', category: 'doc' },
  txt: { label: '文本文件', category: 'doc' },
  md: { label: 'Markdown 笔记', category: 'doc' },
  rtf: { label: '富文本', category: 'doc' },
  csv: { label: 'CSV 数据表', category: 'doc' },
  tsv: { label: '数据表', category: 'doc' },
  epub: { label: '电子书', category: 'doc' },
  mobi: { label: '电子书', category: 'doc' },
  azw3: { label: '电子书', category: 'doc' },
  pages: { label: 'Pages 文档', category: 'doc' },
  numbers: { label: 'Numbers 表格', category: 'doc' },
  key: { label: 'Keynote 演示', category: 'doc' },

  // —— 压缩包 ——
  zip: { label: '压缩包', category: 'archive' },
  rar: { label: '压缩包', category: 'archive' },
  '7z': { label: '压缩包', category: 'archive' },
  tar: { label: '压缩包', category: 'archive' },
  gz: { label: '压缩包', category: 'archive' },
  bz2: { label: '压缩包', category: 'archive' },
  xz: { label: '压缩包', category: 'archive' },
  zst: { label: '压缩包', category: 'archive' },
  iso: { label: '光盘镜像', category: 'archive' },
  img: { label: '磁盘镜像', category: 'archive' },

  // —— 程序/安装包 ——
  exe: { label: '可执行程序', category: 'program' },
  msi: { label: '安装包', category: 'program' },
  msix: { label: '安装包', category: 'program' },
  appx: { label: '安装包', category: 'program' },
  bat: { label: '批处理脚本', category: 'program' },
  cmd: { label: '批处理脚本', category: 'program' },
  apk: { label: '安卓安装包', category: 'program' },
  dmg: { label: 'Mac 安装镜像', category: 'program' },
  pkg: { label: 'Mac 安装包', category: 'program' },
  deb: { label: 'Linux 安装包', category: 'program' },
  appimage: { label: 'Linux 程序', category: 'program' },

  // —— 代码/开发 ——
  js: { label: 'JavaScript 代码', category: 'code' },
  mjs: { label: 'JavaScript 代码', category: 'code' },
  cjs: { label: 'JavaScript 代码', category: 'code' },
  jsx: { label: 'React 代码', category: 'code' },
  tsx: { label: 'React 代码', category: 'code' },
  json: { label: 'JSON 数据', category: 'code' },
  html: { label: '网页文件', category: 'code' },
  htm: { label: '网页文件', category: 'code' },
  css: { label: '样式文件', category: 'code' },
  scss: { label: '样式文件', category: 'code' },
  less: { label: '样式文件', category: 'code' },
  py: { label: 'Python 脚本', category: 'code' },
  java: { label: 'Java 源码', category: 'code' },
  kt: { label: 'Kotlin 源码', category: 'code' },
  c: { label: 'C 源码', category: 'code' },
  h: { label: 'C 头文件', category: 'code' },
  cpp: { label: 'C++ 源码', category: 'code' },
  hpp: { label: 'C++ 头文件', category: 'code' },
  cs: { label: 'C# 源码', category: 'code' },
  go: { label: 'Go 源码', category: 'code' },
  rs: { label: 'Rust 源码', category: 'code' },
  php: { label: 'PHP 源码', category: 'code' },
  rb: { label: 'Ruby 源码', category: 'code' },
  sh: { label: 'Shell 脚本', category: 'code' },
  ps1: { label: 'PowerShell 脚本', category: 'code' },
  sql: { label: 'SQL 脚本', category: 'code' },
  yml: { label: 'YAML 配置', category: 'code' },
  yaml: { label: 'YAML 配置', category: 'code' },
  toml: { label: '配置文件', category: 'code' },
  xml: { label: 'XML 数据', category: 'code' },
  vue: { label: 'Vue 组件', category: 'code' },
  svelte: { label: 'Svelte 组件', category: 'code' },
  map: { label: '源码映射', category: 'code' },
  lock: { label: '依赖锁定文件', category: 'code' },

  // —— 系统文件 ——
  dll: { label: '系统组件', category: 'system' },
  sys: { label: '系统驱动', category: 'system' },
  drv: { label: '设备驱动', category: 'system' },
  reg: { label: '注册表文件', category: 'system' },
  ini: { label: '配置文件', category: 'system' },
  dat: { label: '数据文件', category: 'system' },
  cab: { label: '系统更新包', category: 'system' },
  mui: { label: '多语言资源', category: 'system' },
  manifest: { label: '清单文件', category: 'system' },
  msi_dll: { label: '系统组件', category: 'system' },
  vhdx: { label: '虚拟磁盘', category: 'system' },
  vmdk: { label: '虚拟磁盘', category: 'system' },
  vdi: { label: '虚拟磁盘', category: 'system' },

  // —— 缓存/临时 ——
  log: { label: '日志文件', category: 'cache' },
  log1: { label: '日志文件', category: 'cache' },
  tmp: { label: '临时文件', category: 'cache' },
  temp: { label: '临时文件', category: 'cache' },
  bak: { label: '备份文件', category: 'cache' },
  backup: { label: '备份文件', category: 'cache' },
  old: { label: '旧版本文件', category: 'cache' },
  cache: { label: '缓存文件', category: 'cache' },
  crdownload: { label: '未下完的文件', category: 'cache' },
  part: { label: '未下完的文件', category: 'cache' },
  download: { label: '未下完的文件', category: 'cache' },
  '~': { label: '临时文件', category: 'cache' },
  swp: { label: '临时文件', category: 'cache' },
  dump: { label: '崩溃转储', category: 'cache' },
  dmp: { label: '崩溃转储', category: 'cache' },
  etl: { label: '系统跟踪日志', category: 'cache' }
}

/** 常见缓存目录名（无扩展名也认得出） */
const CACHE_DIR_NAMES = new Set([
  'temp',
  'tmp',
  'cache',
  'caches',
  'cacheddata',
  'cache_data',
  'logs',
  'log',
  'crashpad',
  'crashdumps',
  'node_modules',
  '__pycache__',
  '.gradle',
  '.npm',
  '.nuget',
  '.cache',
  'gpucache',
  'code cache',
  'cachestorage',
  'service worker',
  'cache2'
])

/** 查后缀信息；未知后缀 → "其他文件" */
export function extInfo(fileName: string): ExtInfo {
  const ext = extOf(fileName)
  if (!ext) return { label: '其他文件', category: 'other' }
  return DICT[ext] ?? { label: `${ext.toUpperCase()} 文件`, category: 'other' }
}

/** 是否缓存/临时类目录（按目录名判断，用于风险分级） */
export function isCacheDirName(name: string): boolean {
  return CACHE_DIR_NAMES.has(name.toLowerCase())
}

/** 大类展示信息（未知类兜底 other） */
export function categoryMeta(category: ExtCategory): CategoryMeta {
  return CATEGORY_META[category] ?? CATEGORY_META.other
}

/** 支持的大类顺序（图例/统计按此顺序展示，稳定不跳动） */
export const CATEGORY_ORDER: ExtCategory[] = [
  'video',
  'image',
  'audio',
  'doc',
  'archive',
  'program',
  'code',
  'system',
  'cache',
  'other'
]
