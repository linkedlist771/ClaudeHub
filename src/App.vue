<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import WebViewPanel from './components/WebViewPanel.vue'
import LayoutSelector, { type LayoutType } from './components/LayoutSelector.vue'
import PlatformSelector from './components/PlatformSelector.vue'
import ResizableLayout, { type CustomLayoutConfig } from './components/ResizableLayout.vue'
import SessionHistory, { type SessionRecord } from './components/SessionHistory.vue'
import ClaudeDashboard, { type ClaudeAccount } from './components/ClaudeDashboard.vue'
import { getSiteConfigById } from './utils/siteConfigs'
import { InputManager } from './utils/inputManager'

// Claude 站点基础配置（整个应用只用 Claude）
const claudeConfig = getSiteConfigById('claude')!

interface Platform {
  id: string
  name: string
  url: string
  color: string
}

// 把一个账号 id 转成用于渲染的合成 platform；id 唯一 => partition / webview 自动隔离
function accountToPlatform(accountId: string): Platform | null {
  const acc = claudeAccounts.value.find(a => a.id === accountId)
  if (!acc) return null
  return {
    id: `claude-${acc.id}`,
    name: acc.name,
    url: claudeConfig.url,
    color: claudeConfig.color
  }
}

// 布局配置
const currentLayout = ref<LayoutType>('four-grid')

// 自定义布局列表
const customLayouts = ref<CustomLayoutConfig[]>([])

// 当前自定义布局配置（如果选中的是自定义布局）
const currentCustomConfig = computed(() => {
  return customLayouts.value.find(l => l.id === currentLayout.value)
})

// 是否使用自定义布局
const isCustomLayout = computed(() => !!currentCustomConfig.value)

// 每个槽位对应的账号 ID（'' 表示该槽位未分配账号）
const slotAccounts = ref<string[]>([])

// 账号选择器状态
const showPlatformSelector = ref(false)
const editingSlotIndex = ref<number | null>(null)

// 输入框状态
const inputMessage = ref('')
const isInputFocused = ref(false)
const isSending = ref(false)
const sendResults = ref<{ platformId: string; name: string; success: boolean; message: string }[]>([])

// 图片附件状态
interface ImageAttachment {
  id: string
  dataUrl: string
  file: File
}
const attachedImages = ref<ImageAttachment[]>([])

// 最大化状态
const maximizedPanelIndex = ref<number | null>(null)
const isMaximized = computed(() => maximizedPanelIndex.value !== null)

// 会话历史状态
const showSessionHistory = ref(false)
const savedSessions = ref<SessionRecord[]>([])

// 视图模式：dashboard = Claude 账号主页，workspace = 并行工作区（账号窗口并排）
const viewMode = ref<'dashboard' | 'workspace'>('dashboard')

// 是否显示底部统一输入框（隐藏后账号窗口自适应撑满，设置持久化）
const showInputBar = ref(true)

// Claude 多账号
const claudeAccounts = ref<ClaudeAccount[]>([])

// 确保槽位已按当前可用账号填充（空缺补 ''）
function ensureSlotsInitialized() {
  const ids = claudeAccounts.value.map(a => a.id)
  const slots = [...slotAccounts.value]
  for (let i = 0; i < slotCount.value; i++) {
    // 槽位为空或引用了已删除账号时，尝试补一个尚未占用的账号
    if (!slots[i] || !ids.includes(slots[i])) {
      const used = new Set(slots)
      const next = ids.find(id => !used.has(id))
      slots[i] = next || ''
    }
  }
  slotAccounts.value = slots
}

// 进入并行工作区（保持已选账号）
function enterWorkspace() {
  ensureSlotsInitialized()
  maximizedPanelIndex.value = null
  viewMode.value = 'workspace'
}

// 从账号卡片进入：放到槽位 0 并最大化 => 单账号全屏使用
function handleEnterAccount(id: string) {
  ensureSlotsInitialized()
  const slots = [...slotAccounts.value]
  // 若该账号已在某槽位，最大化那个槽位；否则放到槽位 0
  let idx = slots.indexOf(id)
  if (idx === -1) {
    slots[0] = id
    idx = 0
  }
  slotAccounts.value = slots
  viewMode.value = 'workspace'
  nextTick(() => { maximizedPanelIndex.value = idx })
}

function backToDashboard() {
  viewMode.value = 'dashboard'
  maximizedPanelIndex.value = null
}

function handleAddAccount(name: string) {
  claudeAccounts.value.push({ id: `acct-${Date.now()}`, name })
  saveAccounts()
}

// 快速切换某个槽位的账号（来自面板标题栏下拉）
function handleSwitchAccount(slotIndex: number, accountId: string) {
  const newSlots = [...slotAccounts.value]
  const dup = newSlots.indexOf(accountId)
  if (dup !== -1 && dup !== slotIndex) {
    newSlots[dup] = newSlots[slotIndex] || ''
  }
  newSlots[slotIndex] = accountId
  slotAccounts.value = newSlots
}

// 导出所有账号凭证到 JSON 文件
async function handleExportAccounts() {
  if (claudeAccounts.value.length === 0) {
    alert('还没有账号可导出')
    return
  }
  const ipc = (window as any).ipcRenderer
  if (!ipc?.invoke) {
    alert('当前环境不支持导出')
    return
  }
  const payload = claudeAccounts.value.map(a => ({ id: a.id, name: a.name }))
  const res = await ipc.invoke('export-accounts', payload)
  if (res?.ok) {
    alert(`已导出 ${res.count} 个账号凭证到：\n${res.filePath}\n\n⚠️ 该文件含登录凭证，等同于账号密码，请妥善保管、勿外传。`)
  } else if (!res?.canceled) {
    alert('导出失败：' + (res?.error || '未知错误'))
  }
}

