<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'

export interface Platform {
  id: string
  name: string
  url: string
  color: string
}

const props = defineProps<{
  platform: Platform | null
  slotIndex: number
  isMaximized?: boolean
  inputBarVisible?: boolean
  accounts?: { id: string; name: string }[]
  currentAccountId?: string
}>()

const emit = defineEmits<{
  (e: 'change-platform', slotIndex: number): void
  (e: 'toggle-maximize', slotIndex: number): void
  (e: 'toggle-input'): void
  (e: 'back-dashboard'): void
  (e: 'switch-account', accountId: string): void
}>()

// 账号快速切换下拉
const showAccountMenu = ref(false)

function toggleAccountMenu() {
  showAccountMenu.value = !showAccountMenu.value
}

function selectAccount(accountId: string) {
  showAccountMenu.value = false
  if (accountId !== props.currentAccountId) {
    emit('switch-account', accountId)
  }
}

function handleDocClick(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (!target.closest('.account-switcher')) {
    showAccountMenu.value = false
  }
}

watch(showAccountMenu, (open) => {
  if (open) {
    document.addEventListener('click', handleDocClick)
  } else {
    document.removeEventListener('click', handleDocClick)
  }
})

const loading = ref(true)
const webviewId = computed(() =>
  props.platform ? `webview-${props.platform.id}-${props.slotIndex}` : ''
)

onMounted(() => {
  setupWebviewListeners()
})

watch(() => props.platform?.id, () => {
  loading.value = true
  setTimeout(setupWebviewListeners, 100)
})

function setupWebviewListeners() {
  if (!props.platform) return
  const webview = document.getElementById(webviewId.value) as any
  if (webview) {
    webview.addEventListener('did-finish-load', () => {
      loading.value = false
    })
    webview.addEventListener('did-fail-load', () => {
      loading.value = false
    })
  }
}

function handleChangePlatform() {
  emit('change-platform', props.slotIndex)
}

// 刷新 WebView
function handleRefresh() {
  const webview = document.getElementById(webviewId.value) as any
  if (webview) {
    loading.value = true
    webview.reload()
  }
}

// 双击标题栏切换最大化
function handleHeaderDoubleClick() {
  emit('toggle-maximize', props.slotIndex)
}
</script>

<template>
  <div :class="['panel-container', { maximized: isMaximized }]">
    <!-- 标题栏 -->
    <div
      class="panel-header"
      :style="{ borderColor: platform?.color || '#555' }"
      @dblclick="handleHeaderDoubleClick"
    >
      <!-- 最大化视图：账号名做成快速切换下拉 -->
      <div v-if="isMaximized && accounts && accounts.length" class="account-switcher">
        <button class="account-switcher-btn" @click.stop="toggleAccountMenu">
          <span class="platform-name">{{ platform?.name || '未选择账号' }}</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" :style="{ transform: showAccountMenu ? 'rotate(180deg)' : '' }">
            <path d="M6 9l6 6 6-6"/>
          </svg>
        </button>
        <div v-if="showAccountMenu" class="account-menu">
          <button
            v-for="acc in accounts"
            :key="acc.id"
            class="account-menu-item"
            :class="{ active: acc.id === currentAccountId }"
            @click.stop="selectAccount(acc.id)"
          >
            <span class="dot" :class="{ on: acc.id === currentAccountId }"></span>
            <span class="account-menu-name">{{ acc.name }}</span>
          </button>
        </div>
      </div>
      <span v-else class="platform-name">{{ platform?.name || '未选择账号' }}</span>
      <div class="header-actions">
        <!-- 返回账号主页（仅最大化视图，因为此时顶部工具栏隐藏） -->
        <button
          v-if="isMaximized"
          class="text-action"
          @click="emit('back-dashboard')"
          title="返回账号面板"
        >
          ← 账号面板
        </button>
        <!-- 输入框显隐（仅最大化视图，因为此时顶部工具栏隐藏） -->
        <button
          v-if="isMaximized"
          class="text-action"
          :class="{ active: !inputBarVisible }"
          @click="emit('toggle-input')"
          :title="inputBarVisible ? '隐藏输入框' : '显示输入框'"
        >
          {{ inputBarVisible ? '隐藏输入框' : '显示输入框' }}
        </button>
        <span v-if="isMaximized" class="header-divider"></span>
        <span v-if="loading" class="loading-indicator">加载中...</span>
        <button class="action-btn" @click="handleRefresh" title="刷新">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M1 4v6h6M23 20v-6h-6"/>
            <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/>
          </svg>
        </button>
        <!-- 最大化/还原按钮 -->
        <button 
          class="action-btn" 
          @click="handleHeaderDoubleClick" 
          :title="isMaximized ? '还原' : '最大化'"
        >
          <svg v-if="!isMaximized" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
          </svg>
          <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>
          </svg>
        </button>
        <button class="action-btn" @click="handleChangePlatform" title="切换账号">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </button>
      </div>
    </div>
    
    <!-- WebView -->
    <webview
      v-if="platform"
      :id="webviewId"
      :key="`${platform.id}-${slotIndex}`"
      :src="platform.url"
      :partition="`persist:${platform.id}`"
      class="webview"
      allowpopups
    ></webview>

    <!-- 空槽位占位 -->
    <div v-else class="empty-slot" @click="handleChangePlatform">
      <span class="empty-slot-text">点击选择 Claude 账号</span>
    </div>
  </div>
