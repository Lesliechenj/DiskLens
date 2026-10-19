// 渲染层兜底：任何组件抛错都不该让用户面对一片白
// 给一句人话 + "重新加载"按钮，并把错误打到控制台方便排查

import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[DiskLens] 界面出错了：', error, info.componentStack)
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="crash-screen">
        <div className="crash-card">
          <h1>界面出了点问题</h1>
          <p>刚才这一步让界面报错了。你的文件没有任何改动——DiskLens 只读，删除也只进回收站。</p>
          <pre>{error.message}</pre>
          <div className="crash-actions">
            <button className="btn primary" onClick={() => window.location.reload()}>
              重新加载界面
            </button>
            <button className="btn" onClick={() => this.setState({ error: null })}>
              试着继续
            </button>
          </div>
        </div>
      </div>
    )
  }
}
