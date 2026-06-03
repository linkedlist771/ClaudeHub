<script setup lang="ts">
import { ref } from 'vue'

export interface ClaudeAccount {
  id: string
  name: string
  // 额度信息（第 2 步接入用量探测后填充，目前为占位）
  usage?: {
    sessionPercent?: number      // 当前会话已用百分比
    sessionResetText?: string    // 当前会话重置文案
    weeklyPercent?: number       // 周用量已用百分比
    weeklyResetText?: string     // 周用量重置文案
    updatedAt?: number           // 上次更新时间戳
  }
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
</script>

<template>
  <div class="dashboard">
    <div class="dashboard-header">
      <div class="title-row">
        <h2 class="dashboard-title">Claude 账号</h2>
        <div class="header-actions">
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
            <button class="icon-btn" @click.stop="startEdit(account)" title="重命名">✎</button>
            <button class="icon-btn danger" @click.stop="handleDelete(account)" title="删除">🗑</button>
          </template>
        </div>

        <!-- 额度区（第 2 步接入真实数据） -->
        <div class="usage">
          <div class="usage-row">
            <span class="usage-label">当前会话</span>
            <span class="usage-value">
              {{ account.usage?.sessionPercent != null ? account.usage.sessionPercent + '% used' : '—' }}
            </span>
          </div>
          <div class="bar">
            <div
              class="bar-fill"
              :style="{
                width: (account.usage?.sessionPercent ?? 0) + '%',
                background: usageColor(account.usage?.sessionPercent)
              }"
            ></div>
          </div>
          <div class="usage-reset">
            {{ account.usage?.sessionResetText || '额度数据待接入' }}
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

.dashboard-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: #fff;
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
