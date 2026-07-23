<script setup lang="ts">
import { ref } from 'vue'

export interface ChatGPTAccount {
  id: string
  name: string
}

defineProps<{
  accounts: ChatGPTAccount[]
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

function startEdit(account: ChatGPTAccount) {
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

function handleDelete(account: ChatGPTAccount) {
  if (confirm(`删除账号「${account.name}」？\n（仅从列表移除，本机缓存的登录数据不会立即清除）`)) {
    emit('delete', account.id)
  }
}

function accountInitial(name: string): string {
  return name.trim().slice(0, 1).toUpperCase() || 'G'
}
</script>

<template>
  <main class="dashboard">
    <header class="dashboard-header">
      <div class="header-main">
        <div class="brand">
          <img class="brand-mark" src="/logo.svg" alt="" />
          <div class="brand-copy">
            <h1>ChatGPT <span>Hub</span></h1>
            <p>{{ accounts.length }} 个账号</p>
          </div>
        </div>

        <div class="header-actions">
          <button class="icon-button" @click="emit('import')" title="导入账号会话" aria-label="导入账号会话">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>
            </svg>
          </button>
          <button
            class="icon-button"
            :disabled="accounts.length === 0"
            @click="emit('export')"
            title="导出账号会话"
            aria-label="导出账号会话"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 21V9"/><path d="m17 14-5-5-5 5"/><path d="M5 3h14"/>
            </svg>
          </button>
          <span class="action-divider" aria-hidden="true"></span>
          <button
            class="workspace-button"
            :disabled="accounts.length === 0"
            @click="emit('enter-workspace')"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
            </svg>
            并行工作区
          </button>
        </div>
      </div>

      <div class="add-row">
        <input
          v-model="newName"
          class="add-input"
          placeholder="账号备注名"
          aria-label="账号备注名"
          @keydown.enter="handleAdd"
        />
        <button class="add-button" @click="handleAdd">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
            <path d="M12 5v14M5 12h14"/>
          </svg>
          添加账号
        </button>
      </div>
    </header>

    <section class="accounts" aria-label="ChatGPT 账号">
      <article
        v-for="(account, index) in accounts"
        :key="account.id"
        class="account-card"
        @click="editingId !== account.id && emit('enter', account.id)"
      >
        <div class="card-heading">
          <div class="account-avatar" aria-hidden="true">{{ accountInitial(account.name) }}</div>
          <div v-if="editingId === account.id" class="rename-row" @click.stop>
            <input
              v-model="editingName"
              class="rename-input"
              aria-label="账号名称"
              @keydown.enter="confirmEdit(account.id)"
              @keydown.esc="cancelEdit"
            />
            <button class="small-icon-button" @click="confirmEdit(account.id)" title="保存" aria-label="保存">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 4 4L19 6"/></svg>
            </button>
            <button class="small-icon-button" @click="cancelEdit" title="取消" aria-label="取消">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="m6 6 12 12M18 6 6 18"/></svg>
            </button>
          </div>
          <div v-else class="account-copy">
            <h2>{{ account.name }}</h2>
            <p>账号 {{ String(index + 1).padStart(2, '0') }}</p>
          </div>
        </div>

        <div v-if="editingId !== account.id" class="card-actions">
          <button class="small-icon-button" @click.stop="startEdit(account)" title="重命名" aria-label="重命名">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
          </button>
          <button class="small-icon-button danger" @click.stop="handleDelete(account)" title="删除" aria-label="删除">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/></svg>
          </button>
          <button class="open-button" @click.stop="emit('enter', account.id)">
            打开
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
          </button>
        </div>
      </article>

      <div v-if="accounts.length === 0" class="empty-state">
        <div class="empty-icon" aria-hidden="true">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
        </div>
        <h2>添加第一个账号</h2>
        <p>创建账号入口后，在独立窗口中登录 ChatGPT。</p>
      </div>
    </section>
  </main>
</template>

<style scoped>
.dashboard {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  background: var(--bg);
  color: var(--ink);
}

.dashboard-header {
  padding: 28px clamp(24px, 4vw, 56px) 24px;
  border-bottom: 1px solid var(--line);
  background: var(--surface);
}

.header-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  max-width: 1280px;
  margin: 0 auto 24px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 13px;
  min-width: 0;
}

.brand-mark {
  width: 42px;
  height: 42px;
  flex: 0 0 42px;
}

.brand-copy h1 {
  margin: 0;
  font: 650 24px/1.1 var(--font-sans);
  letter-spacing: 0;
  white-space: nowrap;
}

.brand-copy h1 span {
  color: var(--accent);
}

.brand-copy p {
  margin: 4px 0 0;
  color: var(--muted);
  font-size: 12px;
}

.header-actions,
.card-actions,
.rename-row {
  display: flex;
  align-items: center;
}

.header-actions {
  gap: 8px;
}

.icon-button,
.small-icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1px solid var(--line-strong);
  background: var(--surface);
  color: var(--ink-2);
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}

