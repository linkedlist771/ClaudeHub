<script setup lang="ts">
// Platform 接口定义
export interface Platform {
  id: string
  name: string
  url: string
  color: string
}

const props = defineProps<{
  platforms: Platform[]
  visible: boolean
  currentPlatformId?: string
}>()

const emit = defineEmits<{
  (e: 'select', platform: Platform): void
  (e: 'close'): void
}>()

function selectPlatform(platform: Platform) {
  emit('select', platform)
}

function handleOverlayClick(event: MouseEvent) {
  if ((event.target as HTMLElement).classList.contains('modal-overlay')) {
    emit('close')
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="modal-overlay" @click="handleOverlayClick">
      <div class="modal-content">
        <div class="modal-header">
          <h3>选择 Claude 账号</h3>
          <button class="close-btn" @click="$emit('close')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <div class="platform-list">
          <button
            v-for="platform in platforms"
            :key="platform.id"
            :class="['platform-item', { active: platform.id === currentPlatformId }]"
            :style="{ '--platform-color': platform.color }"
            @click="selectPlatform(platform)"
          >
            <span class="platform-indicator" :style="{ backgroundColor: platform.color }"></span>
            <span class="platform-name">{{ platform.name }}</span>
            <span class="platform-url">{{ platform.url }}</span>
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(31, 30, 27, 0.42);
  backdrop-filter: blur(3px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background-color: var(--surface);
  border: 1px solid var(--line);
  border-radius: 18px;
  width: 380px;
  max-width: 90vw;
  overflow: hidden;
  box-shadow: var(--shadow-lg);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 22px;
  border-bottom: 1px solid var(--line);
}

.modal-header h3 {
  margin: 0;
  font-family: var(--font-serif);
  font-size: 18px;
  font-weight: 500;
  color: var(--ink);
}

.close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: none;
  border-radius: 8px;
  background-color: transparent;
  color: var(--muted);
  cursor: pointer;
  transition: all 0.18s;
}

.close-btn:hover {
  background-color: var(--surface-alt);
  color: var(--ink);
}

.platform-list {
  padding: 10px;
}

.platform-item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px 14px;
  border: 1px solid transparent;
  border-radius: 11px;
  background-color: transparent;
  cursor: pointer;
  transition: all 0.18s;
  text-align: left;
}

.platform-item:hover {
  background-color: var(--surface-alt);
}

.platform-item.active {
  background-color: var(--clay-tint);
  border-color: var(--clay-soft);
}

.platform-indicator {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  flex-shrink: 0;
}

.platform-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--ink);
  flex-shrink: 0;
}

.platform-url {
  font-size: 12px;
  color: var(--faint);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>