// 从 JSON 文件导入账号凭证
async function handleImportAccounts() {
  const ipc = (window as any).ipcRenderer
  if (!ipc?.invoke) {
    alert('当前环境不支持导入')
    return
  }
  const res = await ipc.invoke('import-accounts')
  if (res?.ok) {
    // 合并账号列表（cookie 已由主进程写入对应分区）
    for (const acc of res.accounts || []) {
      const exist = claudeAccounts.value.find(a => a.id === acc.id)
      if (exist) {
        exist.name = acc.name
      } else {
        claudeAccounts.value.push({ id: acc.id, name: acc.name })
      }
    }
    saveAccounts()
    alert(`已导入 ${res.count} 个账号，点进去即可直接使用（无需重新登录）。`)
  } else if (!res?.canceled) {
    alert('导入失败：' + (res?.error || '未知错误'))
  }
}

// ---------- 额度刷新 ----------
// 主进程直接请求会被 Cloudflare 403，所以在「各账号已登录的隐藏 webview」内
// executeJavaScript 发 fetch —— 真浏览器上下文、已过 Cloudflare、cookie 自动带上。
const USAGE_SCRIPT = `
  (async function() {
    try {
      const h = { 'anthropic-client-platform': 'web_claude_ai', accept: '*/*' };
      const orgsRes = await fetch('/api/organizations', { credentials: 'include', headers: h });
      if (!orgsRes.ok) return { ok: false, stage: 'orgs', status: orgsRes.status };
      const orgs = await orgsRes.json();
      const list = Array.isArray(orgs) ? orgs : [];
      const org = list.find(o => Array.isArray(o.capabilities) && o.capabilities.includes('chat')) || list[0];
      const orgId = org && org.uuid;
      if (!orgId) return { ok: false, stage: 'orgs', error: '未找到组织（可能未登录）' };
      const usageRes = await fetch('/api/organizations/' + orgId + '/usage', { credentials: 'include', headers: h });
      if (!usageRes.ok) return { ok: false, stage: 'usage', status: usageRes.status };
      const data = await usageRes.json();
      return { ok: true, data: data };
    } catch (e) {
      return { ok: false, error: String((e && e.message) || e) };
    }
  })()
`

const usageReady: Record<string, boolean> = {}
const wiredProbes = new Set<string>()

function usageWebviewId(accountId: string) {
  return `usage-webview-${accountId}`
}

// 给隐藏 webview 绑定 dom-ready（就绪后立即取一次）
function setupUsageWebviews() {
  for (const acc of claudeAccounts.value) {
    if (wiredProbes.has(acc.id)) continue
    const el = document.getElementById(usageWebviewId(acc.id)) as any
    if (!el) continue
    wiredProbes.add(acc.id)
    el.addEventListener('dom-ready', () => {
      usageReady[acc.id] = true
      refreshUsage(acc.id)
    })
    el.addEventListener('destroyed', () => {
      usageReady[acc.id] = false
      wiredProbes.delete(acc.id)
    })
  }
}

function applyUsage(acc: ClaudeAccount, data: any) {
  const five = data?.five_hour
  const seven = data?.seven_day
  const fivePct = five?.utilization
  const sevenPct = seven?.utilization
  acc.usage = {
    fiveHourPercent: fivePct,
    fiveHourResetsAt: five?.resets_at,
    sevenDayPercent: sevenPct,
    sevenDayResetsAt: seven?.resets_at,
    limited: (fivePct ?? 0) >= 100 || (sevenPct ?? 0) >= 100,
    loading: false,
    error: undefined,
    updatedAt: Date.now()
  }
}

// 刷新单个账号额度
async function refreshUsage(accountId: string) {
  const acc = claudeAccounts.value.find(a => a.id === accountId)
  if (!acc) return
  const el = document.getElementById(usageWebviewId(accountId)) as any

  if (!el || !usageReady[accountId] || !el.executeJavaScript) {
    // webview 尚未就绪，标记加载中，等 dom-ready 再取
    acc.usage = { ...(acc.usage || {}), loading: true }
    return
  }

  acc.usage = { ...(acc.usage || {}), loading: true, error: undefined }
  try {
    const res = await el.executeJavaScript(USAGE_SCRIPT)
    if (res?.ok && res.data) {
      applyUsage(acc, res.data)
    } else {
      const reason = res?.error || `获取失败${res?.status ? ' (' + res.status + ')' : ''}`
      acc.usage = { ...(acc.usage || {}), loading: false, error: reason }
    }
  } catch (e: any) {
    acc.usage = { ...(acc.usage || {}), loading: false, error: e?.message || '获取失败' }
  }
  saveAccounts()
}

// 刷新所有账号额度（并发）
async function refreshAllUsage() {
  setupUsageWebviews()
  await Promise.all(claudeAccounts.value.map(a => refreshUsage(a.id)))
}

// 每 5 秒自动刷新（仅在账号主页时运行）
const USAGE_REFRESH_MS = 5000
let usageTimer: ReturnType<typeof setInterval> | null = null

function startUsageAutoRefresh() {
  if (usageTimer) return
  nextTick(setupUsageWebviews)
  usageTimer = setInterval(() => {
    if (viewMode.value === 'dashboard') {
      setupUsageWebviews()
      refreshAllUsage()
    }
  }, USAGE_REFRESH_MS)
}

function stopUsageAutoRefresh() {
  if (usageTimer) {
    clearInterval(usageTimer)
    usageTimer = null
  }
}

// 进入/离开主页时开关自动刷新
watch(viewMode, (mode) => {
  if (mode === 'dashboard') nextTick(startUsageAutoRefresh)
  else stopUsageAutoRefresh()
}, { immediate: true })

onUnmounted(stopUsageAutoRefresh)

function handleRenameAccount(id: string, name: string) {
  const acct = claudeAccounts.value.find(a => a.id === id)
  if (acct) {
    acct.name = name
    saveAccounts()
  }
}

function handleDeleteAccount(id: string) {
  const index = claudeAccounts.value.findIndex(a => a.id === id)
  if (index !== -1) {
    claudeAccounts.value.splice(index, 1)
    saveAccounts()
  }
}

function saveAccounts() {
  localStorage.setItem('parallelchat-claude-accounts', JSON.stringify(claudeAccounts.value))
}

function loadAccounts() {
  try {
    const saved = localStorage.getItem('parallelchat-claude-accounts')
    if (saved) {
      const parsed = JSON.parse(saved)
      if (Array.isArray(parsed)) claudeAccounts.value = parsed
    }
  } catch (e) {
    console.error('Failed to load claude accounts:', e)
  }
}