.icon-button {
  width: 38px;
  height: 38px;
  border-radius: 8px;
}

.small-icon-button {
  width: 30px;
  height: 30px;
  border-radius: 6px;
}

.icon-button:hover:not(:disabled),
.small-icon-button:hover {
  border-color: var(--accent-soft);
  background: var(--accent-tint);
  color: var(--accent-deep);
}

.icon-button:disabled,
.workspace-button:disabled {
  opacity: 0.38;
  cursor: not-allowed;
}

.small-icon-button.danger:hover {
  border-color: rgba(190, 66, 58, 0.3);
  background: rgba(190, 66, 58, 0.08);
  color: var(--alert);
}

.action-divider {
  width: 1px;
  height: 24px;
  margin: 0 2px;
  background: var(--line);
}

.workspace-button,
.add-button,
.open-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border: none;
  border-radius: 8px;
  font: 600 13px/1 var(--font-sans);
  cursor: pointer;
  transition: background 0.15s, transform 0.15s;
}

.workspace-button {
  min-height: 38px;
  padding: 0 15px;
  background: var(--ink);
  color: #fff;
}

.workspace-button:hover:not(:disabled) {
  background: #080a0a;
}

.add-row {
  display: flex;
  gap: 8px;
  max-width: 520px;
  margin: 0 auto;
}

.add-input,
.rename-input {
  border: 1px solid var(--line-strong);
  border-radius: 8px;
  background: var(--surface);
  color: var(--ink);
  font: 400 14px/1.4 var(--font-sans);
  outline: none;
}

.add-input {
  width: 100%;
  min-width: 0;
  padding: 10px 12px;
}

.add-input:focus,
.rename-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-tint);
}

.add-button {
  flex: 0 0 auto;
  padding: 0 16px;
  background: var(--accent);
  color: #fff;
}

.add-button:hover,
.open-button:hover {
  background: var(--accent-deep);
}

.accounts {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
  max-width: 1280px;
  margin: 0 auto;
  padding: 28px clamp(24px, 4vw, 56px) 48px;
}

.account-card {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-height: 146px;
  min-width: 0;
  padding: 18px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  box-shadow: var(--shadow-sm);
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s, transform 0.15s;
}

.account-card:hover {
  border-color: var(--accent-soft);
  box-shadow: var(--shadow-md);
  transform: translateY(-1px);
}

.card-heading {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.account-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  flex: 0 0 38px;
  border-radius: 8px;
  background: var(--accent-tint-2);
  color: var(--accent-deep);
  font-size: 15px;
  font-weight: 700;
}

.account-copy {
  flex: 1;
  min-width: 0;
}

.account-copy h2 {
  overflow: hidden;
  margin: 0;
  color: var(--ink);
  font-size: 15px;
  font-weight: 650;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.account-copy p {
  margin: 3px 0 0;
  color: var(--faint);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.card-actions {
  justify-content: flex-end;
  gap: 6px;
  margin-top: 22px;
}

.open-button {
  min-height: 30px;
  margin-left: auto;
  padding: 0 12px;
  background: var(--accent);
  color: #fff;
}

.rename-row {
  flex: 1;
  gap: 6px;
  min-width: 0;
}

.rename-input {
  min-width: 0;
  flex: 1;
  padding: 7px 9px;
}

.empty-state {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 260px;
  padding: 36px;
  border: 1px dashed var(--line-strong);
  border-radius: 8px;
  color: var(--muted);
  text-align: center;
}

.empty-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  margin-bottom: 14px;
  border-radius: 8px;
  background: var(--accent-tint);
  color: var(--accent);
}

.empty-state h2 {
  margin: 0 0 6px;
  color: var(--ink-2);
  font-size: 15px;
}

.empty-state p {
  margin: 0;
  font-size: 13px;
}

@media (max-width: 720px) {
  .dashboard-header {
    padding: 20px 18px;
  }

  .header-main {
    align-items: flex-start;
    flex-direction: column;
  }

  .header-actions {
    width: 100%;
  }

  .workspace-button {
    flex: 1;
  }

  .add-row {
  }

  .accounts {
    grid-template-columns: minmax(0, 1fr);
    padding: 18px 18px 32px;
  }
}
</style>
