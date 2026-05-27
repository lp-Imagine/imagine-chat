<template>
  <aside class="sidebar" :class="{ 'mobile-open': mobileOpen, 'is-mobile': isMobile }">
    <div class="sidebar-header">
      <el-button
        v-if="isMobile"
        class="sidebar-close-btn"
        :icon="ArrowLeft"
        text
        @click="$emit('close-sidebar')"
      />
      <span class="sidebar-title">IMAGINE CHAT</span>
      <el-button
        type="primary"
        :icon="Plus"
        class="new-chat-btn"
        @click="$emit('new-chat')"
      >
        新对话
      </el-button>
    </div>

    <div class="search-box">
      <el-input
        v-model="searchQuery"
        placeholder="搜索对话..."
        :prefix-icon="Search"
        clearable
        size="small"
      />
    </div>

    <div v-if="conversations.length" class="manage-bar">
      <el-button
        text
        size="small"
        @click="toggleSelectMode"
        :type="selectMode ? 'primary' : undefined"
      >
        {{ selectMode ? '完成' : '管理' }}
      </el-button>
    </div>

    <div class="conversation-list">
      <div v-for="group in groupedConversations" :key="'g-' + group.label">
        <div class="time-group-header">{{ group.label }}</div>
        <div
          v-for="conv in group.items"
          :key="conv.id"
          class="conv-item"
          :class="{ active: activeId === conv.id, 'is-editing': editingId === conv.id }"
          @click="onConvClick(conv)"
        >
          <el-checkbox
            v-if="selectMode"
            :model-value="selectedIds.has(conv.id)"
            class="conv-checkbox"
            @click.stop
            @change="toggleSelect(conv.id)"
          />
          <div class="conv-info">
            <el-tooltip
              v-if="editingId !== conv.id"
              :content="conv.title"
              placement="top"
              :show-after="300"
              :disabled="conv.title.length <= 8"
            >
              <div class="conv-title">
                <el-icon v-if="conv.pinned" class="conv-pin-icon"><StarFilled /></el-icon>
                <span>{{ conv.title }}</span>
              </div>
            </el-tooltip>
            <!-- Mobile inline rename input -->
            <input
              v-else
              ref="editingInput"
              v-model="editingTitle"
              class="conv-rename-input"
              maxlength="50"
              @keyup.enter="submitInlineRename"
              @keyup.escape="cancelInlineRename"
              @blur="submitInlineRename"
              @click.stop
            />
          </div>
          <el-dropdown
            v-if="editingId !== conv.id && !selectMode"
            trigger="click"
            placement="bottom-end"
            :popper-style="dropdownPopperStyle"
            @command="handleCommand($event, conv)"
          >
            <el-button class="conv-more" :icon="MoreFilled" text size="small" @click.stop />
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="pin" :icon="Star">
                  {{ conv.pinned ? '取消置顶' : '置顶' }}
                </el-dropdown-item>
                <el-dropdown-item command="rename" :icon="Edit">
                  重命名
                </el-dropdown-item>
                <el-dropdown-item command="delete" :icon="Delete" divided class="conv-dropdown-delete">
                  删除
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </div>

      <div v-if="!conversations.length" class="empty-hint">
        暂无对话
      </div>
    </div>

    <!-- 重命名弹窗 -->
    <el-dialog
      v-model="renameDialogVisible"
      title="重命名"
      width="360px"
      :close-on-click-modal="true"
      append-to-body
    >
      <el-input
        ref="renameInput"
        v-model="renameTitle"
        placeholder="输入新标题"
        maxlength="50"
        show-word-limit
        @keyup.enter="submitRename"
      />
      <template #footer>
        <el-button @click="renameDialogVisible = false">取消</el-button>
        <el-button type="primary" :disabled="!renameTitle.trim()" @click="submitRename">确定</el-button>
      </template>
    </el-dialog>

    <!-- 批量选择操作栏 -->
    <div v-if="selectMode" class="select-bar">
      <el-button text size="small" @click="toggleSelectAll">
        {{ isAllSelected ? '取消全选' : '全选' }}
      </el-button>
      <el-button
        type="danger"
        size="small"
        :disabled="selectedIds.size === 0"
        @click="onBatchDelete"
      >
        删除{{ selectedIds.size ? ` (${selectedIds.size})` : '' }}
      </el-button>
    </div>

    <div class="sidebar-footer">
      <div class="user-info">
        <el-icon :size="18"><User /></el-icon>
        <span class="username">{{ username }}</span>
      </div>
      <div class="footer-actions">
        <el-dropdown trigger="click" placement="top-end" :popper-style="dropdownPopperStyle">
          <el-button text size="small" class="footer-more-btn">
            <el-icon :size="17"><MoreFilled /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item :icon="Folder" @click="$emit('open-knowledge')">知识库</el-dropdown-item>
              <el-dropdown-item :icon="Edit" @click="$emit('open-settings')">系统提示词</el-dropdown-item>
              <el-dropdown-item :icon="Moon" v-if="themeMode === 'dark'" @click="$emit('toggle-theme')">亮色主题</el-dropdown-item>
              <el-dropdown-item :icon="Sunny" v-else-if="themeMode === 'light'" @click="$emit('toggle-theme')">暗色主题</el-dropdown-item>
              <el-dropdown-item :icon="Setting" v-else @click="$emit('toggle-theme')">自动主题</el-dropdown-item>
              <el-dropdown-item divided class="footer-dropdown-logout" @click="$emit('logout')">退出登录</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { ref, nextTick, computed } from 'vue'
