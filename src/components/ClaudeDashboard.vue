<script setup lang="ts">
import { ref } from 'vue'

export interface ClaudeUsage {
  fiveHourPercent?: number     // 5 小时窗口已用百分比
  fiveHourResetsAt?: string    // 5 小时窗口重置时间（ISO）
  sevenDayPercent?: number     // 7 天窗口已用百分比
  sevenDayResetsAt?: string    // 7 天窗口重置时间（ISO）
  limited?: boolean            // 是否已受限（任一窗口 >= 100%）
  loading?: boolean            // 正在刷新
  error?: string               // 刷新失败原因
  updatedAt?: number           // 上次更新时间戳
}

export interface ClaudeAccount {
  id: string
  name: string
  usage?: ClaudeUsage
}

defineProps<{
  accounts: ClaudeAccount[]
}>()

const emit = defineEmits<{
  (e: 'enter', id: string): void
  (e: 'enter-workspace'): void
  (e: 'add', name: string): void
  (e: 'rename', id: string, name: string): void
  (e: 'delete', id: string): void
  (e: 'export'): void
  (e: 'import'): void
  (e: 'refresh', id: string): void
  (e: 'refresh-all'): void
}>()

const newName = ref('')
const editingId = ref<string | null>(null)
const editingName = ref('')

function handleAdd() {
  const name = newName.value.trim() || `账号 ${Date.now().toString().slice(-4)}`
  emit('add', name)
  newName.value = ''
}

function startEdit(account: ClaudeAccount) {
  editingId.value = account.id
  editingName.value = account.name
}

function confirmEdit(id: string) {
  const name = editingName.value.trim()
  if (name) emit('rename', id, name)
  editingId.value = null
}

function cancelEdit() {
  editingId.value = null
}

function handleDelete(account: ClaudeAccount) {
  if (confirm(`删除账号「${account.name}」？\n（仅从列表移除，已缓存的登录数据不会立即清除）`)) {
    emit('delete', account.id)
  }
}

// 额度状态颜色
function usageColor(percent?: number): string {
  if (percent == null) return 'var(--faint)'
  if (percent >= 90) return 'var(--alert)'
  if (percent >= 70) return 'var(--warn)'
  return 'var(--ok)'
}

// 百分比展示（四舍五入）
function pct(p?: number): string {
  return p == null ? '—' : `${Math.round(p)}%`
}

// 5 小时窗口：相对时间「X小时Y分后重置」
function fiveHourReset(iso?: string): string {
  if (!iso) return ''
  const t = new Date(iso).getTime()
  if (isNaN(t)) return ''
  const diff = t - Date.now()
  if (diff <= 0) return '已重置'
  const mins = Math.round(diff / 60000)
  if (mins < 60) return `${mins} 分钟后重置`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m ? `${h} 小时 ${m} 分后重置` : `${h} 小时后重置`
}

// 7 天窗口：显示本地日期时间「重置 周五 23:00」
function sevenDayReset(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()]
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `重置 ${week} ${hh}:${mm}`
}

// 上次更新相对时间
function updatedText(ts?: number): string {
  if (!ts) return ''
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '刚刚更新'
  if (mins < 60) return `${mins} 分钟前更新`
  return `${Math.floor(mins / 60)} 小时前更新`
}
</script>