// 根据布局类型计算需要的槽位数量
const slotCount = computed(() => {
  if (currentCustomConfig.value) {
    return currentCustomConfig.value.panels
  }
  
  switch (currentLayout.value) {
    case 'two-horizontal':
    case 'two-vertical':
      return 2
    case 'three-top2-bottom1':
    case 'three-top1-bottom2':
    case 'three-vertical':
      return 3
    case 'four-grid':
      return 4
    default:
      return 4
  }
})

// 当前显示的账号面板列表（null = 未分配账号的空槽位）
const visiblePlatforms = computed<(Platform | null)[]>(() => {
  const slots: (Platform | null)[] = []
  for (let i = 0; i < slotCount.value; i++) {
    slots.push(accountToPlatform(slotAccounts.value[i] || ''))
  }
  return slots
})

// 账号选择器用的列表（复用 PlatformSelector，把账号映射成 platform 形状）
const accountOptions = computed<Platform[]>(() =>
  claudeAccounts.value.map(a => ({
    id: a.id,
    name: a.name,
    url: claudeConfig.url,
    color: claudeConfig.color
  }))
)

// 布局的 CSS 类名（仅用于预设布局）
const layoutClass = computed(() => {
  if (isCustomLayout.value) return ''
  return `layout-${currentLayout.value}`
})

// 加载保存的配置
onMounted(() => {
  loadConfig()
  loadSessions()
  loadAccounts()
})

// 监听配置变化并保存
watch([currentLayout, slotAccounts, customLayouts, showInputBar], () => {
  saveConfig()
}, { deep: true })

// 处理布局切换
function handleLayoutChange(layout: LayoutType) {
  currentLayout.value = layout
}

// 处理添加自定义布局
function handleAddCustomLayout() {
  const id = `custom-${Date.now()}`
  const newLayout: CustomLayoutConfig = {
    id,
    name: `自定义 ${customLayouts.value.length + 1}`,
    panels: 4,
    direction: 'grid',
    sizes: [
      { width: 50, height: 50 },
      { width: 50, height: 50 },
      { width: 50, height: 50 },
      { width: 50, height: 50 }
    ]
  }
  customLayouts.value.push(newLayout)
  currentLayout.value = id
}

// 处理删除自定义布局
function handleDeleteCustomLayout(id: string) {
  const index = customLayouts.value.findIndex(l => l.id === id)
  if (index !== -1) {
    customLayouts.value.splice(index, 1)
    // 如果删除的是当前布局，切换到默认
    if (currentLayout.value === id) {
      currentLayout.value = 'four-grid'
    }
  }
}

// 处理自定义布局更新
function handleCustomConfigUpdate(config: CustomLayoutConfig) {
  const index = customLayouts.value.findIndex(l => l.id === config.id)
  if (index !== -1) {
    customLayouts.value[index] = config
  }
}

// 处理切换账号按钮点击
function handleChangePlatform(slotIndex: number) {
  editingSlotIndex.value = slotIndex
  showPlatformSelector.value = true
}

// 处理面板最大化切换
function handleToggleMaximize(slotIndex: number) {
  if (maximizedPanelIndex.value === slotIndex) {
    // 已经最大化，则还原
    maximizedPanelIndex.value = null
  } else {
    // 最大化指定面板
    maximizedPanelIndex.value = slotIndex
  }
}

// 处理账号选择（platform.id 即账号 id）
function handlePlatformSelect(platform: { id: string; name: string; url: string; color: string }) {
  if (editingSlotIndex.value !== null) {
    const newSlots = [...slotAccounts.value]
    // 同一账号已在别的槽位则交换，避免两个槽位指向同一账号
    const dup = newSlots.indexOf(platform.id)
    if (dup !== -1 && dup !== editingSlotIndex.value) {
      newSlots[dup] = newSlots[editingSlotIndex.value] || ''
    }
    newSlots[editingSlotIndex.value] = platform.id
    slotAccounts.value = newSlots
  }
  showPlatformSelector.value = false
  editingSlotIndex.value = null
}

// 关闭账号选择器
function closePlatformSelector() {
  showPlatformSelector.value = false
  editingSlotIndex.value = null
}

// 保存配置到 localStorage
function saveConfig() {
  const config = {
    layout: currentLayout.value,
    slots: slotAccounts.value,
    customLayouts: customLayouts.value,
    showInputBar: showInputBar.value
  }
  localStorage.setItem('parallelchat-config', JSON.stringify(config))
}

// 从 localStorage 加载配置
function loadConfig() {
  try {
    const saved = localStorage.getItem('parallelchat-config')
    if (saved) {
      const config = JSON.parse(saved)
      if (config.customLayouts && Array.isArray(config.customLayouts)) {
        customLayouts.value = config.customLayouts
      }
      if (config.layout) {
        currentLayout.value = config.layout
      }
      if (config.slots && Array.isArray(config.slots)) {
        slotAccounts.value = config.slots
      }
      if (typeof config.showInputBar === 'boolean') {
        showInputBar.value = config.showInputBar
      }
    }
  } catch (e) {
    console.error('Failed to load config:', e)
  }
}

// 加载会话历史
function loadSessions() {
  try {
    const saved = localStorage.getItem('parallelchat-sessions')
    if (saved) {
      savedSessions.value = JSON.parse(saved)
    }
  } catch (e) {
    console.error('Failed to load sessions:', e)
  }
}

// 保存会话历史
function saveSessions() {
  localStorage.setItem('parallelchat-sessions', JSON.stringify(savedSessions.value))
}

// 获取所有 WebView 的当前 URL
async function getCurrentUrls(): Promise<string[]> {
  const urls: string[] = []

  for (let i = 0; i < visiblePlatforms.value.length; i++) {
    const platform = visiblePlatforms.value[i]
    if (!platform) {
      urls.push('')
      continue
    }
    const webviewId = `webview-${platform.id}-${i}`
    const webview = document.getElementById(webviewId) as any

    if (webview && webview.getURL) {
      try {
        urls.push(webview.getURL())
      } catch {
        urls.push('')
      }
    } else {
      urls.push('')
    }
  }

  return urls
}

