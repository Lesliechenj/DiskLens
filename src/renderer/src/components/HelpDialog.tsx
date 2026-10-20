// 新手帮助：一屏说清"先点哪、图怎么看、删了会怎样"
// 小白不需要读 README；遇到不懂的按 F1 就能看到人话解释

import { useUiStore } from '../store/uiStore'
import { Icon, type IconName } from './icons'

interface ViewGuide {
  name: string
  icon: IconName
  what: string
  when: string
}

const VIEW_GUIDES: ViewGuide[] = [
  {
    name: '面积图',
    icon: 'grid',
    what: '块越大 = 占地方越多，颜色代表文件类型',
    when: '第一眼想知道"谁最占地方"'
  },
  {
    name: '目录树',
    icon: 'tree',
    what: '像资源管理器一样一层层展开，带大小和占比',
    when: '想顺着文件夹往下找'
  },
  {
    name: '旭日图',
    icon: 'radar',
    what: '内圈这一层、外圈下一层，两层结构一眼看穿',
    when: '想看两层目录的分布'
  },
  {
    name: '类型构成',
    icon: 'pie',
    what: '视频/图片/文档/缓存各占多少，环形图 + 后缀表',
    when: '想知道"空间被什么类型的文件吃了"'
  },
  {
    name: '文件分类',
    icon: 'tags',
    what: '把某类文件（如所有 .docx、所有视频）一次列全',
    when: '想集中处理某一类文件'
  },
  {
    name: '大文件',
    icon: 'list',
    what: '本次扫描最大的文件排行，可排序',
    when: '想揪出几个特别大的文件'
  },
  {
    name: '文件夹',
    icon: 'tree',
    what: '最占地方的目录 TopN，点一行直接进入',
    when: '想快速定位"重灾区"文件夹'
  },
  {
    name: '文件年龄',
    icon: 'clock',
    what: '按最后修改时间分布，列出又大又旧的文件',
    when: '想清理很久没动过的东西'
  },
  {
    name: '重复文件',
    icon: 'copy',
    what: '找出内容完全相同的文件，每组保留一份',
    when: '同一份资料存了好几处'
  },
  {
    name: '压缩包',
    icon: 'archive',
    what: '按大小列出 zip/rar/7z/iso，ZIP 可直接看内容',
    when: '想清理下载的安装包/旧压缩包'
  },
  {
    name: '清理建议',
    icon: 'broom',
    what: '临时文件/日志/缓存/安装包/空文件夹自动归类',
    when: '想照着清单安全清理'
  },
  {
    name: '回收站',
    icon: 'recycle',
    what: '看看自己删了什么、原来在哪、能还原哪些',
    when: '删错了，想找回来'
  }
]

const SHORTCUTS = [
  { key: 'Ctrl + O', what: '选文件夹扫描' },
  { key: 'Ctrl + F', what: '搜索文件名' },
  { key: 'F5', what: '重新扫描当前路径' },
  { key: 'Ctrl + E', what: '导出 CSV 报告' },
  { key: 'Ctrl + ,', what: '打开设置' },
  { key: 'F1', what: '打开这份帮助' },
  { key: 'Backspace', what: '返回上一层' },
  { key: 'Esc', what: '关闭弹窗 / 取消选中' }
]

