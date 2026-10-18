// F8 后缀名人话词典：给电脑小白看的"这是什么文件"
// .pdf → "PDF 文档"、.mp4 → "视频文件"……未知后缀回落"其他文件"

/** 文件大类（用于饼图/统计/风险判定的中间层） */
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

export interface ExtInfo {
  /** 人话标签，如 "PDF 文档" */
  label: string
  category: ExtCategory
}

const DICT: Record<string, ExtInfo> = {
  // 视频
  mp4: { label: '视频文件', category: 'video' },
  mkv: { label: '视频文件', category: 'video' },
  avi: { label: '视频文件', category: 'video' },
  mov: { label: '视频文件', category: 'video' },
  wmv: { label: '视频文件', category: 'video' },
  flv: { label: '视频文件', category: 'video' },
  ts: { label: '视频文件', category: 'video' },
  webm: { label: '视频文件', category: 'video' },
  // 图片
  jpg: { label: '图片文件', category: 'image' },
  jpeg: { label: '图片文件', category: 'image' },
  png: { label: '图片文件', category: 'image' },
  gif: { label: '图片文件', category: 'image' },
  bmp: { label: '图片文件', category: 'image' },
  webp: { label: '图片文件', category: 'image' },
  svg: { label: '矢量图片', category: 'image' },
  ico: { label: '图标文件', category: 'image' },
  heic: { label: '图片文件', category: 'image' },
  // 音频
  mp3: { label: '音频文件', category: 'audio' },
  wav: { label: '音频文件', category: 'audio' },
  flac: { label: '无损音频', category: 'audio' },
  aac: { label: '音频文件', category: 'audio' },
  ogg: { label: '音频文件', category: 'audio' },
  m4a: { label: '音频文件', category: 'audio' },
  // 文档
  pdf: { label: 'PDF 文档', category: 'doc' },
  doc: { label: 'Word 文档', category: 'doc' },
  docx: { label: 'Word 文档', category: 'doc' },
  xls: { label: 'Excel 表格', category: 'doc' },
  xlsx: { label: 'Excel 表格', category: 'doc' },
  ppt: { label: 'PPT 演示', category: 'doc' },
  pptx: { label: 'PPT 演示', category: 'doc' },
  txt: { label: '文本文件', category: 'doc' },
  md: { label: 'Markdown 笔记', category: 'doc' },
  csv: { label: 'CSV 数据表', category: 'doc' },
  epub: { label: '电子书', category: 'doc' },
  mobi: { label: '电子书', category: 'doc' },
  // 压缩包
  zip: { label: '压缩包', category: 'archive' },
  rar: { label: '压缩包', category: 'archive' },
  '7z': { label: '压缩包', category: 'archive' },
  tar: { label: '压缩包', category: 'archive' },
  gz: { label: '压缩包', category: 'archive' },
  // 程序/安装包
  exe: { label: '可执行程序', category: 'program' },
  msi: { label: '安装包', category: 'program' },
  bat: { label: '批处理脚本', category: 'program' },
  cmd: { label: '批处理脚本', category: 'program' },
  apk: { label: '安卓安装包', category: 'program' },
  dmg: { label: 'Mac 安装镜像', category: 'program' },
  // 代码/开发（注意：.ts 归视频类——Transport Stream，小白录屏/电视录像常见）
  js: { label: 'JavaScript 代码', category: 'code' },
  json: { label: 'JSON 数据', category: 'code' },
  html: { label: '网页文件', category: 'code' },
  css: { label: '样式文件', category: 'code' },
  py: { label: 'Python 脚本', category: 'code' },
  java: { label: 'Java 源码', category: 'code' },
  c: { label: 'C 源码', category: 'code' },
  cpp: { label: 'C++ 源码', category: 'code' },
  go: { label: 'Go 源码', category: 'code' },
  rs: { label: 'Rust 源码', category: 'code' },
  // 系统文件
  dll: { label: '系统组件', category: 'system' },
  sys: { label: '系统驱动', category: 'system' },
  reg: { label: '注册表文件', category: 'system' },
  ini: { label: '配置文件', category: 'system' },
  dat: { label: '数据文件', category: 'system' },
  cab: { label: '系统更新包', category: 'system' },
  // 缓存/临时
  log: { label: '日志文件', category: 'cache' },
  tmp: { label: '临时文件', category: 'cache' },
  temp: { label: '临时文件', category: 'cache' },
  bak: { label: '备份文件', category: 'cache' },
  old: { label: '旧版本文件', category: 'cache' },
  cache: { label: '缓存文件', category: 'cache' },
  crdownload: { label: '未下完的文件', category: 'cache' },
  part: { label: '未下完的文件', category: 'cache' }
}

/** 常见缓存目录名（无扩展名也认得出） */
const CACHE_DIR_NAMES = new Set([
  'temp', 'tmp', 'cache', 'caches', 'logs', 'log', 'node_modules',
  '__pycache__', '.gradle', '.npm', '.nuget', 'packages', 'tmpfiles'
])

/** 查后缀信息；未知后缀 → "其他文件" */
export function extInfo(fileName: string): ExtInfo {
  const dot = fileName.lastIndexOf('.')
  if (dot <= 0) return { label: '其他文件', category: 'other' }
  const ext = fileName.slice(dot + 1).toLowerCase()
  return DICT[ext] ?? { label: '其他文件', category: 'other' }
}

/** 是否缓存/临时类目录（按目录名判断，用于风险分级） */
export function isCacheDirName(name: string): boolean {
  return CACHE_DIR_NAMES.has(name.toLowerCase())
}