// 保存当前会话
async function handleSaveSession() {
  const urls = await getCurrentUrls()
  const platformNames = visiblePlatforms.value.map(p => p?.name || '空')

  const session: SessionRecord = {
    id: `session-${Date.now()}`,
    name: `会话 ${savedSessions.value.length + 1}`,
    timestamp: Date.now(),
    layout: currentLayout.value,
    platforms: platformNames,
    urls
  }
  
  savedSessions.value.unshift(session)
  saveSessions()
}

// 恢复会话
async function handleRestoreSession(session: SessionRecord) {
  // 先关闭面板
  showSessionHistory.value = false
  
  // 恢复布局
  currentLayout.value = session.layout as LayoutType
  
  // 等待 DOM 更新
  await nextTick()
  
  // 恢复每个 WebView 的 URL
  for (let i = 0; i < session.urls.length && i < visiblePlatforms.value.length; i++) {
    const url = session.urls[i]
    const platform = visiblePlatforms.value[i]
    if (url && platform) {
      const webviewId = `webview-${platform.id}-${i}`
      const webview = document.getElementById(webviewId) as any
      
      if (webview && webview.loadURL) {
        try {
          webview.loadURL(url)
        } catch (e) {
          console.error('Failed to restore URL:', e)
        }
      }
    }
  }
}

// 删除会话
function handleDeleteSession(id: string) {
  const index = savedSessions.value.findIndex(s => s.id === id)
  if (index !== -1) {
    savedSessions.value.splice(index, 1)
    saveSessions()
  }
}

// 重命名会话
function handleRenameSession(id: string, name: string) {
  const session = savedSessions.value.find(s => s.id === id)
  if (session) {
    session.name = name
    saveSessions()
  }
}

// 发送消息到所有可见的 WebView
async function handleSend() {
  const message = inputMessage.value.trim()
  const hasImages = attachedImages.value.length > 0
  
  if ((!message && !hasImages) || isSending.value) return
  
  isSending.value = true
  sendResults.value = []

  console.log('Sending to accounts with images:', hasImages)

  // 图片已经在粘贴时同步了，现在只需要输入文字并发送（所有可见账号都是 Claude）
  const siteConfig = claudeConfig
  const promises = visiblePlatforms.value.map(async (platform, index) => {
    if (!platform) return null
    const platformId = platform.id
    const name = platform.name

    const webviewId = `webview-${platformId}-${index}`
    const webview = document.getElementById(webviewId) as any

    if (!webview) {
      return { platformId, name, success: false, message: 'WebView未找到' }
    }

    try {
      const inputManager = new InputManager(siteConfig)
      
      // 如果有文字，先输入文字（追加到已有内容后面）
      if (message) {
        const appendTextScript = generateAppendTextScript(message, siteConfig.textareaSelectors)
        await webview.executeJavaScript(appendTextScript)
        await new Promise(r => setTimeout(r, 100))
      }
      
      // 点击发送按钮
      await new Promise(r => setTimeout(r, 100))
      const sendScript = inputManager.getClickSendButtonScript()
      const sendResult = await webview.executeJavaScript(sendScript)
      
      return {
        platformId,
        name,
        success: sendResult?.success ?? false,
        message: sendResult?.message || sendResult?.error || '已发送'
      }
    } catch (error: any) {
      console.error(`${platformId} error:`, error)
      return { platformId, name, success: false, message: error.message || '执行失败' }
    }
  })
  
  const results = (await Promise.all(promises)).filter(
    (r): r is { platformId: string; name: string; success: boolean; message: string } => r !== null
  )
  sendResults.value = results

  // 如果有成功的，清空输入框和图片
  const hasSuccess = results.some(r => r.success)
  if (hasSuccess) {
    inputMessage.value = ''
    attachedImages.value = []
  }
  
  // 3秒后清除结果提示
  setTimeout(() => {
    sendResults.value = []
  }, 3000)
  
  isSending.value = false
}

// 生成追加文字的脚本（不清空已有内容）
function generateAppendTextScript(text: string, textareaSelectors: string[]): string {
  const selectors = JSON.stringify(textareaSelectors)
  const escapedText = JSON.stringify(text)
  
  return `
    (function() {
      const text = ${escapedText};
      const selectors = ${selectors};
      
      function isElementVisible(element) {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none' && 
               style.visibility !== 'hidden' && 
               style.opacity !== '0' &&
               rect.width > 0 && 
               rect.height > 0;
      }
      
      function isValidTextInput(element) {
        if (!element) return false;
        const isEditable = element.contentEditable === 'true' || 
                          element.tagName.toLowerCase() === 'textarea';
        const isNotReadonly = !element.readOnly && !element.disabled;
        return isEditable && isNotReadonly;
      }
      
      function isInChatHistory(element) {
        let parent = element.parentElement;
        while (parent) {
          const className = parent.className || '';
          const role = parent.getAttribute('role') || '';
          if (className.includes('conversation') || className.includes('message') ||
              role === 'article' || role === 'group') {
            return true;
          }
          parent = parent.parentElement;
        }
        return false;
      }
      
      function findTextarea() {
        for (const selector of selectors) {
          try {
            const elements = document.querySelectorAll(selector);
            for (const element of elements) {
              if (isValidTextInput(element) && isElementVisible(element) && !isInChatHistory(element)) {
                return element;
              }
            }
          } catch (e) {}
        }
        return null;
      }
      
      function safeDispatchEvent(element, eventType) {
        try {
          const event = new Event(eventType, { bubbles: true, cancelable: true });
          element.dispatchEvent(event);
        } catch (e) {}
      }
      
      const textarea = findTextarea();
      if (!textarea) {
        return { success: false, error: '未找到输入框' };
      }
      
      textarea.focus();
      
      // 追加文字（不清空）
      if (textarea.tagName.toLowerCase() === 'textarea') {
        const currentValue = textarea.value || '';
        textarea.value = currentValue + (currentValue ? ' ' : '') + text;
        textarea.selectionStart = textarea.selectionEnd = textarea.value.length;
      } else {
        const currentText = textarea.textContent || '';
        textarea.textContent = currentText + (currentText ? ' ' : '') + text;
      }
      
      safeDispatchEvent(textarea, 'input');
      safeDispatchEvent(textarea, 'change');
      
      return { success: true, message: '已追加文字' };
    })()
  `
}