import { ElMessageBox } from 'element-plus'
import { Plus, Delete, Edit, User, Moon, Sunny, Setting, Star, StarFilled, MoreFilled, ArrowLeft, Search, Folder } from '@element-plus/icons-vue'
import { useTheme } from '@/composables/useTheme'
import type { ConversationListItem } from '@/api'

const { resolved: resolvedTheme } = useTheme()

const props = defineProps<{
  conversations: ConversationListItem[]
  activeId: string | null
  username: string
  themeMode: 'light' | 'dark' | 'auto'
  mobileOpen?: boolean
  isMobile?: boolean
}>()

const dropdownPopperStyle = computed(() => {
  if (resolvedTheme.value === 'light') {
    return {
      '--el-dropdown-menuItem-hover-fill': '#f3f4f6',
      '--el-dropdown-menuItem-hover-color': '#1e293b',
      '--el-text-color-regular': '#475569',
      background: 'rgba(255, 255, 255, 0.95)',
      border: '1px solid #e8ecf1',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.08)',
      backdropFilter: 'blur(18px)',
      borderRadius: '12px',
    }
  }
  return {
    '--el-dropdown-menuItem-hover-fill': 'rgba(255, 255, 255, 0.07)',
    '--el-dropdown-menuItem-hover-color': '#e8ecf1',
    '--el-text-color-regular': '#94a3b8',
    background: 'rgba(14, 14, 24, 0.95)',
    border: '1px solid rgba(255, 255, 255, 0.07)',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.55)',
    backdropFilter: 'blur(18px)',
    borderRadius: '12px',
  }
})

const emit = defineEmits<{
  'new-chat': []
  select: [id: string]
  delete: [id: string]
  rename: [id: string, title: string]
  'pin': [id: string, pinned: boolean]
  logout: []
  'toggle-theme': []
  'close-sidebar': []
  'open-settings': []
  'open-knowledge': []
  'batch-delete': [ids: string[]]
}>()

// ====== 批量选择 ======

const selectMode = ref(false)
const selectedIds = ref(new Set<string>())

const isAllSelected = computed(() => {
  const allIds = filteredConversations.value.map(c => c.id)
  return allIds.length > 0 && allIds.every(id => selectedIds.value.has(id))
})

function toggleSelectMode() {
  selectMode.value = !selectMode.value
  if (!selectMode.value) {
    selectedIds.value = new Set()
  }
}

function toggleSelect(id: string) {
  const next = new Set(selectedIds.value)
  if (next.has(id)) {
    next.delete(id)
  } else {
    next.add(id)
  }
  selectedIds.value = next
}

function toggleSelectAll() {
  if (isAllSelected.value) {
    selectedIds.value = new Set()
  } else {
    selectedIds.value = new Set(filteredConversations.value.map(c => c.id))
  }
}

async function onBatchDelete() {
  if (selectedIds.value.size === 0) return
  try {
    await ElMessageBox.confirm(
      `确定删除选中的 ${selectedIds.value.size} 个对话吗？删除后不可恢复。`,
      '批量删除',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' }
    )
    emit('batch-delete', [...selectedIds.value])
  } catch {
    // 取消
  }
}

// ====== 更多菜单 ======

function handleCommand(cmd: string, conv: ConversationListItem) {
  switch (cmd) {
    case 'pin':
      emit('pin', conv.id, !conv.pinned)
      break
    case 'rename':
      if (props.isMobile) {
        startInlineRename(conv)
      } else {
        openRenameDialog(conv)
      }
      break
    case 'delete':
      emit('delete', conv.id)
      break
  }
}

// ====== 重命名弹窗（桌面端） ======

const renameDialogVisible = ref(false)
const renameTitle = ref('')
const renamingId = ref<string | null>(null)
const renameInput = ref<InstanceType<typeof import('element-plus').ElInput>>()

function openRenameDialog(conv: ConversationListItem) {
  renamingId.value = conv.id
  renameTitle.value = conv.title
  renameDialogVisible.value = true
  nextTick(() => {
    renameInput.value?.focus()
  })
}

