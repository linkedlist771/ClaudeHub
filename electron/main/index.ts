import { app, BrowserWindow, shell, ipcMain, session, dialog, net } from 'electron'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'

const require = createRequire(import.meta.url)
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

if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

let win: BrowserWindow | null = null
const preload = path.join(__dirname, '../preload/index.mjs')
const indexHtml = path.join(RENDERER_DIST, 'index.html')

async function createWindow() {
  win = new BrowserWindow({
    title: 'ClaudeHub',
    width: 1600,
    height: 1000,
    icon: path.join(process.env.VITE_PUBLIC, 'favicon.ico'),
    webPreferences: {
      preload,
      // 启用 webview 标签
      webviewTag: true,
      // Warning: Enable nodeIntegration and disable contextIsolation is not secure in production
      // nodeIntegration: true,

      // Consider using contextBridge.exposeInMainWorld
      // Read more on https://www.electronjs.org/docs/latest/tutorial/context-isolation
      // contextIsolation: false,
    },
  })

  if (VITE_DEV_SERVER_URL) { // #298
    win.loadURL(VITE_DEV_SERVER_URL)
    // Open devTool if the app is not packaged
    win.webContents.openDevTools()
  } else {
    win.loadFile(indexHtml)
  }

  // Test actively push message to the Electron-Renderer
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', new Date().toLocaleString())
  })

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

// ---------- Claude 账号凭证 导出 / 导入 ----------
// 登录态主要在 partition 的 cookie 里（claude.ai 的 sessionKey 是 httpOnly，
// 只能在主进程通过 session API 读写）。导出全部账号 cookie 到 JSON，
// 换台电脑导入后即可免登录使用。

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
      const ses = session.fromPartition(`persist:claude-${acc.id}`)
      const cookies = await ses.cookies.get({})
      out.push({ id: acc.id, name: acc.name, cookies })
    }
    const data = JSON.stringify({ app: 'ClaudeHub', version: 1, exportedAt: Date.now(), accounts: out }, null, 2)

    const { canceled, filePath } = await dialog.showSaveDialog({
      title: '导出 Claude 账号凭证',
      defaultPath: `claude-accounts-${new Date().toISOString().slice(0, 10)}.json`,
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
      title: '导入 Claude 账号凭证',
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })
    if (canceled || !filePaths?.[0]) return { ok: false, canceled: true }

    const parsed = JSON.parse(fs.readFileSync(filePaths[0], 'utf-8'))
    const accounts = Array.isArray(parsed?.accounts) ? parsed.accounts : []

    for (const acc of accounts) {
      const ses = session.fromPartition(`persist:claude-${acc.id}`)
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

// ---------- Claude 额度（用量）查询 ----------
// 直接用该账号 partition 的 session 发请求，cookie（含 httpOnly 的 sessionKey
// 与 cf_clearance）自动带上，同机同 IP、UA 一致，无需 webview / Playwright。

function netJson(ses: Electron.Session, url: string): Promise<{ ok: boolean; status?: number; data?: any; error?: string; body?: string }> {
  return new Promise((resolve) => {
    const req = net.request({ method: 'GET', url, session: ses, useSessionCookies: true })
    req.setHeader('anthropic-client-platform', 'web_claude_ai')
    req.setHeader('accept', '*/*')
    let body = ''
    req.on('response', (res) => {
      res.on('data', (chunk) => { body += chunk.toString() })
      res.on('end', () => {
        const status = res.statusCode
        if (status === 200) {
          try {
            resolve({ ok: true, status, data: JSON.parse(body) })
          } catch {
            resolve({ ok: false, status, error: 'parse', body: body.slice(0, 200) })
          }
        } else {
          resolve({ ok: false, status, body: body.slice(0, 200) })
        }
      })
    })
    req.on('error', (e) => resolve({ ok: false, error: e.message }))
    req.end()
  })
}

ipcMain.handle('fetch-usage', async (_, accountId: string) => {
  try {
    const ses = session.fromPartition(`persist:claude-${accountId}`)

    // 1. 拿到该账号的 organization uuid
    const orgs = await netJson(ses, 'https://claude.ai/api/organizations')
    if (!orgs.ok) {
      return { ok: false, stage: 'orgs', status: orgs.status, error: orgs.error || `HTTP ${orgs.status}` }
    }
    const list = Array.isArray(orgs.data) ? orgs.data : []
    const org =
      list.find((o: any) => Array.isArray(o?.capabilities) && o.capabilities.includes('chat')) ||
      list[0]
    const orgId = org?.uuid
    if (!orgId) {
      return { ok: false, stage: 'orgs', error: '未找到 organization（可能未登录）' }
    }

    // 2. 拉用量
    const usage = await netJson(ses, `https://claude.ai/api/organizations/${orgId}/usage`)
    if (!usage.ok) {
      return { ok: false, stage: 'usage', status: usage.status, error: usage.error || `HTTP ${usage.status}` }
    }
    return { ok: true, data: usage.data }
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) }
  }
})

// New window example arg: new windows url
ipcMain.handle('open-win', (_, arg) => {
  const childWindow = new BrowserWindow({
    webPreferences: {
      preload,
      nodeIntegration: true,
      contextIsolation: false,
    },
  })

  if (VITE_DEV_SERVER_URL) {
    childWindow.loadURL(`${VITE_DEV_SERVER_URL}#${arg}`)
  } else {
    childWindow.loadFile(indexHtml, { hash: arg })
  }
})