export function HelpDialog(): React.JSX.Element | null {
  const open = useUiStore((state) => state.helpOpen)
  const close = useUiStore((state) => state.closeHelp)

  if (!open) return null

  return (
    <div className="modal-overlay" role="presentation" onMouseDown={close}>
      <div
        className="modal help-modal"
        role="dialog"
        aria-modal="true"
        aria-label="新手帮助"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal-head">
          <h3>
            <Icon name="help" size={16} /> 新手帮助
          </h3>
          <button className="icon-btn xs" onClick={close} title="关闭" aria-label="关闭帮助">
            <Icon name="close" size={14} />
          </button>
        </header>

        <div className="help-body">
          <p className="help-scroll-hint">
            <Icon name="chevronDown" size={12} /> 往下滚动还能看到安全规则、快捷键和常见问题
          </p>

          <section className="help-section">
            <h4>三步就能用</h4>
            <ol className="help-steps">
              <li>
                <span className="help-step-no">1</span>
                <div>
                  <b>选一个盘或文件夹，点「开始扫描」</b>
                  <p>
                    首页的磁盘卡片、右上角输入框、拖个文件夹进窗口，三种都行。扫描只读取大小，不动文件。
                  </p>
                </div>
              </li>
              <li>
                <span className="help-step-no">2</span>
                <div>
                  <b>先看面积图，再换视图</b>
                  <p>
                    块越大越占地方；点目录块往里钻。想找具体某类或某个文件，用上面的视图标签切换。
                  </p>
                </div>
              </li>
              <li>
                <span className="help-step-no">3</span>
                <div>
                  <b>照着「清理建议」清，删前会再问一次</b>
                  <p>
                    所有删除都只进系统回收站，能恢复。系统关键目录默认不扫，风险标签会标出「别动」。
                  </p>
                </div>
              </li>
            </ol>
          </section>

          <section className="help-section">
            <h4>这么多视图，什么时候用哪个？</h4>
            <div className="help-table">
              {VIEW_GUIDES.map((view) => (
                <div key={view.name} className="help-table-row">
                  <span className="help-view-name">
                    <Icon name={view.icon} size={13} /> {view.name}
                  </span>
                  <span>{view.what}</span>
                  <span className="muted">{view.when}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="help-section">
            <h4>安全规则（重要）</h4>
            <ul className="help-safety">
              <li>
                <Icon name="shield" size={13} />{' '}
                默认只进系统回收站；只有你在向导里明确勾选「彻底释放」才会永久删除本次项目。
              </li>
              <li>
                <Icon name="alert" size={13} />{' '}
                标了「别动」的系统/程序文件，删了可能让软件或系统出问题，请用卸载程序。
              </li>
              <li>
                <Icon name="info" size={13} />{' '}
                清理前确认重要文件已备份；「很久没改」不等于「可以删」。
              </li>
            </ul>
          </section>

          <section className="help-section">
            <h4>快捷键</h4>
            <div className="help-keys">
              {SHORTCUTS.map((item) => (
                <div key={item.key} className="help-key-row">
                  <kbd>{item.key}</kbd>
                  <span>{item.what}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="help-section">
            <h4>常见问题</h4>
            <details className="help-faq">
              <summary>为什么 DiskLens 的总大小和资源管理器不一样？</summary>
              <p>
                排除清单里的目录（如
                Windows、AppData、回收站）默认不扫；无权限的目录会跳过；符号链接也不重复计算。
                状态栏会写明跳过了多少项。
              </p>
            </details>
            <details className="help-faq">
              <summary>扫整盘很慢，正常吗？</summary>
              <p>
                正常。普通家用盘几十万文件通常几秒到几十秒，机械盘或百万文件可能要几分钟。
                扫描随时可以取消，且不会留下半截结果。想快一点就先扫具体文件夹（如下载、桌面）。
              </p>
            </details>
            <details className="help-faq">
              <summary>查重会不会很危险？</summary>
              <p>
                查重只读取文件内容，不修改。结果里每组默认保留最早的一份，勾选框只出现在「要删的副本」上，
                而且删除仍然走回收站 + 二次确认。
              </p>
            </details>
            <details className="help-faq">
              <summary>为什么完整扫描里没看到浏览器缓存？</summary>
              <p>
                浏览器缓存在 AppData 里，整盘扫描默认会跳过
                AppData。用首页或向导里的「快速清理」即可： 它会专门扫描浏览器缓存、Windows
                Temp、更新缓存等目录，不需要改排除清单。
              </p>
            </details>
            <details className="help-faq">
              <summary>为什么清理时只弹一次管理员授权？</summary>
              <p>
                DiskLens 会把整批路径交给一个提权帮手，用系统批量删除接口一次处理，
                不会一个文件弹一次 UAC。你取消授权时，整批都不会删除。
              </p>
            </details>
            <details className="help-faq">
              <summary>清理报告存在哪里？</summary>
              <p>
                每次清理完成都会弹出报告；详细 HTML 文件在用户数据目录的 reports 文件夹里，
                弹窗底部可以直接「查看报告存放路径」或「打开详细报告」。
              </p>
            </details>
          </section>
        </div>

        <footer className="modal-foot">
          <span className="muted">按 F1 随时打开 · Esc 关闭</span>
          <button className="btn primary sm" onClick={close}>
            开始用
          </button>
        </footer>
      </div>
    </div>
  )
}
