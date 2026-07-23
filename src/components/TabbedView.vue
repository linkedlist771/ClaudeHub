<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted } from 'vue'
// claude.ai 对话页注入脚本（与 WebViewPanel 共用）：导出按钮 + 用量条
import claudeExportInject from '../utils/claudeExportInject.js?raw'
import claudeUsageInject from '../utils/claudeUsageInject.js?raw'

interface Account {
  id: string
  name: string
}

const props = defineProps<{
  accounts: Account[]
  openTabs: string[]        // 已打开为标签的账号 id（有序）
  activeTabId: string | null
  url: string               // claude.ai 地址
  color: string             // 主题色（用于活动标签强调）
}>()

const emit = defineEmits<{
  (e: 'switch-tab', id: string): void
  (e: 'close-tab', id: string): void
  (e: 'open-tab', id: string): void
  (e: 'back-dashboard'): void
}>()

// 每个标签的加载状态
const loadingMap = ref<Record<string, boolean>>({})

// 已打开标签对应的账号对象（保持 openTabs 的顺序）
const tabAccounts = computed(() =>
  props.openTabs
    .map(id => props.accounts.find(a => a.id === id))
    .filter((a): a is Account => !!a)
)

// 尚未打开的账号（用于「+」新建标签下拉）
const unopenedAccounts = computed(() =>
  props.accounts.filter(a => !props.openTabs.includes(a.id))
)

function tabWebviewId(accountId: string) {
  return `tabview-${accountId}`
}

// 是否为 claude 站点（决定是否注入增强脚本）
function injectEnhancements(webview: any) {
  if (!webview?.executeJavaScript) return
  webview.executeJavaScript(claudeExportInject).catch(() => {})
  webview.executeJavaScript(claudeUsageInject).catch(() => {})
}

// 给新出现的标签 webview 绑定监听（幂等，靠 __chWired 标记）
function wireWebviews() {
  for (const acc of tabAccounts.value) {
    const el = document.getElementById(tabWebviewId(acc.id)) as any
    if (!el || el.__chWired) continue
    el.__chWired = true
    loadingMap.value[acc.id] = true
    el.addEventListener('did-finish-load', () => {
      loadingMap.value[acc.id] = false
      injectEnhancements(el)
    })
    el.addEventListener('did-fail-load', () => {
      loadingMap.value[acc.id] = false
    })
  }
}

onMounted(() => nextTick(wireWebviews))
watch(() => props.openTabs.slice(), () => nextTick(wireWebviews))

// 刷新当前活动标签
function refreshActive() {
  if (!props.activeTabId) return
  const el = document.getElementById(tabWebviewId(props.activeTabId)) as any
  if (el?.reload) {
    loadingMap.value[props.activeTabId] = true
    el.reload()
  }
}

// 新建标签下拉
const showNewMenu = ref(false)
function toggleNewMenu() {
  showNewMenu.value = !showNewMenu.value
}
function pickNewTab(id: string) {
  showNewMenu.value = false
  emit('open-tab', id)
}
function handleDocClick(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (!target.closest('.new-tab-wrap')) showNewMenu.value = false
}
watch(showNewMenu, (open) => {
  if (open) document.addEventListener('click', handleDocClick)
  else document.removeEventListener('click', handleDocClick)
})

function handleClose(e: MouseEvent, id: string) {
  e.stopPropagation()
  emit('close-tab', id)
}
</script>

<template>
  <div class="tabbed-view">
    <!-- 标签栏 -->
    <div class="tab-strip">
      <button class="strip-btn back-btn" @click="emit('back-dashboard')" title="返回账号面板">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 18l-6-6 6-6"/></svg>
      </button>

      <div class="tabs">
        <div
          v-for="acc in tabAccounts"
          :key="acc.id"
          class="tab"
          :class="{ active: acc.id === activeTabId }"
          :style="acc.id === activeTabId ? { borderTopColor: color } : {}"
          @click="emit('switch-tab', acc.id)"
          :title="acc.name"
        >
          <span class="tab-dot" :class="{ on: acc.id === activeTabId }" :style="acc.id === activeTabId ? { backgroundColor: color } : {}"></span>
          <span class="tab-name">{{ acc.name }}</span>
          <span v-if="loadingMap[acc.id]" class="tab-spinner"></span>
          <button class="tab-close" @click="handleClose($event, acc.id)" title="关闭标签">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <!-- 新建标签 -->
        <div class="new-tab-wrap">
          <button
            class="new-tab-btn"
            :disabled="unopenedAccounts.length === 0"
            @click.stop="toggleNewMenu"
            title="打开新账号标签"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
          </button>
          <div v-if="showNewMenu && unopenedAccounts.length" class="new-menu">
            <button
              v-for="acc in unopenedAccounts"
              :key="acc.id"
              class="new-menu-item"
              @click.stop="pickNewTab(acc.id)"
            >
              {{ acc.name }}
            </button>
          </div>
        </div>
      </div>

      <button class="strip-btn refresh-btn" @click="refreshActive" :disabled="!activeTabId" title="刷新当前标签">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 4v6h6M23 20v-6h-6"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/></svg>
      </button>
    </div>

    <!-- 内容区：每个标签一个 webview，v-show 保活（切换不重载） -->
    <div class="tab-bodies">
      <webview
        v-for="acc in tabAccounts"
        v-show="acc.id === activeTabId"
        :key="acc.id"
        :id="tabWebviewId(acc.id)"
        :src="url"
        :partition="`persist:claude-${acc.id}`"
        class="tab-webview"
        allowpopups
      ></webview>

      <div v-if="tabAccounts.length === 0" class="tab-empty">
        没有打开的标签，点上方「+」选择一个 Claude 账号打开。
      </div>
    </div>
  </div>
