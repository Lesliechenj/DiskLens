// 图标库：线性 SVG（currentColor 描边），比 emoji 更像成熟软件
// 只收 UI 真正用到的图标，避免引一整个图标包

import type { JSX } from 'react'

export type IconName =
  | 'drive'
  | 'folder'
  | 'folder-open'
  | 'file'
  | 'search'
  | 'settings'
  | 'sun'
  | 'moon'
  | 'monitor'
  | 'trash'
  | 'locate'
  | 'external'
  | 'copy'
  | 'chevron-right'
  | 'chevron-down'
  | 'chevron-left'
  | 'arrow-up'
  | 'x'
  | 'grid'
  | 'sunburst'
  | 'pie'
  | 'list'
  | 'tree'
  | 'broom'
  | 'export'
  | 'refresh'
  | 'check'
  | 'alert'
  | 'info'
  | 'eye'
  | 'shield'
  | 'clock'
  | 'sparkle'
  | 'stop'

interface IconProps {
  name: IconName
  size?: number
  /** 描边宽度，默认 1.8 */
  stroke?: number
  className?: string
}

const PATHS: Record<IconName, JSX.Element> = {
  drive: (
    <>
      <rect x="2.5" y="5" width="19" height="6" rx="2" />
      <rect x="2.5" y="13" width="19" height="6" rx="2" />
      <path d="M6 8h.01M6 16h.01" />
    </>
  ),
  folder: (
    <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2.5h7A1.5 1.5 0 0 1 19 10v7a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 3 17z" />
  ),
  'folder-open': (
    <>
      <path d="M3 8V6.5A1.5 1.5 0 0 1 4.5 5h4l2 2.5H16a1.5 1.5 0 0 1 1.5 1.5v1" />
      <path d="M3 8.5h17l-2 8.2a1.5 1.5 0 0 1-1.46 1.1H4.3a1.2 1.2 0 0 1-1.18-1.4z" />
    </>
  ),
  file: (
    <>
      <path d="M6 3.5h7l5 5V20a.5.5 0 0 1-.5.5h-11A.5.5 0 0 1 6 20z" />
      <path d="M13 3.5V9h5" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m15.5 15.5 4.5 4.5" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.11a1.7 1.7 0 0 0-2.9-1.2l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15H4.5a2 2 0 1 1 0-4h.11a1.7 1.7 0 0 0 1.2-2.9l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 11 4.6V4.5a2 2 0 1 1 4 0v.11a1.7 1.7 0 0 0 2.9 1.2l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0 1.2 2.9h.07a2 2 0 1 1 0 4h-.11a1.7 1.7 0 0 0-1.55 1z" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  moon: <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />,
  monitor: (
    <>
      <rect x="2.5" y="4" width="19" height="12.5" rx="2" />
      <path d="M8.5 20.5h7M12 16.5v4" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16M9.5 7V5.2A1.2 1.2 0 0 1 10.7 4h2.6a1.2 1.2 0 0 1 1.2 1.2V7" />
      <path d="M6 7l.8 12.1A1.9 1.9 0 0 0 8.7 21h6.6a1.9 1.9 0 0 0 1.9-1.9L18 7" />
      <path d="M10.5 11v6M13.5 11v6" />
    </>
  ),
  locate: (
    <>
      <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2.5h7A1.5 1.5 0 0 1 19 12" />
      <path d="m14 17 3 3 4-5" />
      <path d="M3 17.5V7.5" />
    </>
  ),
  external: (
    <>
      <path d="M13 4h7v7" />
      <path d="M20 4l-8.5 8.5" />
      <path d="M18 14v4.5A1.5 1.5 0 0 1 16.5 20h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" />
    </>
  ),
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M15 6.5A2.5 2.5 0 0 0 12.5 4H6a2 2 0 0 0-2 2v6.5A2.5 2.5 0 0 0 6.5 15" />
    </>
  ),
  'chevron-right': <path d="m9.5 5 7 7-7 7" />,
  'chevron-down': <path d="m5 9.5 7 7 7-7" />,
  'chevron-left': <path d="m14.5 5-7 7 7 7" />,
  'arrow-up': (
    <>
      <path d="M12 19V5" />
      <path d="m5.5 11.5 6.5-6.5 6.5 6.5" />
    </>
  ),
  x: <path d="m6 6 12 12M18 6 6 18" />,
  grid: (
    <>
      <rect x="3.5" y="3.5" width="8" height="8" rx="1.5" />
      <rect x="12.5" y="3.5" width="8" height="12" rx="1.5" />
      <rect x="3.5" y="12.5" width="8" height="8" rx="1.5" />
      <rect x="12.5" y="17.5" width="8" height="3" rx="1.5" />
    </>
  ),
  sunburst: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 4.5v3M12 16.5v3M4.5 12h3M16.5 12h3M6.7 6.7l2.1 2.1M15.2 15.2l2.1 2.1M17.3 6.7l-2.1 2.1M8.8 15.2l-2.1 2.1" />
      <circle cx="12" cy="12" r="8.5" strokeDasharray="2 3" />
    </>
  ),
  pie: (
    <>
      <path d="M12 3.5A8.5 8.5 0 1 0 20.5 12H12z" />
      <path d="M14 3.6A8.5 8.5 0 0 1 20.4 10H14z" />
    </>
  ),
  list: (
    <>
      <path d="M8 6h12M8 12h12M8 18h12" />
      <path d="M4 6h.01M4 12h.01M4 18h.01" />
    </>
  ),
  tree: (
    <>
      <path d="M4 5h6M4 5v14M4 19h6" />
      <path d="M10 5v14M13 9h7M13 15h7" />
      <rect x="19" y="7" width="2.5" height="4" rx="1" />
      <rect x="19" y="13" width="2.5" height="4" rx="1" />
    </>
  ),
  broom: (
    <>
      <path d="M14.5 3.5 8 10l6 6 6.5-6.5" />
      <path d="M8 10 4.5 20.5 15 17" />
      <path d="m11 13 2 2" />
    </>
  ),
  export: (
    <>
      <path d="M12 3.5v11M8.5 7 12 3.5 15.5 7" />
      <path d="M5 14v5.5A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V14" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 11.5A8 8 0 0 0 6.2 6.2L4 8.5" />
      <path d="M4 4.5v4h4" />
      <path d="M4 12.5A8 8 0 0 0 17.8 17.8L20 15.5" />
      <path d="M20 19.5v-4h-4" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 6.5" />,
  alert: (
    <>
      <path d="M12 3.8 21 19.5H3z" />
      <path d="M12 9.5v4.5M12 17h.01" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5M12 8h.01" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="2.8" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3.2 19 6v5.4c0 4.4-2.9 7.9-7 9.4-4.1-1.5-7-5-7-9.4V6z" />
      <path d="m9 12 2.2 2.2L15.5 10" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  sparkle: (
    <>
      <path d="M12 3.5l1.9 4.9 4.9 1.9-4.9 1.9L12 17l-1.9-4.8L5.2 10.3l4.9-1.9z" />
      <path d="M18.5 16.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />
    </>
  ),
  stop: <rect x="6.5" y="6.5" width="11" height="11" rx="2" />
}

/** 线性图标：24 网格，currentColor 描边，默认 1.8px */
export function Icon({ name, size = 16, stroke = 1.8, className }: IconProps): JSX.Element {
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
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  )
}
