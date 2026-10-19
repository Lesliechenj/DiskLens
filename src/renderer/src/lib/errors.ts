// 系统错误 → 人话提示（纯函数，可单测）
// 回收站/定位失败时，Node/Electron 抛的是 ENOENT/EACCES 这种机器话，
// 小白看了只会更慌。这里翻译成"发生了什么 + 怎么办"。

/** 把 error 翻成小白能懂的话；action 如「移到回收站」「定位」 */
export function friendlyError(action: string, error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  if (/ENOENT|no such file/i.test(raw)) {
    return `${action}失败：文件已经不见了（可能刚被移走或删掉）`
  }
  if (/EACCES|EPERM|permission denied/i.test(raw)) {
    return `${action}失败：没有权限。试试右键 DiskLens →「以管理员身份运行」`
  }
  if (/EBUSY|is being used/i.test(raw)) {
    return `${action}失败：文件正被别的程序占着，先关掉那个程序再试`
  }
  return `${action}失败：${raw}`
}