</template>

<style scoped>
.tabbed-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  background-color: var(--bg-deep);
  overflow: hidden;
}

/* 标签栏 */
.tab-strip {
  display: flex;
  align-items: stretch;
  gap: 6px;
  height: 42px;
  padding: 0 8px;
  background-color: var(--surface);
  border-bottom: 1px solid var(--line);
  flex-shrink: 0;
}

.strip-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  margin: 6px 0;
  padding: 0;
  border: 1px solid var(--line-strong);
  border-radius: 8px;
  background-color: var(--surface);
  color: var(--muted);
  cursor: pointer;
  transition: all 0.15s;
  flex-shrink: 0;
}

.strip-btn:hover:not(:disabled) {
  background-color: var(--surface-alt);
  color: var(--ink);
}

.strip-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.tabs {
  display: flex;
  align-items: stretch;
  gap: 4px;
  flex: 1;
  min-width: 0;
  overflow-x: auto;
  padding-top: 6px;
}

.tab {
  display: flex;
  align-items: center;
  gap: 7px;
  max-width: 220px;
  min-width: 110px;
  padding: 0 8px 0 12px;
  border: 1px solid var(--line);
  border-top: 2px solid transparent;
  border-bottom: none;
  border-radius: 10px 10px 0 0;
  background-color: var(--surface-alt);
  color: var(--muted);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  user-select: none;
}

.tab:hover {
  background-color: var(--surface);
  color: var(--ink-2);
}

.tab.active {
  background-color: var(--bg-deep);
  color: var(--ink);
  font-weight: 600;
}

.tab-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background-color: var(--line-strong);
  flex-shrink: 0;
}

.tab-name {
  flex: 1;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tab-spinner {
  width: 12px;
  height: 12px;
  border: 2px solid var(--line-strong);
  border-top-color: var(--clay);
  border-radius: 50%;
  animation: tab-spin 0.8s linear infinite;
  flex-shrink: 0;
}

@keyframes tab-spin {
  to { transform: rotate(360deg); }
}

.tab-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  border-radius: 5px;
  background-color: transparent;
  color: var(--muted);
  cursor: pointer;
  transition: all 0.15s;
  flex-shrink: 0;
}

.tab-close:hover {
  background-color: rgba(187, 79, 61, 0.14);
  color: var(--alert);
}

/* 新建标签 */
.new-tab-wrap {
  position: relative;
  display: flex;
  align-items: center;
}

.new-tab-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  margin-top: 2px;
  padding: 0;
  border: none;
  border-radius: 8px;
  background-color: transparent;
  color: var(--muted);
  cursor: pointer;
  transition: all 0.15s;
  flex-shrink: 0;
}

.new-tab-btn:hover:not(:disabled) {
  background-color: var(--surface-alt);
  color: var(--ink);
}

.new-tab-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.new-menu {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  min-width: 180px;
  max-height: 340px;
  overflow-y: auto;
  padding: 6px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background-color: var(--surface);
  box-shadow: var(--shadow-lg);
  z-index: 200;
}

.new-menu-item {
  display: block;
  width: 100%;
  padding: 9px 10px;
  border: none;
  border-radius: 8px;
  background-color: transparent;
  color: var(--ink-2);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.new-menu-item:hover {
  background-color: var(--surface-alt);
  color: var(--ink);
}

/* 内容区 */
.tab-bodies {
  position: relative;
  flex: 1;
  min-height: 0;
  background-color: var(--surface);
}

.tab-webview {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border: none;
}

.tab-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 40px;
  text-align: center;
  color: var(--muted);
  font-size: 14px;
}
</style>
