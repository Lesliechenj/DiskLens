import { useEffect, useState } from 'react'
import { useScanStore } from './store/scanStore'
import { ResultPanel } from './components/ResultPanel'
import { formatBytes, formatCount, formatDuration } from '../../shared/format'
import { DEFAULT_EXCLUDE_DIRS, DEFAULT_EXCLUDE_NAMES } from '../../shared/excludes'
import './assets/app.css'

function App(): React.JSX.Element {
  const [rootPath, setRootPath] = useState('')
  // F6 排除清单：默认勾选，防误扫（手滑选 C 盘也不拖 Windows 进来）
  const [excludes, setExcludes] = useState<string[]>(DEFAULT_EXCLUDE_NAMES)
  const { status, progress, result, error, setProgress, setDone, setError, reset } = useScanStore()

  // 订阅 IPC：扫描进程 → 主进程 → 这里
  useEffect(() => {
    window.api.onScanProgress(setProgress)
    window.api.onScanDone(setDone)
    window.api.onScanError(setError)
  }, [setProgress, setDone, setError])

  const handleSelect = async (): Promise<void> => {
    const path = await window.api.selectDirectory()
    if (path) setRootPath(path)
  }

  const handleStart = (): void => {
    const target = rootPath.trim()
    if (!target || status === 'scanning') return
    useScanStore.setState({ status: 'scanning', progress: null, result: null, error: null })
    window.api.startScan(target, excludes)
  }

  const toggleExclude = (name: string): void => {
    setExcludes((prev) => (prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]))
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>DiskLens</h1>
        <span className="badge">W5 三件套 + 文件操作</span>
      </header>

      <section className="panel">
        <div className="path-row">
          <input
            value={rootPath}
            onChange={(e) => setRootPath(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleStart()}
            placeholder="输入目录路径（如 C:/Users/你/Downloads），或点右侧按钮选择"
            spellCheck={false}
          />
          <button onClick={handleSelect}>选择目录</button>
        </div>
        <button
          className="primary"
          disabled={status === 'scanning' || !rootPath.trim()}
          onClick={handleStart}
        >
          {status === 'scanning' ? '扫描中…' : '开始扫描'}
        </button>

        <details className="excludes">
          <summary>
            排除清单（已勾选 {excludes.length}/{DEFAULT_EXCLUDE_DIRS.length} 项，默认跳过防误扫）
          </summary>
          <div className="exclude-list">
            {DEFAULT_EXCLUDE_DIRS.map((item) => (
              <label key={item.name} className="exclude-item">
                <input
                  type="checkbox"
                  checked={excludes.includes(item.name)}
                  onChange={() => toggleExclude(item.name)}
                />
                <span className="exclude-name">{item.name}</span>
                <span className="exclude-desc">{item.desc}</span>
              </label>
            ))}
          </div>
        </details>
      </section>

      {status === 'scanning' && (
        <section className="panel">
          <h2>扫描中</h2>
          <div className="progress-track">
            <div className="progress-indeterminate" />
          </div>
          <p className="progress-text">
            已扫描 <b>{formatCount(progress?.files ?? 0)}</b> 个文件 ·{' '}
            <b>{formatCount(progress?.dirs ?? 0)}</b> 个目录 ·{' '}
            <b>{formatBytes(progress?.bytes ?? 0)}</b>
          </p>
          <p className="current-path" title={progress?.currentPath}>
            当前：{progress?.currentPath ?? '准备中…'}
          </p>
        </section>
      )}

      {status === 'done' && result && (
        <section className="panel">
          <h2>扫描完成</h2>
          <p className="summary">
            总计 <b>{formatBytes(result.root.size)}</b> · 耗时{' '}
            <b>{formatDuration(result.durationMs)}</b>
            {result.excluded > 0 && (
              <>
                {' · '}
                <span className="skipped-hint">已跳过 {result.excluded} 个排除目录</span>
              </>
            )}
            {result.skipped.length > 0 && (
              <>
                {' · '}
                <span className="skipped-hint">
                  ⚠️ {result.skipped.length} 个目录无权限，已自动跳过
                </span>
              </>
            )}
          </p>
          <ResultPanel />
          {result.skipped.length > 0 && (
            <details className="skipped-details">
              <summary>查看跳过的 {result.skipped.length} 个目录</summary>
              <ul>
                {result.skipped.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}

      {status === 'error' && (
        <section className="panel error-panel">
          <h2>扫描失败</h2>
          <p>{error}</p>
          <button onClick={reset}>重试</button>
        </section>
      )}

      <footer className="app-footer">仅供参考，重要文件请自行备份 · W5 里程碑</footer>
    </div>
  )
}

export default App