function submitRename() {
  const trimmed = renameTitle.value.trim()
  if (trimmed && renamingId.value) {
    emit('rename', renamingId.value, trimmed)
  }
  renameDialogVisible.value = false
}

// ====== 行内重命名（移动端） ======

const editingId = ref<string | null>(null)
const editingTitle = ref('')
const editingInput = ref<HTMLInputElement>()

function startInlineRename(conv: ConversationListItem) {
  editingId.value = conv.id
  editingTitle.value = conv.title
  nextTick(() => {
    editingInput.value?.focus()
    editingInput.value?.select()
  })
}

function submitInlineRename() {
  const trimmed = editingTitle.value.trim()
  if (trimmed && editingId.value) {
    emit('rename', editingId.value, trimmed)
  }
  editingId.value = null
}

function cancelInlineRename() {
  editingId.value = null
}

function onConvClick(conv: ConversationListItem) {
  if (editingId.value === conv.id) return
  if (selectMode.value) {
    toggleSelect(conv.id)
    return
  }
  emit('select', conv.id)
}

// ====== 时间分组 ======

interface TimeGroup {
  label: string
  items: ConversationListItem[]
}

const searchQuery = ref('')

const filteredConversations = computed<ConversationListItem[]>(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return props.conversations
  return props.conversations.filter(c => c.title.toLowerCase().includes(q))
})

const groupedConversations = computed<TimeGroup[]>(() => {
  const pinned: ConversationListItem[] = []
  const unpinned: ConversationListItem[] = []

  for (const conv of filteredConversations.value) {
    if (conv.pinned) {
      pinned.push(conv)
    } else {
      unpinned.push(conv)
    }
  }

  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const yesterdayStart = todayStart - 86400000
  const weekStart = todayStart - now.getDay() * 86400000
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime()

  const today: ConversationListItem[] = []
  const yesterday: ConversationListItem[] = []
  const thisWeek: ConversationListItem[] = []
  const thisMonth: ConversationListItem[] = []
  const older: ConversationListItem[] = []

  for (const conv of unpinned) {
    const ts = conv.updatedAt
    if (ts >= todayStart) {
      today.push(conv)
    } else if (ts >= yesterdayStart) {
      yesterday.push(conv)
    } else if (ts >= weekStart) {
      thisWeek.push(conv)
    } else if (ts >= monthStart) {
      thisMonth.push(conv)
    } else {
      older.push(conv)
    }
  }

  const groups: TimeGroup[] = []
  if (pinned.length) groups.push({ label: '置顶', items: pinned })
  if (today.length) groups.push({ label: '今天', items: today })
  if (yesterday.length) groups.push({ label: '昨天', items: yesterday })
  if (thisWeek.length) groups.push({ label: '本周', items: thisWeek })
  if (thisMonth.length) groups.push({ label: '本月', items: thisMonth })
  if (older.length) groups.push({ label: '更早', items: older })

  return groups
})
</script>

<style scoped>
.sidebar {
  width: 260px;
  height: 100%;
  background: var(--bg-sidebar);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  border-right: 1px solid var(--border-subtle);
}

.sidebar-header {
  padding: 16px;
  border-bottom: 1px solid var(--border-subtle);
  display: flex;
  align-items: center;
  gap: 8px;
}

.sidebar-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: 0.5px;
  white-space: nowrap;
}

.sidebar-close-btn {
  color: var(--text-muted);
  flex-shrink: 0;
}

.new-chat-btn {
  width: 100%;
  border-radius: 10px;
  height: 40px;
  font-size: 14px;
  font-weight: 500;
  background: var(--accent-gradient) !important;
  border: none !important;
  color: #fff !important;
}

.new-chat-btn:hover {
  box-shadow: 0 4px 16px var(--accent-glow);
  transform: translateY(-1px);
}

.search-box {
  padding: 8px 8px 0;
  flex-shrink: 0;
}

.search-box :deep(.el-input__wrapper) {
  background: var(--bg-surface);
  border: 1px solid var(--border-primary);
  border-radius: 10px;
  box-shadow: none;
  transition: border-color .2s, box-shadow .2s;
}

.search-box :deep(.el-input__wrapper:hover) {
  border-color: var(--border-focus);
}

.search-box :deep(.el-input__wrapper.is-focus) {
  border-color: var(--border-focus);
  box-shadow: 0 0 0 2px var(--accent-ring);
}

.search-box :deep(.el-input__inner) {
  color: var(--text-primary);
  caret-color: var(--accent);
}

.search-box :deep(.el-input__inner::placeholder) {
  color: var(--text-placeholder);
}

.search-box :deep(.el-input__prefix) {
  color: var(--text-muted);
}

.search-box :deep(.el-input__clear) {
  color: var(--text-muted);
}