// 生成在 WebView 中粘贴图片的脚本
function generatePasteImageScript(imageDataUrl: string, textareaSelectors: string[], platformId: string): string {
  const selectors = JSON.stringify(textareaSelectors)
  const escapedDataUrl = JSON.stringify(imageDataUrl)
  
  return `
    (async function() {
      const selectors = ${selectors};
      const imageDataUrl = ${escapedDataUrl};
      const platformId = '${platformId}';
      
      function isElementVisible(element) {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none' && 
               style.visibility !== 'hidden' && 
               style.opacity !== '0' &&
               rect.width > 0 && 
               rect.height > 0;
      }
      
      function isValidTextInput(element) {
        if (!element) return false;
        const isEditable = element.contentEditable === 'true' || 
                          element.tagName.toLowerCase() === 'textarea';
        const isNotReadonly = !element.readOnly && !element.disabled;
        return isEditable && isNotReadonly;
      }
      
      function isInChatHistory(element) {
        let parent = element.parentElement;
        while (parent) {
          const className = parent.className || '';
          const role = parent.getAttribute('role') || '';
          if (className.includes('conversation') || 
              className.includes('message') ||
              role === 'article' ||
              role === 'group') {
            return true;
          }
          parent = parent.parentElement;
        }
        return false;
      }
      
      function findTextarea() {
        for (const selector of selectors) {
          try {
            const elements = document.querySelectorAll(selector);
            for (const element of elements) {
              if (isValidTextInput(element) && isElementVisible(element) && !isInChatHistory(element)) {
                return element;
              }
            }
          } catch (e) {}
        }
        return null;
      }
      
      // 查找文件上传 input
      function findFileInput() {
        // 查找隐藏的 file input
        const fileInputs = document.querySelectorAll('input[type="file"]');
        for (const input of fileInputs) {
          if (input.accept && (input.accept.includes('image') || input.accept.includes('*'))) {
            return input;
          }
        }
        // 如果没找到带 accept 的，返回第一个
        return fileInputs[0] || null;
      }
      
      // 将 dataUrl 转换为 Blob
      async function dataUrlToBlob(dataUrl) {
        const response = await fetch(dataUrl);
        return await response.blob();
      }
      
      // 方法1: 通过 ClipboardEvent 粘贴（Gemini 等平台）
      async function pasteViaClipboardEvent(textarea, blob, file) {
        textarea.focus();
        await new Promise(r => setTimeout(r, 50));
        
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        
        const pasteEvent = new ClipboardEvent('paste', {
          bubbles: true,
          cancelable: true,
          clipboardData: dataTransfer
        });
        
        textarea.dispatchEvent(pasteEvent);
        
        // 也在 document 上派发一次
        if (!pasteEvent.defaultPrevented) {
          document.dispatchEvent(new ClipboardEvent('paste', {
            bubbles: true,
            cancelable: true,
            clipboardData: dataTransfer
          }));
        }
        
        return { success: true, message: '已通过粘贴事件发送图片' };
      }
      
      // 方法2: 通过 drop 事件（一些平台支持拖拽）
      async function pasteViaDrop(textarea, blob, file) {
        textarea.focus();
        await new Promise(r => setTimeout(r, 50));
        
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        
        // 模拟拖拽事件序列
        const dragEnterEvent = new DragEvent('dragenter', {
          bubbles: true,
          cancelable: true,
          dataTransfer: dataTransfer
        });
        
        const dragOverEvent = new DragEvent('dragover', {
          bubbles: true,
          cancelable: true,
          dataTransfer: dataTransfer
        });
        
        const dropEvent = new DragEvent('drop', {
          bubbles: true,
          cancelable: true,
          dataTransfer: dataTransfer
        });
        
        textarea.dispatchEvent(dragEnterEvent);
        textarea.dispatchEvent(dragOverEvent);
        textarea.dispatchEvent(dropEvent);
        
        return { success: true, message: '已通过拖拽事件发送图片' };
      }
      
      // 方法3: 通过 file input（ChatGPT、Claude 等平台）
      async function pasteViaFileInput(file) {
        const fileInput = findFileInput();
        if (!fileInput) {
          return { success: false, error: '未找到文件上传入口' };
        }
        
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        fileInput.files = dataTransfer.files;
        
        // 触发 change 事件
        const changeEvent = new Event('change', { bubbles: true });
        fileInput.dispatchEvent(changeEvent);
        
        // 也触发 input 事件
        const inputEvent = new Event('input', { bubbles: true });
        fileInput.dispatchEvent(inputEvent);
        
        return { success: true, message: '已通过文件上传发送图片' };
      }
      
      // 方法4: 点击上传按钮后注入文件（备用方案）
      async function findAndClickUploadButton() {
        // 常见的上传按钮选择器
        const uploadSelectors = [
          'button[aria-label*="Attach"]',
          'button[aria-label*="attach"]',
          'button[aria-label*="Upload"]',
          'button[aria-label*="upload"]',
          'button[aria-label*="Image"]',
          'button[aria-label*="image"]',
          'button[aria-label*="File"]',
          'button[aria-label*="file"]',
          'button[aria-label*="添加"]',
          'button[aria-label*="上传"]',
          'button[data-testid*="attach"]',
          'button[data-testid*="upload"]',
          '[data-testid="attachment-button"]',
          '.upload-button',
          '.attach-button'
        ];
        
        for (const selector of uploadSelectors) {
          try {
            const btn = document.querySelector(selector);
            if (btn && btn.offsetParent !== null) {
              return btn;
            }
          } catch (e) {}
        }
        
        // 查找包含上传图标的按钮
        const buttons = document.querySelectorAll('button');
        for (const btn of buttons) {
          if (btn.offsetParent !== null) {
            const svg = btn.querySelector('svg');
            if (svg) {
              const svgContent = svg.innerHTML.toLowerCase();
              if (svgContent.includes('path') && 
                  (svgContent.includes('attach') || svgContent.includes('clip') || svgContent.includes('upload'))) {
                return btn;
              }
            }
          }
        }
        
        return null;
      }
      
      try {
        const textarea = findTextarea();
        if (!textarea) {
          return { success: false, error: '未找到输入框' };
        }
        
        // 转换图片数据
        const blob = await dataUrlToBlob(imageDataUrl);
        const file = new File([blob], 'pasted-image.png', { type: blob.type || 'image/png' });
        
        let result;
        
        // 根据不同平台选择不同的策略
        if (platformId === 'chatgpt') {
          // ChatGPT: 优先尝试 file input，然后是 paste 事件
          result = await pasteViaFileInput(file);
          if (!result.success) {
            result = await pasteViaClipboardEvent(textarea, blob, file);
          }
          if (!result.success) {
            result = await pasteViaDrop(textarea, blob, file);
          }
        } else if (platformId === 'claude') {
          // Claude: 优先尝试 file input，然后是 drop 事件
          result = await pasteViaFileInput(file);
          if (!result.success) {
            result = await pasteViaDrop(textarea, blob, file);
          }
          if (!result.success) {
            result = await pasteViaClipboardEvent(textarea, blob, file);
          }
        } else if (platformId === 'gemini') {
          // Gemini: 优先使用 paste 事件（已经工作）
          result = await pasteViaClipboardEvent(textarea, blob, file);
        } else {
          // 其他平台: 依次尝试所有方法
          result = await pasteViaClipboardEvent(textarea, blob, file);
          if (!result.success) {
            result = await pasteViaFileInput(file);
          }
          if (!result.success) {
            result = await pasteViaDrop(textarea, blob, file);
          }
        }
        
        return result;
      } catch (e) {
        return { success: false, error: e.message || '粘贴图片失败' };
      }
    })()
  `
}

