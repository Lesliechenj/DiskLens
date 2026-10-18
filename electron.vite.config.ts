import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {},
  // 两个预加载脚本：渲染层用 index，隐藏扫描窗口用 scanner
  // （扫描逻辑跑在 scanner 预加载里：preload 拥有完整 Node fs 权限）
  preload: {
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/preload/index.ts'),
          scanner: resolve('src/scanner/preload.ts')
        }
      }
    }
  },
  // 两个页面入口：主界面 index，隐藏扫描窗口 scanner
  renderer: {
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/renderer/index.html'),
          scanner: resolve('src/renderer/scanner/index.html')
        }
      }
    },
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react()]
  }
})