<template>
  <div class="dashboard">
    <div class="dashboard-header">
      <div class="title-row">
        <div class="brand">
          <span class="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 40 40" width="40" height="40">
              <rect x="0.5" y="0.5" width="39" height="39" rx="11" fill="var(--clay)"/>
              <g fill="#F7EFE6">
                <rect x="10" y="10" width="8.4" height="8.4" rx="2.4"/>
                <rect x="21.6" y="10" width="8.4" height="8.4" rx="2.4" opacity="0.78"/>
                <rect x="10" y="21.6" width="8.4" height="8.4" rx="2.4" opacity="0.78"/>
                <rect x="21.6" y="21.6" width="8.4" height="8.4" rx="2.4" opacity="0.55"/>
              </g>
            </svg>
          </span>
          <div class="brand-text">
            <h1 class="dashboard-title">Claude<span class="title-accent">Hub</span></h1>
            <span class="dashboard-subtitle">多账号并行工作台</span>
          </div>
        </div>
        <div class="header-actions">
          <button
            class="ghost-btn"
            :disabled="accounts.length === 0"
            @click="emit('refresh-all')"
            title="刷新所有账号额度"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 4v6h6M23 20v-6h-6"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/></svg>
            刷新额度
          </button>
          <button class="ghost-btn" @click="emit('import')" title="从 JSON 文件导入账号凭证">
            导入
          </button>
          <button
            class="ghost-btn"
            :disabled="accounts.length === 0"
            @click="emit('export')"
            title="导出所有账号凭证到 JSON 文件"
          >
            导出
          </button>
          <button
            class="workspace-btn"
            :disabled="accounts.length === 0"
            @click="emit('enter-workspace')"
            title="把多个账号窗口并排，同时对话"
          >
            并行工作区
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
          </button>
        </div>
      </div>
      <div class="add-row">
        <input
          v-model="newName"
          class="add-input"
          placeholder="账号备注名，如「主号」「同事 A」"
          @keydown.enter="handleAdd"
        />
        <button class="add-btn" @click="handleAdd">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
          添加账号
        </button>
      </div>
    </div>

    <div class="cards">
      <div
        v-for="account in accounts"
        :key="account.id"
        class="card"
        @click="editingId !== account.id && emit('enter', account.id)"
      >
        <!-- 名称 / 重命名 -->
        <div class="card-top">
          <template v-if="editingId === account.id">
            <input
              v-model="editingName"
              class="rename-input"
              @click.stop
              @keydown.enter="confirmEdit(account.id)"
              @keydown.esc="cancelEdit"
            />
            <button class="icon-btn" @click.stop="confirmEdit(account.id)" title="保存">✓</button>
            <button class="icon-btn" @click.stop="cancelEdit" title="取消">✕</button>
          </template>
          <template v-else>
            <span class="card-name">{{ account.name }}</span>
            <span v-if="account.usage?.limited" class="limit-badge">受限</span>
            <button
              class="icon-btn"
              :class="{ spinning: account.usage?.loading }"
              @click.stop="emit('refresh', account.id)"
              title="刷新额度"
            >⟳</button>
            <button class="icon-btn" @click.stop="startEdit(account)" title="重命名">✎</button>
            <button class="icon-btn danger" @click.stop="handleDelete(account)" title="删除">🗑</button>
          </template>
        </div>

        <!-- 额度区：5 小时窗口 + 7 天窗口 -->
        <div class="usage">
          <!-- 5 小时 -->
          <div class="usage-row">
            <span class="usage-label">当前会话 (5h)</span>
            <span class="usage-value">{{ pct(account.usage?.fiveHourPercent) }}</span>
          </div>
          <div class="bar">
            <div
              class="bar-fill"
              :style="{
                width: Math.min(account.usage?.fiveHourPercent ?? 0, 100) + '%',
                background: usageColor(account.usage?.fiveHourPercent)
              }"
            ></div>
          </div>
          <div class="usage-reset">{{ fiveHourReset(account.usage?.fiveHourResetsAt) || '—' }}</div>

          <!-- 7 天 -->
          <div class="usage-row" style="margin-top: 8px">
            <span class="usage-label">每周 (7d)</span>
            <span class="usage-value">{{ pct(account.usage?.sevenDayPercent) }}</span>
          </div>
          <div class="bar">
            <div
              class="bar-fill"
              :style="{
                width: Math.min(account.usage?.sevenDayPercent ?? 0, 100) + '%',
                background: usageColor(account.usage?.sevenDayPercent)
              }"
            ></div>
          </div>
          <div class="usage-reset">{{ sevenDayReset(account.usage?.sevenDayResetsAt) || '—' }}</div>

          <!-- 状态行 -->
          <div class="usage-meta">
            <span v-if="account.usage?.error" class="usage-err">⚠ {{ account.usage.error }}</span>
            <span v-else-if="account.usage?.loading" class="usage-dim">刷新中…</span>
            <span v-else-if="account.usage?.updatedAt" class="usage-dim">{{ updatedText(account.usage.updatedAt) }}</span>
            <span v-else class="usage-dim">点「刷新额度」获取</span>
          </div>
        </div>

        <button class="enter-btn" @click.stop="emit('enter', account.id)">进入使用 →</button>
      </div>

      <div v-if="accounts.length === 0" class="empty">
        还没有账号，在上方输入备注名点「添加账号」，进入后登录对应的 Claude 账号即可。
      </div>
    </div>
  </div>
</template>

<style scoped>
.dashboard {
  flex: 1;
  overflow-y: auto;
  padding: 36px 40px 48px;
  background-color: var(--bg);
  background-image: radial-gradient(circle at 1px 1px, rgba(120, 110, 90, 0.05) 1px, transparent 0);
  background-size: 22px 22px;
}

.dashboard-header {
  max-width: 1240px;
  margin: 0 auto 28px;
}

.title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 22px;
  padding-bottom: 22px;
  border-bottom: 1px solid var(--line);
}

.brand {
  display: flex;
  align-items: center;
  gap: 14px;
}

.brand-mark {
  display: flex;
  filter: drop-shadow(0 4px 10px rgba(196, 95, 60, 0.28));
}

.brand-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.dashboard-title {
  margin: 0;
  font-family: var(--font-serif);
  font-size: 30px;
  font-weight: 500;
  letter-spacing: -0.01em;
  line-height: 1.05;
  color: var(--ink);
}

