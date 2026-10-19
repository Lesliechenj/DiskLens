// 右键菜单：把原生菜单的动作接到渲染层的统一流程上
// （定位/打开/复制/只看这类/进入目录/移到回收站）

import { useCallback } from 'react'
import type { ScanNode } from '../../../shared/types'
import { useScanStore } from '../store/scanStore'
import { useUiStore } from '../store/uiStore'
import { copyText, locatePath, openPath } from '../lib/actions'
import { findNodeByPath } from '../lib/insights'
import { baseNameOf } from '../../../shared/paths'

export function useNodeMenu(): (node: ScanNode) => Promise<void> {
  const select = useScanStore((state) => state.select)
  const setExt = useScanStore((state) => state.setExt)
  const setView = useScanStore((state) => state.setView)
  const jumpTo = useScanStore((state) => state.jumpTo)
  const requestTrash = useUiStore((state) => state.requestTrash)

  return useCallback(
    async (node: ScanNode) => {
      const type = node.type === 'dir' ? 'dir' : 'file'
      const action = await window.api.showNodeMenu(node.path, type)
      if (!action) return

      switch (action) {
        case 'locate':
          await locatePath(node.path)
          break
        case 'open':
          await openPath(node.path)
          break
        case 'copy':
          await copyText(node.path)
          break
        case 'copy-name':
          await copyText(baseNameOf(node.path), '名称')
          break
        case 'filter': {
          const result = useScanStore.getState().result
          if (!result) break
          const found = findNodeByPath(result.root, node.path)
          if (found) jumpTo(found.ancestors)
          const dot = node.name.lastIndexOf('.')
          setExt(dot > 0 ? node.name.slice(dot + 1).toLowerCase() : '')
          setView('treemap')
          break
        }
        case 'enter': {
          const result = useScanStore.getState().result
          if (!result) break
          const found = findNodeByPath(result.root, node.path)
          if (found) {
            jumpTo(found.ancestors, found.node)
            setView('treemap')
          }
          break
        }
        case 'trash':
          select(node)
          requestTrash([node])
          break
        default:
          break
      }
    },
    [select, setExt, setView, jumpTo, requestTrash]
  )
}