.manage-bar {
  padding: 6px 12px;
  display: flex;
  justify-content: flex-end;
}

.conversation-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.time-group-header {
  padding: 16px 12px 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  letter-spacing: 0.5px;
}

.conv-item {
  display: flex;
  align-items: center;
  padding: 10px 12px;
  border-radius: 10px;
  cursor: pointer;
  transition: all .15s;
  margin-bottom: 2px;
  position: relative;
}

.conv-item:hover {
  background: var(--bg-surface-hover);
}

.conv-item.active {
  background: var(--bg-surface-active);
  box-shadow: inset 3px 0 0 var(--accent);
  border-radius: 10px;
  padding-left: 9px;
}

.conv-info {
  flex: 1;
  min-width: 0;
}

.conv-info :deep(.el-tooltip__trigger) {
  display: block;
  max-width: 100%;
}

.conv-title {
  color: var(--text-secondary);
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: color .15s;
  display: block;
}

.conv-item:hover .conv-title {
  color: var(--text-primary);
}

.conv-item.active .conv-title {
  color: var(--text-primary);
  font-weight: 500;
}

.conv-pin-icon {
  color: var(--accent-light);
  font-size: 13px;
  margin-right: 4px;
  vertical-align: -1px;
}

.conv-more {
  opacity: 0;
  transition: opacity .15s;
  color: var(--text-muted);
  flex-shrink: 0;
}

.conv-item:hover .conv-more {
  opacity: 1;
}

.conv-rename-input {
  width: 100%;
  height: 28px;
  padding: 2px 8px;
  font-size: 13px;
  color: var(--text-primary);
  background: var(--bg-input);
  border: 1px solid var(--border-focus);
  border-radius: 6px;
  outline: none;
  box-sizing: border-box;
}

.conv-rename-input::placeholder {
  color: var(--text-placeholder);
}

.empty-hint {
  color: var(--text-muted);
  text-align: center;
  margin-top: 40px;
  font-size: 14px;
}

/* 批量选择 */
.select-bar {
  padding: 10px 12px;
  border-top: 1px solid var(--border-subtle);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  background: var(--bg-surface);
}

.conv-checkbox {
  flex-shrink: 0;
  margin-right: 8px;
}

.sidebar-footer {
  padding: 12px 16px;
  border-top: 1px solid var(--border-subtle);
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: transparent;
  color: var(--text-secondary);
}

.user-info {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
}

.username {
  font-weight: 500;
  color: var(--text-secondary);
}

.footer-actions {
  display: flex;
  align-items: center;
}

.footer-more-btn {
  color: var(--text-muted);
  transition: color .15s;
}

.footer-more-btn:hover {
  color: var(--text-primary);
}

/* ====== 移动端：侧边栏变为浮层抽屉 ====== */
@media (max-width: 768px) {
  .sidebar {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    z-index: 100;
    width: 85vw;
    max-width: 320px;
    background: var(--bg-glass);
    border-right: 1px solid var(--border-primary);
    transform: translateX(-100%);
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .sidebar.mobile-open {
    transform: translateX(0);
    box-shadow: 4px 0 32px rgba(0, 0, 0, 0.3);
  }

  .sidebar-header {
    padding: 12px;
    gap: 6px;
  }

  .sidebar-title {
    display: block;
    flex: 1;
  }

  .new-chat-btn {
    height: 36px;
    font-size: 13px;
    border-radius: 8px;
  }

  .sidebar-close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
  }

  .search-box {
    padding: 6px 6px 0;
  }

  .conversation-list {
    padding: 6px;
  }

  .conv-item {
    padding: 10px 12px;
    border-radius: 8px;
  }

  .conv-item.is-editing {
    padding-right: 12px;
  }

  .conv-rename-input {
    width: 100%;
    height: 28px;
    padding: 2px 8px;
    font-size: 13px;
    color: var(--text-primary);
    background: var(--bg-input);
    border: 1px solid var(--border-focus);
    border-radius: 6px;
    outline: none;
    box-sizing: border-box;
  }

  .conv-rename-input::placeholder {
    color: var(--text-placeholder);
  }

  /* 移动端始终显示三点操作按钮，加大可点击区域 */
  .conv-more {
    opacity: 0.7;
    width: 32px;
    height: 32px;
    font-size: 18px;
  }

  .sidebar-footer {
    padding: 10px 12px;
  }
}
</style>

<!-- 下拉菜单样式（非 scoped，el-dropdown popper 经 teleport 渲染到 body 下） -->
<style>
/* 删除项始终红色 */
.conv-dropdown-delete {
  color: #f56c6c !important;
}

.conv-dropdown-delete:hover {
  background: rgba(245, 108, 108, 0.1) !important;
  color: #f56c6c !important;
}
</style>