.title-accent {
  color: var(--clay);
  font-style: italic;
}

.dashboard-subtitle {
  font-size: 13px;
  color: var(--muted);
  letter-spacing: 0.01em;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ghost-btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 9px 14px;
  border: 1px solid var(--line-strong);
  border-radius: 10px;
  background-color: var(--surface);
  color: var(--ink-2);
  font-family: var(--font-sans);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.18s ease;
}

.ghost-btn:hover:not(:disabled) {
  border-color: var(--kraft);
  background-color: var(--surface-alt);
  color: var(--ink);
}

.ghost-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.workspace-btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 9px 18px;
  border: 1px solid var(--clay);
  border-radius: 10px;
  background-color: var(--clay);
  color: #FBF7F2;
  font-family: var(--font-sans);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(196, 95, 60, 0.25);
  transition: all 0.18s ease;
}

.workspace-btn svg { transition: transform 0.18s ease; }
.workspace-btn:hover:not(:disabled) {
  background-color: var(--clay-deep);
  border-color: var(--clay-deep);
}
.workspace-btn:hover:not(:disabled) svg { transform: translateX(2px); }

.workspace-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  box-shadow: none;
}

.add-row {
  display: flex;
  gap: 10px;
  max-width: 520px;
}

.add-input {
  flex: 1;
  padding: 11px 14px;
  border: 1px solid var(--line-strong);
  border-radius: 10px;
  background-color: var(--surface);
  color: var(--ink);
  font-family: var(--font-sans);
  font-size: 14px;
  outline: none;
  transition: border-color 0.18s, box-shadow 0.18s;
}

.add-input::placeholder { color: var(--faint); }

.add-input:focus {
  border-color: var(--clay);
  box-shadow: 0 0 0 3px var(--clay-tint);
}

.add-btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 11px 18px;
  border: none;
  border-radius: 10px;
  background-color: var(--ink);
  color: #F7F4EC;
  font-family: var(--font-sans);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.18s;
}

.add-btn:hover {
  background-color: #000;
}

.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 18px;
  max-width: 1240px;
  margin: 0 auto;
}

.card {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 20px;
  border: 1px solid var(--line);
  border-radius: 16px;
  background-color: var(--surface);
  box-shadow: var(--shadow-sm);
  cursor: pointer;
  transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
}

.card:hover {
  border-color: var(--clay-soft);
  box-shadow: var(--shadow-md);
  transform: translateY(-3px);
}

.card-top {
  display: flex;
  align-items: center;
  gap: 4px;
}

.card-name {
  flex: 1;
  font-size: 16px;
  font-weight: 600;
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rename-input {
  flex: 1;
  padding: 5px 9px;
  border: 1px solid var(--clay);
  border-radius: 8px;
  background-color: var(--surface-alt);
  color: var(--ink);
  font-size: 14px;
  outline: none;
}

.icon-btn {
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 8px;
  background-color: transparent;
  color: var(--muted);
  cursor: pointer;
  font-size: 13px;
  transition: all 0.18s;
}

.icon-btn:hover {
  background-color: var(--surface-alt);
  color: var(--ink);
}

.icon-btn.danger:hover {
  background-color: rgba(187, 79, 61, 0.12);
  color: var(--alert);
}

.usage {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.usage-row {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
}

.usage-label {
  color: var(--muted);
  font-weight: 500;
}

.usage-value {
  color: var(--ink-2);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.bar {
  height: 7px;
  border-radius: 4px;
  background-color: var(--bg-deep);
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.3s;
}

.usage-reset {
  font-size: 11px;
  color: var(--faint);
}

.usage-meta {
  margin-top: 8px;
  min-height: 14px;
}

.usage-dim {
  font-size: 11px;
  color: var(--faint);
}

.usage-err {
  font-size: 11px;
  color: var(--alert);
}

.limit-badge {
  padding: 2px 8px;
  border-radius: 6px;
  background-color: rgba(187, 79, 61, 0.12);
  color: var(--alert);
  font-size: 11px;
  font-weight: 600;
}

.icon-btn.spinning {
  animation: omc-spin 0.8s linear infinite;
}

@keyframes omc-spin {
  to { transform: rotate(360deg); }
}

.enter-btn {
  margin-top: 2px;
  padding: 10px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background-color: var(--surface-alt);
  color: var(--clay-deep);
  font-family: var(--font-sans);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.18s;
}

.enter-btn:hover {
  background-color: var(--clay-tint);
  border-color: var(--clay-soft);
}

.empty {
  grid-column: 1 / -1;
  padding: 56px 40px;
  text-align: center;
  color: var(--muted);
  font-size: 14px;
  line-height: 1.7;
  border: 1px dashed var(--line-strong);
  border-radius: 16px;
  background-color: var(--surface);
}
</style>