</template>

<style scoped>
.panel-container {
  display: flex;
  flex-direction: column;
  background-color: #242424;
  border-radius: 8px;
  overflow: hidden;
  height: 100%;
}

.panel-container.maximized {
  border-radius: 0;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background-color: #2a2a2a;
  border-left: 3px solid;
  min-height: 20px;
  flex-shrink: 0;
  cursor: pointer;
  user-select: none;
}

.panel-header:hover {
  background-color: #333;
}

.platform-name {
  font-size: 14px;
  font-weight: 600;
  color: #fff;
}

/* 账号快速切换 */
.account-switcher {
  position: relative;
}

.account-switcher-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border: none;
  border-radius: 7px;
  background-color: transparent;
  color: #fff;
  cursor: pointer;
  transition: background 0.15s;
}

.account-switcher-btn:hover {
  background-color: rgba(255, 255, 255, 0.08);
}

.account-switcher-btn svg {
  color: #999;
  transition: transform 0.2s;
}

.account-menu {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  min-width: 200px;
  max-height: 360px;
  overflow-y: auto;
  padding: 6px;
  border: 1px solid #3a3a3a;
  border-radius: 10px;
  background-color: #2a2a2a;
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.45);
  z-index: 100;
}

.account-menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 10px;
  border: none;
  border-radius: 7px;
  background-color: transparent;
  color: #ddd;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s;
}

.account-menu-item:hover {
  background-color: #3a3a3a;
}

.account-menu-item.active {
  color: #fff;
}

.account-menu-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background-color: #555;
  flex-shrink: 0;
}

.dot.on {
  background-color: #d97706;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.loading-indicator {
  font-size: 12px;
  color: #888;
  margin-right: 4px;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background-color: transparent;
  color: #888;
  cursor: pointer;
  transition: all 0.2s;
}

.action-btn:hover {
  background-color: #3a3a3a;
  color: #fff;
}

/* 文字型操作按钮（最大化视图：返回、显隐输入框） */
.text-action {
  display: flex;
  align-items: center;
  height: 28px;
  padding: 0 12px;
  border: none;
  border-radius: 7px;
  background-color: transparent;
  color: #b5b5b5;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
  transition: all 0.15s;
}

.text-action:hover {
  background-color: rgba(255, 255, 255, 0.08);
  color: #fff;
}

.text-action.active {
  background-color: rgba(100, 108, 255, 0.16);
  color: #aeb3ff;
}

.header-divider {
  width: 1px;
  height: 18px;
  margin: 0 4px;
  background-color: #3f3f3f;
}

.webview {
  flex: 1;
  width: 100%;
  border: none;
}

.empty-slot {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #1f1f1f;
  cursor: pointer;
  transition: background 0.2s;
}

.empty-slot:hover {
  background-color: #262626;
}

.empty-slot-text {
  color: #777;
  font-size: 14px;
}
</style>