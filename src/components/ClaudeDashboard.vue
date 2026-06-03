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
  if (percent == null) return '#555'
  if (percent >= 90) return '#ef4444'
  if (percent >= 70) return '#f59e0b'
  return '#10b981'
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
          <h2 class="dashboard-title">ClaudeHub</h2>
          <span class="dashboard-subtitle">多账号管理</span>
        </div>
        <div class="header-actions">
          <button
            class="ghost-btn"
            :disabled="accounts.length === 0"
            @click="emit('refresh-all')"
            title="刷新所有账号额度"
          >
            ⟳ 刷新额度
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
            并行工作区 →
          </button>
        </div>
      </div>
      <div class="add-row">
        <input
          v-model="newName"
          class="add-input"
          placeholder="账号备注名，如「主号」「同事A」"
          @keydown.enter="handleAdd"
        />
        <button class="add-btn" @click="handleAdd">+ 添加账号</button>
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
  padding: 24px 32px;
  background-color: #1a1a1a;
}

.dashboard-header {
  margin-bottom: 24px;
}

.title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.brand {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.dashboard-title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: #fff;
}

.dashboard-subtitle {
  font-size: 13px;
  color: #888;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ghost-btn {
  padding: 8px 14px;
  border: 1px solid #3a3a3a;
  border-radius: 8px;
  background-color: transparent;
  color: #b5b5b5;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.ghost-btn:hover:not(:disabled) {
  background-color: #2a2a2a;
  color: #fff;
}

.ghost-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.workspace-btn {
  padding: 8px 16px;
  border: 1px solid #d97706;
  border-radius: 8px;
  background-color: transparent;
  color: #d97706;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.workspace-btn:hover:not(:disabled) {
  background-color: #d97706;
  color: #fff;
}

.workspace-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.add-row {
  display: flex;
  gap: 8px;
  max-width: 520px;
}

.add-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid #3a3a3a;
  border-radius: 8px;
  background-color: #2a2a2a;
  color: #fff;
  font-size: 14px;
  outline: none;
}

.add-input:focus {
  border-color: #d97706;
}

.add-btn {
  padding: 8px 16px;
  border: none;
  border-radius: 8px;
  background-color: #d97706;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.2s;
}

.add-btn:hover {
  background-color: #b45309;
}

.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 16px;
}

.card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border: 1px solid #333;
  border-radius: 12px;
  background-color: #242424;
  cursor: pointer;
  transition: all 0.2s;
}

.card:hover {
  border-color: #d97706;
  transform: translateY(-2px);
}

.card-top {
  display: flex;
  align-items: center;
  gap: 6px;
}

.card-name {
  flex: 1;
  font-size: 16px;
  font-weight: 600;
  color: #fff;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rename-input {
  flex: 1;
  padding: 4px 8px;
  border: 1px solid #d97706;
  border-radius: 6px;
  background-color: #1a1a1a;
  color: #fff;
  font-size: 14px;
  outline: none;
}

.icon-btn {
  width: 26px;
  height: 26px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background-color: transparent;
  color: #888;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
}

.icon-btn:hover {
  background-color: #3a3a3a;
  color: #fff;
}

.icon-btn.danger:hover {
  background-color: rgba(239, 68, 68, 0.2);
  color: #ef4444;
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
  color: #888;
}

.usage-value {
  color: #ccc;
  font-weight: 600;
}

.bar {
  height: 6px;
  border-radius: 3px;
  background-color: #333;
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.3s;
}

.usage-reset {
  font-size: 11px;
  color: #666;
}

.usage-meta {
  margin-top: 8px;
  min-height: 14px;
}

.usage-dim {
  font-size: 11px;
  color: #666;
}

.usage-err {
  font-size: 11px;
  color: #ef4444;
}

.limit-badge {
  padding: 2px 7px;
  border-radius: 5px;
  background-color: rgba(239, 68, 68, 0.18);
  color: #f87171;
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
  margin-top: 4px;
  padding: 8px;
  border: none;
  border-radius: 8px;
  background-color: #2f2f2f;
  color: #d97706;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}

.enter-btn:hover {
  background-color: #3a3a3a;
}

.empty {
  grid-column: 1 / -1;
  padding: 40px;
  text-align: center;
  color: #666;
  font-size: 14px;
}
</style>