// 处理键盘事件
function handleKeyDown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    handleSend()
  }
}

// 处理粘贴事件 - 检测图片
function handlePaste(event: ClipboardEvent) {
  const items = event.clipboardData?.items
  if (!items) return

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (item.type.startsWith('image/')) {
      event.preventDefault()
      const file = item.getAsFile()
      if (file) {
        addImageAttachment(file)
      }
      break
    }
  }
}

// 添加图片附件
function addImageAttachment(file: File) {
  const reader = new FileReader()
  reader.onload = async (e) => {
    const dataUrl = e.target?.result as string
    if (dataUrl) {
      const imgId = `img-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      attachedImages.value.push({
        id: imgId,
        dataUrl,
        file
      })
      
      // 立即同步粘贴图片到所有平台
      await syncImageToAllPlatforms(dataUrl)
    }
  }
  reader.readAsDataURL(file)
}

// 同步图片到所有可见账号（均为 Claude）
async function syncImageToAllPlatforms(imageDataUrl: string) {
  const siteConfig = claudeConfig

  // 并行粘贴到所有可见账号
  const promises = visiblePlatforms.value.map(async (platform, index) => {
    if (!platform) return

    const webviewId = `webview-${platform.id}-${index}`
    const webview = document.getElementById(webviewId) as any

    if (!webview) return

    try {
      const inputManager = new InputManager(siteConfig)

      // 先聚焦输入框
      const focusScript = inputManager.getSimulatePasteScript()
      await webview.executeJavaScript(focusScript)
      await new Promise(r => setTimeout(r, 100))

      // 粘贴图片（统一走 claude 策略）
      const pasteImageScript = generatePasteImageScript(imageDataUrl, siteConfig.textareaSelectors, 'claude')
      const result = await webview.executeJavaScript(pasteImageScript)
      console.log(`${platform.id} paste result:`, result)
    } catch (error) {
      console.error(`${platform.id} paste error:`, error)
    }
  })

  await Promise.all(promises)
}

// 移除图片附件
function removeImageAttachment(id: string) {
  const index = attachedImages.value.findIndex(img => img.id === id)
  if (index !== -1) {
    attachedImages.value.splice(index, 1)
  }
}

// 检查是否可以发送（有文字或图片）
const canSend = computed(() => {
  return (inputMessage.value.trim() || attachedImages.value.length > 0) && !isSending.value
})

// 计算自定义布局的面板样式
function getCustomPanelStyle(index: number) {
  if (!currentCustomConfig.value) return {}
  
  const config = currentCustomConfig.value
  const size = config.sizes[index]
  
  if (!size) return {}
  
  if (config.direction === 'horizontal') {
    return { flex: `0 0 ${size.width}%` }
  } else if (config.direction === 'vertical') {
    return { flex: `0 0 ${size.height}%` }
  } else {
    // grid 布局样式在 ResizableLayout 组件中处理
    return {}
  }
}
</script>

<template>
  <div class="app-container">
    <!-- 会话历史面板 -->
    <SessionHistory
      :visible="showSessionHistory"
      :sessions="savedSessions"
      @close="showSessionHistory = false"
      @save-current="handleSaveSession"
      @restore="handleRestoreSession"
      @delete="handleDeleteSession"
      @rename="handleRenameSession"
    />

    <!-- 顶部工具栏（仅并行工作区显示） -->
    <div v-if="viewMode === 'workspace' && !isMaximized" class="toolbar">
      <div class="toolbar-left">
        <button class="claude-accounts-btn" @click="backToDashboard" title="返回账号面板">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 18l-6-6 6-6"/></svg>
          账号面板
        </button>
        <!-- 会话历史按钮 -->
        <button
          class="history-btn"
          :class="{ active: showSessionHistory }"
          @click="showSessionHistory = !showSessionHistory"
          title="会话历史"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="7" height="7" rx="1"/>
            <rect x="14" y="3" width="7" height="7" rx="1"/>
            <rect x="3" y="14" width="7" height="7" rx="1"/>
            <rect x="14" y="14" width="7" height="7" rx="1"/>
          </svg>
        </button>
        <span class="app-title">并行工作区</span>
      </div>
      <div class="toolbar-right">
        <button
          class="input-toggle-btn"
          :class="{ active: !showInputBar }"
          @click="showInputBar = !showInputBar"
          :title="showInputBar ? '隐藏输入框（窗口撑满）' : '显示输入框'"
        >
          {{ showInputBar ? '隐藏输入框' : '显示输入框' }}
        </button>
        <LayoutSelector
          :current-layout="currentLayout"
          :custom-layouts="customLayouts"
          @select="handleLayoutChange"
          @add-custom="handleAddCustomLayout"
          @delete-custom="handleDeleteCustomLayout"
        />
      </div>
    </div>

    <!-- Claude 账号主页 -->
    <ClaudeDashboard
      v-if="viewMode === 'dashboard'"
      :accounts="claudeAccounts"
      @enter="handleEnterAccount"
      @enter-workspace="enterWorkspace"
      @add="handleAddAccount"
      @rename="handleRenameAccount"
      @delete="handleDeleteAccount"
      @export="handleExportAccounts"
      @import="handleImportAccounts"
      @refresh="refreshUsage"
      @refresh-all="refreshAllUsage"
    />

    <!-- 额度探测用的隐藏 webview（离屏，每账号一个；在真浏览器上下文内 fetch 用量接口） -->
    <div v-if="viewMode === 'dashboard'" class="usage-probes" aria-hidden="true">
      <webview
        v-for="acc in claudeAccounts"
        :key="`probe-${acc.id}`"
        :id="`usage-webview-${acc.id}`"
        src="https://claude.ai/"
        :partition="`persist:claude-${acc.id}`"
        class="usage-probe"
      ></webview>
    </div>

    <!-- 最大化面板 -->
    <div v-else-if="isMaximized && maximizedPanelIndex !== null && visiblePlatforms[maximizedPanelIndex]" class="maximized-container">
      <WebViewPanel
        :platform="visiblePlatforms[maximizedPanelIndex]!"
        :slot-index="maximizedPanelIndex"
        :is-maximized="true"
        :input-bar-visible="showInputBar"
        :accounts="claudeAccounts"
        :current-account-id="slotAccounts[maximizedPanelIndex]"
        @change-platform="handleChangePlatform"
        @toggle-maximize="handleToggleMaximize"
        @toggle-input="showInputBar = !showInputBar"
        @back-dashboard="backToDashboard"
        @switch-account="(id) => handleSwitchAccount(maximizedPanelIndex!, id)"
      />
    </div>

    <!-- 自定义布局容器 -->
    <ResizableLayout
      v-else-if="isCustomLayout && currentCustomConfig"
      :config="currentCustomConfig"
      @update:config="handleCustomConfigUpdate"
      class="resizable-container"
    >
      <div
        v-for="(platform, index) in visiblePlatforms"
        :key="`slot-${index}`"
        class="grid-item"
      >
        <WebViewPanel
          :platform="platform"
          :slot-index="index"
          @change-platform="handleChangePlatform"
          @toggle-maximize="handleToggleMaximize"
        />
      </div>
    </ResizableLayout>

    <!-- 预设布局容器 -->
    <div v-else :class="['grid-container', layoutClass]">
      <div
        v-for="(platform, index) in visiblePlatforms"
        :key="`slot-${index}`"
        class="grid-item"
      >
        <WebViewPanel
          :platform="platform"
          :slot-index="index"
          @change-platform="handleChangePlatform"
          @toggle-maximize="handleToggleMaximize"
        />
      </div>
    </div>

    <!-- 账号选择弹窗 -->
    <PlatformSelector
      :platforms="accountOptions"
      :visible="showPlatformSelector"
      :current-platform-id="editingSlotIndex !== null ? slotAccounts[editingSlotIndex] : undefined"
      @select="handlePlatformSelect"
      @close="closePlatformSelector"
    />

    <!-- 底部输入框 -->
    <div v-if="viewMode === 'workspace' && showInputBar" class="input-container">
      <!-- 发送结果提示 -->
      <div v-if="sendResults.length > 0" class="send-results">
        <div 
          v-for="result in sendResults" 
          :key="result.platformId"
          :class="['result-item', { success: result.success, error: !result.success }]"
        >
          <span class="result-platform">{{ result.name }}</span>
          <span class="result-message">{{ result.message }}</span>
        </div>
      </div>

      <!-- 图片预览区 -->
      <div v-if="attachedImages.length > 0" class="image-preview-container">
        <div 
          v-for="img in attachedImages" 
          :key="img.id" 
          class="image-preview-item"
        >
          <img :src="img.dataUrl" alt="附件图片" class="preview-image" />
          <button 
            class="remove-image-btn" 
            @click="removeImageAttachment(img.id)"
            title="移除图片"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>
      
      <div :class="['input-wrapper', { focused: isInputFocused, sending: isSending }]">
        <textarea
          v-model="inputMessage"
          class="message-input"
          placeholder="输入消息，可粘贴图片，同时发送给所有可见的 Claude 账号..."
          rows="1"
          :disabled="isSending"
          @focus="isInputFocused = true"
          @blur="isInputFocused = false"
          @keydown="handleKeyDown"
          @paste="handlePaste"
        ></textarea>
        <button 
          :class="['send-btn', { active: canSend }]"
          :disabled="!canSend"
          @click="handleSend"
        >
          <svg v-if="!isSending" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 2L11 13"/>
            <path d="M22 2L15 22L11 13L2 9L22 2Z"/>
          </svg>
          <div v-else class="loading-spinner"></div>
        </button>
      </div>
      <div class="input-hint">
        按 Enter 发送，Shift + Enter 换行 | 支持粘贴图片 (Ctrl/Cmd + V)
      </div>
    </div>
  </div>
</template>

<style scoped>
.app-container {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background-color: var(--bg);
  overflow: hidden;
}

/* 额度探测隐藏 webview：离屏但保持渲染/加载（display:none 会导致不加载） */
.usage-probes {
  position: absolute;
  left: -10000px;
  top: 0;
  width: 500px;
  height: 500px;
  overflow: hidden;
  opacity: 0;
  pointer-events: none;
}

.usage-probe {
  width: 500px;
  height: 500px;
  border: none;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 18px;
  background-color: var(--surface);
  border-bottom: 1px solid var(--line);
  height: 52px;
  flex-shrink: 0;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.input-toggle-btn {
  padding: 7px 13px;
  border: 1px solid var(--line-strong);
  border-radius: 9px;
  background-color: var(--surface);
  color: var(--ink-2);
  font-family: var(--font-sans);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.18s;
  white-space: nowrap;
}

.input-toggle-btn:hover {
  background-color: var(--surface-alt);
  color: var(--ink);
}

.input-toggle-btn.active {
  background-color: var(--clay-tint);
  border-color: var(--clay-soft);
  color: var(--clay-deep);
}

.history-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 1px solid var(--line-strong);
  border-radius: 9px;
  background-color: var(--surface);
  color: var(--muted);
  cursor: pointer;
  transition: all 0.18s;
}

.history-btn:hover {
  background-color: var(--surface-alt);
  color: var(--ink);
}

.history-btn.active {
  background-color: var(--clay);
  border-color: var(--clay);
  color: #FBF7F2;
}

.app-title {
  font-family: var(--font-serif);
  font-size: 18px;
  font-weight: 500;
  letter-spacing: -0.01em;
  color: var(--ink);
}

.claude-accounts-btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 7px 14px;
  border: 1px solid var(--line-strong);
  border-radius: 9px;
  background-color: var(--surface);
  color: var(--clay-deep);
  font-family: var(--font-sans);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.18s;
}

.claude-accounts-btn:hover {
  background-color: var(--clay-tint);
  border-color: var(--clay-soft);
}

.claude-accounts-btn.active {
  background-color: var(--clay);
  color: #FBF7F2;
  border-color: var(--clay);
}

/* 单账号使用视图 */
.account-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  background-color: var(--surface);
  overflow: hidden;
}

.account-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  background-color: var(--surface);
  border-bottom: 1px solid var(--line);
  flex-shrink: 0;
}

.account-back-btn,
.account-refresh-btn {
  padding: 7px 13px;
  border: 1px solid var(--line-strong);
  border-radius: 9px;
  background-color: var(--surface);
  color: var(--ink);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.18s;
}

.account-back-btn:hover,
.account-refresh-btn:hover {
  background-color: var(--surface-alt);
}

.account-refresh-btn {
  margin-left: auto;
}

.account-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--ink);
}

.account-loading {
  font-size: 12px;
  color: var(--muted);
}

.account-webview {
  flex: 1;
  width: 100%;
  border: none;
}

.grid-container {
  flex: 1;
  display: grid;
  gap: 8px;
  padding: 8px;
  background-color: var(--bg-deep);
  overflow: hidden;
}

.resizable-container {
  flex: 1;
  padding: 8px;
  background-color: var(--bg-deep);
  overflow: hidden;
}

/* 最大化容器 */
.maximized-container {
  flex: 1;
  background-color: var(--bg-deep);
  overflow: hidden;
}

/* 左右二分布局 */
.layout-two-horizontal {
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr;
}

/* 上下二分布局 */
.layout-two-vertical {
  grid-template-columns: 1fr;
  grid-template-rows: 1fr 1fr;
}

/* 上二下一布局 */
.layout-three-top2-bottom1 {
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1fr;
}

.layout-three-top2-bottom1 .grid-item:nth-child(3) {
  grid-column: 1 / -1;
}

/* 上一下二布局 */
.layout-three-top1-bottom2 {
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1fr;
}

.layout-three-top1-bottom2 .grid-item:nth-child(1) {
  grid-column: 1 / -1;
}

/* 四分格布局 */
.layout-four-grid {
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1fr;
}

/* 竖三排布局 */
.layout-three-vertical {
  grid-template-columns: 1fr 1fr 1fr;
  grid-template-rows: 1fr;
}

.grid-item {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border-radius: 12px;
}

/* 底部输入框样式 */
.input-container {
  padding: 14px 18px 18px;
  background-color: var(--surface);
  border-top: 1px solid var(--line);
  flex-shrink: 0;
}

/* 图片预览区 */
.image-preview-container {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
  padding: 10px;
  background-color: var(--surface-alt);
  border: 1px solid var(--line);
  border-radius: 14px;
}

.image-preview-item {
  position: relative;
  width: 80px;
  height: 80px;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid var(--line-strong);
}

.preview-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.remove-image-btn {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background-color: rgba(31, 30, 27, 0.72);
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.18s;
}

.remove-image-btn:hover {
  background-color: var(--alert);
  transform: scale(1.1);
}

.input-wrapper {
  display: flex;
  align-items: flex-end;
  gap: 12px;
  padding: 12px 14px 12px 18px;
  background-color: var(--surface);
  border: 1px solid var(--line-strong);
  border-radius: 18px;
  box-shadow: var(--shadow-sm);
  transition: all 0.18s ease;
}

.input-wrapper.focused {
  border-color: var(--clay);
  box-shadow: 0 0 0 3px var(--clay-tint);
}

.message-input {
  flex: 1;
  min-height: 24px;
  max-height: 120px;
  padding: 6px 0;
  border: none;
  background: transparent;
  color: var(--ink);
  font-size: 15px;
  line-height: 1.5;
  resize: none;
  outline: none;
  font-family: var(--font-sans);
}

.message-input::placeholder {
  color: var(--faint);
}

.send-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  padding: 0;
  border: none;
  border-radius: 12px;
  background-color: var(--bg-deep);
  color: var(--faint);
  cursor: not-allowed;
  transition: all 0.18s ease;
  flex-shrink: 0;
}

.send-btn.active {
  background-color: var(--clay);
  color: #FBF7F2;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(196, 95, 60, 0.28);
}

.send-btn.active:hover {
  background-color: var(--clay-deep);
  transform: scale(1.05);
}

.input-hint {
  margin-top: 9px;
  font-size: 12px;
  color: var(--faint);
  text-align: center;
}

/* 发送结果提示 */
.send-results {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.result-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 13px;
  border-radius: 9px;
  font-size: 12px;
}

.result-item.success {
  background-color: rgba(94, 135, 107, 0.16);
  color: var(--ok);
}

.result-item.error {
  background-color: rgba(187, 79, 61, 0.14);
  color: var(--alert);
}

.result-platform {
  font-weight: 600;
}

.result-message {
  opacity: 0.85;
}

/* 发送中状态 */
.input-wrapper.sending {
  opacity: 0.7;
}

.loading-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid rgba(251, 247, 242, 0.5);
  border-top-color: #FBF7F2;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
