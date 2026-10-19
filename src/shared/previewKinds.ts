// 文件预览分类（纯函数）：决定一个文件能不能预览、预览成什么样
// 预览读取走主进程 IPC（渲染层没有 Node 权限），这里只做"要不要读/怎么读"的判断

/** 图片预览上限：超过就不读（防止误选一个 4GB 的 iso 把内存撑爆） */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024
/** 文本预览上限：只读头部 TEXT_HEAD_BYTES，但文件本身别超过 1MB */
export const MAX_TEXT_BYTES = 1024 * 1024
/** 文本预览读多少字节（约 8KB，够看几十行） */
export const TEXT_HEAD_BYTES = 8 * 1024

export type PreviewKind = 'image' | 'text' | 'none' | 'toobig' | 'error'

/** 文件预览结果（主进程读文件后经 IPC 返回给渲染层） */
export type PreviewResult =
  | { kind: 'image'; dataUrl: string; bytes?: number }
  | { kind: 'text'; text: string; bytes?: number }
  | { kind: Exclude<PreviewKind, 'image' | 'text'>; message?: string; bytes?: number }

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'ico', 'svg'])

const TEXT_EXTS = new Set([
  'txt',
  'md',
  'json',
  'log',
  'csv',
  'tsv',
  'ini',
  'cfg',
  'conf',
  'xml',
  'yaml',
  'yml',
  'html',
  'css',
  'js',
  'ts',
  'py',
  'java',
  'c',
  'cpp',
  'h',
  'bat',
  'ps1',
  'sh'
])

const IMAGE_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  svg: 'image/svg+xml'
}

/** 按文件名 + 大小判定预览类型 */
export function previewKind(fileName: string, size: number): PreviewKind {
  const dot = fileName.lastIndexOf('.')
  if (dot <= 0) return 'none'
  const ext = fileName.slice(dot + 1).toLowerCase()
  if (IMAGE_EXTS.has(ext)) return size > MAX_IMAGE_BYTES ? 'toobig' : 'image'
  if (TEXT_EXTS.has(ext)) return size > MAX_TEXT_BYTES ? 'toobig' : 'text'
  return 'none'
}

/** 图片 dataURL 用的 MIME（不在表里的按 png 兜底） */
export function imageMime(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  const ext = dot > 0 ? fileName.slice(dot + 1).toLowerCase() : ''
  return IMAGE_MIME[ext] ?? 'image/png'
}
