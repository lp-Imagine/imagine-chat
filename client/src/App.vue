<template>
  <LoginPage v-if="!isAuthenticated" @login-success="onLoginSuccess" />
  <div v-else class="app-layout" :class="{ 'mobile-sidebar-open': isMobile && sidebarVisible }">
    <div v-if="isMobile && sidebarVisible" class="sidebar-backdrop" @click="closeSidebar" />
    <Sidebar
      :conversations="conversations"
      :active-id="activeId"
      :username="username"
      :theme-mode="themeMode"
      :mobile-open="sidebarVisible"
      :is-mobile="isMobile"
      @new-chat="onNewChat"
      @select="onSelectConv"
      @delete="deleteConv"
      @rename="renameConv"
      @pin="handlePin"
      @logout="onLogout"
      @toggle-theme="toggleTheme"
      @close-sidebar="closeSidebar"
      @open-settings="showSystemPrompt = true"
      @open-knowledge="showKnowledgeBase = true"
      @batch-delete="handleBatchDelete"
    />
    <ChatArea
      ref="chatAreaRef"
      :messages="activeMessages"
      :title="activeTitle"
      :loading="isLoading"
      :search-enabled="searchEnabled"
      :show-thinking="showThinking"
      :is-mobile="isMobile"
      @send="onSendMessage"
      @toggle-search="searchEnabled = !searchEnabled"
      @toggle-thinking="showThinking = !showThinking"
      @regenerate="onRegenerate"
      @reanswer="onReanswer"
      @copy-to-input="onCopyToInput"
      @switch-version="handleSwitchVersion"
      @edit-message="onEditMessage"
      @stop="handleStop"
      @open-sidebar="openSidebar"
      @card-confirm="onCardConfirm"
    />
    <SystemPromptDialog v-model="showSystemPrompt" />
    <KnowledgeBaseDialog v-model="showKnowledgeBase" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { isLoggedIn, getUser, clearAuth } from '@/utils/auth'
import { useTheme } from '@/composables/useTheme'
import { useMobile } from '@/composables/useMobile'
import { useChat } from '@/composables/useChat'
import Sidebar from './components/Sidebar.vue'
import ChatArea from './components/ChatArea.vue'
import LoginPage from './pages/LoginPage.vue'
import SystemPromptDialog from './components/SystemPromptDialog.vue'
import KnowledgeBaseDialog from './components/KnowledgeBaseDialog.vue'

const { mode: themeMode, toggle: toggleTheme } = useTheme()
const { isMobile } = useMobile()
const {
  conversations, activeId, activeMessages, activeTitle, isLoading,
  showThinking, searchEnabled,
  loadConversationList, selectConv, newChat, renameConv, deleteConv,
  handlePin, handleBatchDelete,
  sendMessage, handleStop, handleCardConfirm,
  handleEditMessage, handleReanswer, handleRegenerate, handleSwitchVersion,
} = useChat()

// ---- 认证状态 ----
const isAuthenticated = ref(isLoggedIn())
const username = ref(getUser()?.username || '')
const showSystemPrompt = ref(false)
const showKnowledgeBase = ref(false)

// ---- 移动端侧栏 ----
const sidebarVisible = ref(!isMobile.value)

function openSidebar() { sidebarVisible.value = true }
function closeSidebar() {
  if (isMobile.value) sidebarVisible.value = false
}

// ---- 聊天操作回调（注入 scrollToBottom） ----
const chatAreaRef = ref<{ setInputText: (t: string) => void; scrollToBottom: () => void }>()

function scrollToBottom() { chatAreaRef.value?.scrollToBottom() }

function onNewChat() { newChat(); closeSidebar() }
function onSelectConv(id: string) { selectConv(id); closeSidebar() }
function onSendMessage(content: string) { sendMessage(content, scrollToBottom) }
function onRegenerate(msgId: string) { handleRegenerate(msgId, scrollToBottom) }
function onReanswer(msgId: string) { handleReanswer(msgId, scrollToBottom) }
function onCopyToInput(content: string) { chatAreaRef.value?.setInputText(content) }
function onCardConfirm(message: string) { handleCardConfirm(message, scrollToBottom) }
function onEditMessage(msgId: string, newContent: string) { handleEditMessage(msgId, newContent, scrollToBottom) }

// ---- 认证回调 ----
function onLoginSuccess() {
  isAuthenticated.value = true
  username.value = getUser()?.username || ''
  loadConversationList()
}

function onLogout() {
  clearAuth()
  isAuthenticated.value = false
  username.value = ''
  conversations.value = []
  activeId.value = null
  activeMessages.value = []
  activeTitle.value = ''
}

onMounted(() => {
  if (isAuthenticated.value) loadConversationList()
})
</script>

<style scoped>
.app-layout {
  display: flex;
  height: 100vh;
  height: 100dvh;
  background: linear-gradient(150deg, #05050e 0%, #0a0a18 30%, #060610 55%, #08081a 100%);
}

.sidebar-backdrop {
  display: none;
}

@media (max-width: 768px) {
  .sidebar-backdrop {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 90;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(2px);
    -webkit-backdrop-filter: blur(2px);
    animation: fadeIn 0.25s ease;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
}
</style>
