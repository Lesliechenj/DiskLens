import Versions from './components/Versions'

function App(): React.JSX.Element {
  return (
    <>
      <div className="creator">开源 · MIT · Windows / macOS / Linux</div>
      <div className="text">DiskLens</div>
      <div className="text" style={{ fontSize: 18, fontWeight: 600, color: 'var(--ev-c-text-2)' }}>
        给电脑小白的磁盘空间可视化工具
      </div>
      <p className="tip">块越大 = 占地方越多，一眼看懂，安全清理</p>
      <p className="tip" style={{ fontSize: 13, opacity: 0.7 }}>
        开发中 · W1 脚手架已就位，扫描与图表施工中
      </p>
      <Versions></Versions>
    </>
  )
}

export default App
