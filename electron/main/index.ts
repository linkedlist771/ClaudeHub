import { app, BrowserWindow, shell, ipcMain, session, dialog } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The built directory structure
//
// ├─┬ dist-electron
// │ ├─┬ main
// │ │ └── index.js    > Electron-Main
// │ └─┬ preload
// │   └── index.mjs   > Preload-Scripts
// ├─┬ dist
// │ └── index.html    > Electron-Renderer
//
process.env.APP_ROOT = path.join(__dirname, '../..')

export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')
export const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

// Disable GPU Acceleration for Windows 7
if (os.release().startsWith('6.1')) app.disableHardwareAcceleration()

// Set application name for Windows 10+ notifications
if (process.platform === 'win32') app.setAppUserModelId(app.getName())

// 开发模式（vite dev server）下使用独立的应用名 / userData 目录，
// 避免与已安装并运行中的正式版 ChatGPTHub 抢「单实例锁」，
// 否则 `npm run dev` 启动的开发版会因拿不到锁而立即退出（窗口开不出来）。
// 仅 dev 生效；打包后的正式版没有 VITE_DEV_SERVER_URL，行为不变。
if (process.env.VITE_DEV_SERVER_URL) {
  app.setName('chatgpthub-dev')
  app.setPath('userData', path.join(app.getPath('appData'), 'chatgpthub-dev'))
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

let win: BrowserWindow | null = null
const preload = path.join(__dirname, '../preload/index.mjs')
const indexHtml = path.join(RENDERER_DIST, 'index.html')

async function createWindow() {
  win = new BrowserWindow({
    title: 'ChatGPTHub',
    width: 1600,
    height: 1000,
    icon: path.join(process.env.VITE_PUBLIC, 'logo.png'),
    webPreferences: {
      preload,
      webviewTag: true,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  })

  win.webContents.on('will-attach-webview', (event, webPreferences, params) => {
    delete webPreferences.preload
    webPreferences.nodeIntegration = false
    webPreferences.contextIsolation = true
    webPreferences.sandbox = true

    try {
      const origin = new URL(params.src).origin
      if (origin !== 'https://chatgpt.com' && origin !== 'https://chat.openai.com') {
        event.preventDefault()
      }
    } catch {
      event.preventDefault()
    }
  })

  if (VITE_DEV_SERVER_URL) { // #298
    win.loadURL(VITE_DEV_SERVER_URL)
    // Open devTool if the app is not packaged
    win.webContents.openDevTools()
  } else {
    win.loadFile(indexHtml)
  }

  // Make all links open with the browser, not with the application
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) shell.openExternal(url)
    return { action: 'deny' }
  })
  // win.webContents.on('will-navigate', (event, url) => { }) #344
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  win = null
  if (process.platform !== 'darwin') app.quit()
})

app.on('second-instance', () => {
  if (win) {
    // Focus on the main window if the user tried to open another
    if (win.isMinimized()) win.restore()
    win.focus()
  }
})

app.on('activate', () => {
  const allWindows = BrowserWindow.getAllWindows()
  if (allWindows.length) {
    allWindows[0].focus()
  } else {
    createWindow()
  }
})

// ---------- ChatGPT 账号会话 cookie 导出 / 导入 ----------
// httpOnly cookie 只能在主进程通过 session API 读写。导入后仍可能因
// OpenAI 的安全校验、SSO 或设备绑定而需要重新登录。

function cookieToUrl(c: Electron.Cookie): string {
  const host = c.domain?.startsWith('.') ? c.domain.slice(1) : (c.domain || '')
  const scheme = c.secure ? 'https' : 'http'
  return `${scheme}://${host}${c.path || '/'}`
}

// accounts: { id: string; name: string }[]
ipcMain.handle('export-accounts', async (_, accounts: { id: string; name: string }[]) => {
  try {
    const out: any[] = []
    for (const acc of accounts || []) {
      const ses = session.fromPartition(`persist:chatgpt-${acc.id}`)
      const cookies = await ses.cookies.get({})
      out.push({ id: acc.id, name: acc.name, cookies })
    }
    const data = JSON.stringify({ app: 'ChatGPTHub', version: 1, exportedAt: Date.now(), accounts: out }, null, 2)

    const { canceled, filePath } = await dialog.showSaveDialog({
      title: '导出 ChatGPT 账号会话',
      defaultPath: `chatgpt-accounts-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })
    if (canceled || !filePath) return { ok: false, canceled: true }
    fs.writeFileSync(filePath, data, 'utf-8')
    return { ok: true, filePath, count: out.length }
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) }
  }
})

ipcMain.handle('import-accounts', async () => {
  try {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: '导入 ChatGPT 账号会话',
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })
    if (canceled || !filePaths?.[0]) return { ok: false, canceled: true }

    const parsed = JSON.parse(fs.readFileSync(filePaths[0], 'utf-8'))
    if (parsed?.app !== 'ChatGPTHub' || parsed?.version !== 1) {
      return { ok: false, error: '文件不是受支持的 ChatGPTHub 会话导出格式' }
    }
    const accounts = (Array.isArray(parsed.accounts) ? parsed.accounts : []).filter((acc: any) =>
      typeof acc?.id === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(acc.id) &&
      typeof acc?.name === 'string' && Array.isArray(acc?.cookies)
    )

    for (const acc of accounts) {
      const ses = session.fromPartition(`persist:chatgpt-${acc.id}`)
      for (const c of acc.cookies || []) {
        try {
          await ses.cookies.set({
            url: cookieToUrl(c),
            name: c.name,
            value: c.value,
            domain: c.domain,
            path: c.path,
            secure: c.secure,
            httpOnly: c.httpOnly,
            expirationDate: c.expirationDate,
            sameSite: c.sameSite,
          })
        } catch (err) {
          console.error('set cookie failed:', c?.name, err)
        }
      }
    }
    // 回传账号元数据，渲染进程据此合并账号列表
    return { ok: true, count: accounts.length, accounts: accounts.map((a: any) => ({ id: a.id, name: a.name })) }
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) }
  }
})
