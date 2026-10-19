// 图标：Lucide 图形数据 + morphicons 渲染
// - <Icon>         静态线性图标（列表里成百上千个也不产生动画开销）
// - <MorphingIcon> 会"变形"的图标（主题切换、侧栏开合、开始/取消扫描这类状态变化时）
// 图形数据来自 lucide（morphicons 官方推荐的图标源），渲染引擎来自 morphicons

import { createElement, type JSX } from 'react'
import { MorphIcon } from 'morphicons/react'
import {
  AppWindow,
  Archive,
  ArrowUp,
  AudioLines,
  BrushCleaning,
  ChartPie,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Code,
  Copy,
  Cpu,
  Database,
  Download,
  Eraser,
  ExternalLink,
  Eye,
  File,
  FileText,
  Film,
  Folder,
  FolderOpen,
  FolderTree,
  HardDrive,
  Image as ImageIcon,
  Info,
  LayoutGrid,
  List,
  LocateFixed,
  Monitor,
  Moon,
  Package,
  Radar,
  Recycle,
  RefreshCcw,
  RefreshCw,
  ScrollText,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Square,
  Sun,
  Tags,
  Trash,
  TriangleAlert,
  Undo2,
  X
} from 'lucide'
import type { IconName } from '../../../shared/iconNames'

export type { IconName }

/** 图标节点：[标签, 属性] 列表（Lucide 的数据格式，morphicons 原生吃这个） */
type IconNode = ReadonlyArray<readonly [string, Record<string, string | number | undefined>]>

/** 语义名 → 图形（satisfies 保证每个 IconName 都有对应图形，漏一个就编译报错） */
const ICONS = {
  // 通用
  drive: HardDrive,
  folder: Folder,
  folderOpen: FolderOpen,
  file: File,
  search: Search,
  settings: Settings,
  sun: Sun,
  moon: Moon,
  monitor: Monitor,
  trash: Trash,
  restore: Undo2,
  locate: LocateFixed,
  external: ExternalLink,
  copy: Copy,
  chevronRight: ChevronRight,
  chevronDown: ChevronDown,
  chevronLeft: ChevronLeft,
  arrowUp: ArrowUp,
  close: X,
  grid: LayoutGrid,
  radar: Radar,
  pie: ChartPie,
  list: List,
  tree: FolderTree,
  broom: BrushCleaning,
  export: Download,
  refresh: RefreshCw,
  check: Check,
  alert: TriangleAlert,
  info: Info,
  eye: Eye,
  shield: ShieldCheck,
  clock: Clock,
  sparkle: Sparkles,
  stop: Square,
  tags: Tags,
  recycle: Recycle,
  eraser: Eraser,
  database: Database,
  package: Package,
  scrollText: ScrollText,
  // 文件大类
  film: Film,
  image: ImageIcon,
  audio: AudioLines,
  doc: FileText,
  archive: Archive,
  program: AppWindow,
  code: Code,
  system: Cpu,
  cache: RefreshCcw,
  other: File,
  // 风险分级
  riskSafe: ShieldCheck,
  riskCaution: TriangleAlert,
  riskDanger: ShieldAlert
} satisfies Record<IconName, unknown> as unknown as Record<IconName, IconNode>

interface IconProps {
  name: IconName
  size?: number
  /** 描边宽度，默认 1.8 */
  stroke?: number
  className?: string
  /** 给屏幕阅读器的名字；不传就当作装饰（aria-hidden） */
  label?: string
}

/** 静态图标：直接出 SVG，列表滚动时不产生动画开销 */
export function Icon({ name, size = 16, stroke = 1.8, className, label }: IconProps): JSX.Element {
  const node = ICONS[name]
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined}
      focusable="false"
    >
      {label ? <title>{label}</title> : null}
      {node.map(([tag, attrs], index) => createElement(tag, { key: index, ...attrs }))}
    </svg>
  )
}

/** 会变形的图标：name 一变就用弹簧动画过渡到新形状（morphicons） */
export function MorphingIcon({
  name,
  size = 16,
  stroke = 1.8,
  className,
  label
}: IconProps): JSX.Element {
  return (
    <MorphIcon
      icon={ICONS[name]}
      size={size}
      strokeWidth={stroke}
      className={className}
      spring="snappy"
      // 系统要求减少动效时自动降级成直接切换（可访问性）
      reducedMotion="user"
      {...(label ? { label } : { 'aria-hidden': true })}
    />
  )
}
