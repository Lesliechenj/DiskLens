// 渲染层入口：装 React，挂 StrictMode 与错误兜底
// StrictMode 在开发期会双跑 effect——所有 IPC 订阅都返回了取消订阅函数，重复订阅也不会漏

import './assets/base.css'
import './assets/app.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
)
