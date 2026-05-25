<template>
  <LoginPage v-if="!isAuthenticated" @login-success="onLoginSuccess" />
  <div v-else class="app-layout" :class="{ 'mobile-sidebar-open': isMobile && sidebarVisible }">
    <!-- Mobile sidebar backdrop -->
    <div v-if="isMobile && sidebarVisible" class="sidebar-backdrop" @click="closeSidebar" />
    <Sidebar
      :conversations="conversations"
      :active-id="activeId"
      :username="username"
      :theme-mode="themeMode"
      :mobile-open="sidebarVisible"
      :is-mobile="isMobile"
      @new-chat="newChat"
      @select="selectConv"
      @delete="deleteConv"
      @rename="renameConv"
      @pin="handlePin"
      @logout="onLogout"
      @toggle-theme="toggleTheme"
      @close-sidebar="closeSidebar"
      @open-settings="showSystemPrompt = true"
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
      @send="sendMessage"
      @toggle-search="searchEnabled = !searchEnabled"
      @toggle-thinking="showThinking = !showThinking"
      @regenerate="handleRegenerate"
      @reanswer="handleReanswer"
      @copy-to-input="handleCopyToInput"
      @switch-version="handleSwitchVersion"
      @edit-message="handleEditMessage"
      @stop="handleStop"
      @open-sidebar="openSidebar"
    />
    <SystemPromptDialog v-model="showSystemPrompt" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import type { ChatMessage } from '@/types/chat'
import { api, type ConversationListItem } from '@/api'
import { isLoggedIn, getUser, clearAuth } from '@/utils/auth'
import { generateId } from '@/utils/id'
import { useTheme } from '@/composables/useTheme'
import { useLocalStorageRef } from '@/composables/useLocalStorage'
import { useMobile } from '@/composables/useMobile'
import Sidebar from './components/Sidebar.vue'
import ChatArea from './components/ChatArea.vue'
import LoginPage from './pages/LoginPage.vue'
import SystemPromptDialog from './components/SystemPromptDialog.vue'

const { mode: themeMode, toggle: toggleTheme } = useTheme()

const isAuthenticated = ref(isLoggedIn())
const username = ref(getUser()?.username || '')

const conversations = ref<ConversationListItem[]>([])
const activeId = ref<string | null>(null)
const activeMessages = ref<ChatMessage[]>([])
const activeTitle = ref('')
const isLoading = ref(false)
const showThinking = useLocalStorageRef('showThinking', true)
const searchEnabled = useLocalStorageRef('searchEnabled', false)
const llmModel = useLocalStorageRef('llmModel', '')
const llmTemperature = useLocalStorageRef('llmTemperature', 1.0)
const llmTopP = useLocalStorageRef('llmTopP', 1.0)
const llmContextRounds = useLocalStorageRef('llmContextRounds', 10)

const chatAreaRef = ref()
const abortController = ref<AbortController | null>(null)
const showSystemPrompt = ref(false)

// ====== 移动端适配 ======

const { isMobile } = useMobile()
const sidebarVisible = ref(!isMobile.value)

function openSidebar() {
  sidebarVisible.value = true
}

function closeSidebar() {
  if (isMobile.value) sidebarVisible.value = false
}

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

async function loadConversationList() {
  try {
    conversations.value = await api.getConversations()
    if (conversations.value.length) {
      await loadConversation(conversations.value[0].id)
    }
  } catch {
    ElMessage.error('加载对话列表失败')
  }
}

// 页面加载时：已登录则加载会话列表
onMounted(() => {
  if (isAuthenticated.value) {
    loadConversationList()
  }
})

// 合并重新生成产生的重复 user+assistant 组
// 服务端每次 regenerate 会追加一条 user(同内容) + assistant，导致格式为：
//   user(X), assistant(Y1), user(X), assistant(Y2), ...
// 将所有与第一条 user 内容相同的后续轮次合并为一个 assistant（多版本）
function groupMessages(messages: ChatMessage[]): ChatMessage[] {
  const result: ChatMessage[] = []
  let i = 0
  while (i < messages.length) {
    const msg = messages[i]

    if (msg.role === 'user') {
      result.push(msg)
      i++

      // 收集紧接在这条 user 后的所有 assistant 回复
      const assistants: ChatMessage[] = []
      while (i < messages.length && messages[i].role === 'assistant') {
        assistants.push(messages[i])
        i++
      }

      // 检查后面是否有重复的 user(同内容) + assistant 组（再生成功产生）
      while (i < messages.length && messages[i].role === 'user' && messages[i].content === msg.content) {
        i++ // 跳过重复的 user
        if (i < messages.length && messages[i].role === 'assistant') {
          assistants.push(messages[i])
          i++
        }
      }

      if (assistants.length === 1) {
        result.push(assistants[0])
      } else if (assistants.length > 1) {
        const versions = assistants.map(m => ({
          content: m.content,
          reasoning_content: m.reasoning_content || '',
          createdAt: m.createdAt,
          interrupted: m.interrupted || false
        }))
        const last = assistants[assistants.length - 1]
        result.push({
          ...last,
          interrupted: versions[versions.length - 1].interrupted,
          versions,
          versionIndex: versions.length - 1
        })
      }
    } else {
      result.push(msg)
      i++
    }
  }
  return result
}

// 从后端加载指定会话的完整消息列表
async function loadConversation(id: string) {
  activeId.value = id
  try {
    const conv = await api.getConversation(id)
    const raw = conv.messages
    const filtered: ChatMessage[] = []
    let pendingReasoning = ''
    let pendingContent = ''
    for (let i = 0; i < raw.length; i++) {
      const m = raw[i]
      if (m.role === 'tool') continue
      if (m.role === 'assistant' && m.tool_calls && m.tool_calls.length > 0 && !m.interrupted) {
        // 工具调用的中间 assistant：保留 content/reasoning 合并到后续消息
        if (m.content) pendingContent += (pendingContent ? '\n' : '') + m.content
        if (m.reasoning_content) pendingReasoning += (pendingReasoning ? '\n' : '') + m.reasoning_content
        continue
      }
      if (m.role === 'assistant' && !m.content && !m.reasoning_content && !m.interrupted) {
        // 无内容的空 assistant（旧版停止残留），删除对应的 user 消息
        while (filtered.length > 0 && filtered[filtered.length - 1].role !== 'user') {
          filtered.pop()
        }
        if (filtered.length > 0) filtered.pop()
        continue
      }
      if ((pendingContent || pendingReasoning) && m.role === 'assistant') {
        const merged = { ...m }
        if (pendingContent) {
          merged.content = pendingContent + '\n' + (m.content || '')
          pendingContent = ''
        }
        if (pendingReasoning) {
          merged.reasoning_content = pendingReasoning + '\n' + (m.reasoning_content || '')
          pendingReasoning = ''
        }
        filtered.push(merged)
        continue
      }
      filtered.push(m)
    }
    activeMessages.value = groupMessages(filtered)
    activeTitle.value = conv.title
  } catch {
    ElMessage.error('加载对话失败')
  }
}

// 新建空白会话
async function newChat() {
  try {
    const conv = await api.createConversation()
    conversations.value.unshift({
      id: conv.id,
      title: conv.title,
      updatedAt: conv.updatedAt
    })
    activeId.value = conv.id
    activeMessages.value = []
    activeTitle.value = conv.title
    closeSidebar()
  } catch {
    ElMessage.error('创建对话失败')
  }
}

// 切换当前活跃会话
function selectConv(id: string) {
  if (id === activeId.value) return
  loadConversation(id)
  closeSidebar()
}

// 重命名会话（同步更新侧边栏和顶部标题）
async function renameConv(id: string, title: string) {
  try {
    await api.renameConversation(id, title)
    const conv = conversations.value.find(c => c.id === id)
    if (conv) {
      conv.title = title
    }
    if (activeId.value === id) {
      activeTitle.value = title
    }
  } catch {
    ElMessage.error('重命名失败')
  }
}

// 置顶/取消置顶
async function handlePin(id: string, pinned: boolean) {
  console.log('[handlePin] id:', id, 'pinned:', pinned, 'type:', typeof id)
  if (!id) {
    ElMessage.error('操作失败：会话ID为空')
    return
  }
  try {
    const res = await api.pinConversation(id, pinned)
    const conv = conversations.value.find(c => c.id === id)
    if (conv) {
      conv.pinned = res.pinned
      conv.updatedAt = Date.now()
    }
    // 重新排序：置顶优先，然后按更新时间
    conversations.value.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1
      if (!a.pinned && b.pinned) return 1
      return b.updatedAt - a.updatedAt
    })
  } catch (e: any) {
    ElMessage.error(e?.message || '操作失败')
  }
}

// 批量删除会话
async function handleBatchDelete(ids: string[]) {
  try {
    await api.batchDeleteConversations(ids)
    // 从本地列表移除
    const idSet = new Set(ids)
    conversations.value = conversations.value.filter(c => !idSet.has(c.id))
    // 如果当前活跃会话被删除，切换到下一个
    if (activeId.value && idSet.has(activeId.value)) {
      const next = conversations.value[0]
      if (next) {
        await loadConversation(next.id)
      } else {
        activeId.value = null
        activeMessages.value = []
        activeTitle.value = ''
      }
    }
    ElMessage.success(`已删除 ${ids.length} 个对话`)
  } catch {
    ElMessage.error('批量删除失败')
  }
}

// 删除会话，若删除的是当前活跃会话则自动切换到下一个
async function deleteConv(id: string) {
  try {
    await api.deleteConversation(id)
    const idx = conversations.value.findIndex((c) => c.id === id)
    if (idx !== -1) conversations.value.splice(idx, 1)
    if (activeId.value === id) {
      const next = conversations.value[0]
      if (next) {
        await loadConversation(next.id)
      } else {
        activeId.value = null
        activeMessages.value = []
        activeTitle.value = ''
      }
    }
  } catch {
    ElMessage.error('删除对话失败')
  }
}

// 核心：流式消费 SSE，创建 AI placeholder 并逐 token 更新
// existingMsgId 非空时复用已有消息（重新生成场景），而非创建新消息
async function streamAiResponse(userContent: string, existingMsgId?: string) {
  const msgId = existingMsgId || generateId()

  if (!existingMsgId) {
    const aiMsg: ChatMessage = {
      id: msgId,
      role: 'assistant',
      content: '',
      reasoning_content: '',
      createdAt: Date.now(),
      loading: true
    }
    activeMessages.value = [...activeMessages.value, aiMsg]
  } else {
    // 重新生成：清空已有消息的内容，状态切回 loading
    const msgs = [...activeMessages.value]
    const idx = msgs.findIndex(m => m.id === msgId)
    if (idx !== -1) {
      msgs[idx] = { ...msgs[idx], content: '', reasoning_content: '', loading: true }
      activeMessages.value = msgs
    }
  }
  isLoading.value = true

  const convItem = conversations.value.find(c => c.id === activeId.value)

  abortController.value = new AbortController()

  try {
    const response = await api.sendMessageStream(
      activeId.value!,
      userContent,
      searchEnabled.value,
      showThinking.value,
      abortController.value.signal,
      llmModel.value || undefined,
      llmTemperature.value,
      llmTopP.value,
      llmContextRounds.value
    )

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: '请求失败' }))
      throw new Error(err.error || `HTTP ${response.status}`)
    }

    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const payload = line.slice(6)

        if (payload === '[DONE]') {
          const msgs = [...activeMessages.value]
          const idx = msgs.findIndex(m => m.id === msgId)
          if (idx !== -1) {
            const msg = msgs[idx]
            if (msg.versions && msg.versionIndex === msg.versions.length && msg.content) {
              // 重新生成完成：将新回复推入 versions
              const newSnapshot = { content: msg.content, reasoning_content: msg.reasoning_content || '', createdAt: msg.createdAt, interrupted: msg.interrupted || false }
              msgs[idx] = { ...msg, versions: [...msg.versions, newSnapshot], versionIndex: msg.versions.length, loading: false, interrupted: false }
            } else {
              msgs[idx] = { ...msg, loading: false }
            }
          }
          activeMessages.value = msgs
          if (convItem) convItem.updatedAt = Date.now()
          return
        }

        try {
          const parsed = JSON.parse(payload)
          if (parsed.error) {
            throw new Error(parsed.error)
          }
          if (parsed.token) {
            const msgs = [...activeMessages.value]
            const idx = msgs.findIndex(m => m.id === msgId)
            if (idx !== -1) {
              msgs[idx] = { ...msgs[idx], content: msgs[idx].content + parsed.token }
            }
            activeMessages.value = msgs
          }
          if (parsed.reasoning_token) {
            const msgs = [...activeMessages.value]
            const idx = msgs.findIndex(m => m.id === msgId)
            if (idx !== -1) {
              msgs[idx] = { ...msgs[idx], reasoning_content: (msgs[idx].reasoning_content || '') + parsed.reasoning_token }
            }
            activeMessages.value = msgs
          }
        } catch (e: any) {
          if (e.message && !e.message.includes('JSON')) {
            activeMessages.value = activeMessages.value.filter(m => m.id !== msgId)
            ElMessage.error(e.message || '发送失败')
            throw e
          }
        }
      }
    }

    // 流结束但没有收到 [DONE] → 手动结束 loading
    const msgs = [...activeMessages.value]
    const idx = msgs.findIndex(m => m.id === msgId)
    if (idx !== -1) {
      const msg = msgs[idx]
      if (msg.versions && msg.versionIndex === msg.versions.length && msg.content) {
        const newSnapshot = { content: msg.content, reasoning_content: msg.reasoning_content || '', createdAt: msg.createdAt, interrupted: msg.interrupted || false }
        msgs[idx] = { ...msg, versions: [...msg.versions, newSnapshot], versionIndex: msg.versions.length, loading: false, interrupted: false }
      } else {
        msgs[idx] = { ...msg, loading: false }
      }
    }
    activeMessages.value = msgs
    if (convItem) convItem.updatedAt = Date.now()
  } catch (e: any) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      const msgs = [...activeMessages.value]
      const idx = msgs.findIndex(m => m.id === msgId)
      if (idx !== -1) {
        if (existingMsgId && msgs[idx].versions && msgs[idx].versions.length > 0) {
          // 重新生成中断：将停止时的内容保存为新版本，标记已终止
          const stoppedVersion = {
            content: msgs[idx].content,
            reasoning_content: msgs[idx].reasoning_content || '',
            createdAt: msgs[idx].createdAt,
            interrupted: true
          }
          const versions = [...msgs[idx].versions!, stoppedVersion]
          msgs[idx] = { ...msgs[idx], versions, versionIndex: versions.length - 1, loading: false, interrupted: true }
        } else if (!existingMsgId && !msgs[idx].content && !msgs[idx].reasoning_content) {
          // 完全空响应（无内容无推理）：移除助手和对应的用户提问
          if (idx > 0 && msgs[idx - 1].role === 'user') {
            msgs.splice(idx - 1, 2)
          } else {
            msgs.splice(idx, 1)
          }
        } else {
          // 普通消息/重新回答中断：保留已生成的部分内容，标记为已终止
          msgs[idx] = { ...msgs[idx], loading: false, interrupted: true }
        }
        activeMessages.value = msgs
      }
      return
    }
    // 重新生成/重新回答失败：有版本则恢复，无版本则标记已终止
    if (existingMsgId) {
      const msgs = [...activeMessages.value]
      const idx = msgs.findIndex(m => m.id === msgId)
      if (idx !== -1) {
        const msg = msgs[idx]
        if (msg.versions && msg.versions.length > 0) {
          const lastVersion = msg.versions[msg.versions.length - 1]
          msgs[idx] = { ...msg, ...lastVersion, loading: false, versions: msg.versions, versionIndex: msg.versions.length - 1 }
        } else {
          msgs[idx] = { ...msg, loading: false, interrupted: true }
        }
        activeMessages.value = msgs
      }
    } else {
      // 普通消息失败：保留已生成的部分内容
      const msgs = [...activeMessages.value]
      const idx = msgs.findIndex(m => m.id === msgId)
      if (idx !== -1) {
        msgs[idx] = { ...msgs[idx], loading: false }
      }
      activeMessages.value = msgs
    }
    ElMessage.error(e.message || '发送失败')
  } finally {
    isLoading.value = false
    abortController.value = null
    chatAreaRef.value?.scrollToBottom()
  }
}

// 发送消息入口：创建会话（如需要）→ 添加用户消息 → 触发 AI 流式回复
async function sendMessage(content: string) {
  if (!activeId.value) {
    try {
      const conv = await api.createConversation(content.slice(0, 20))
      conversations.value.unshift({
        id: conv.id,
        title: conv.title,
        updatedAt: conv.updatedAt
      })
      activeId.value = conv.id
      activeMessages.value = []
      activeTitle.value = conv.title
    } catch {
      ElMessage.error('创建对话失败')
      return
    }
  }

  const userMsg: ChatMessage = {
    id: generateId(),
    role: 'user',
    content,
    createdAt: Date.now()
  }
  activeMessages.value = [...activeMessages.value, userMsg]

  const convItem = conversations.value.find(c => c.id === activeId.value)
  if (convItem) {
    convItem.title = content.slice(0, 30)
    convItem.updatedAt = Date.now()
  }

  await streamAiResponse(content)
}

// 中断当前生成：先通知服务端标记 interrupted，再 abort fetch
function handleStop() {
  if (activeId.value) {
    api.stopMessage(activeId.value).catch(() => {})
  }
  abortController.value?.abort()
}

// 将用户消息内容复制到输入框
function handleCopyToInput(content: string) {
  chatAreaRef.value?.setInputText(content)
}

// 编辑用户消息：更新内容 → 截断后续 → 重新生成 AI 回复
async function handleEditMessage(messageId: string, newContent: string) {
  if (isLoading.value) return

  const msgs = activeMessages.value
  const userIdx = msgs.findIndex(m => m.id === messageId)
  if (userIdx === -1 || msgs[userIdx].role !== 'user') return

  // 持久化到服务端（更新内容 + 截断后续）
  const originalContent = msgs[userIdx].content
  if (activeId.value) {
    try {
      await api.editMessage(activeId.value, messageId, newContent, originalContent)
    } catch {
      ElMessage.error('编辑失败')
      return
    }
  }

  // 更新用户消息内容，截断后续消息
  const updatedUserMsg = { ...msgs[userIdx], content: newContent }
  activeMessages.value = msgs.slice(0, userIdx).concat(updatedUserMsg)

  await streamAiResponse(newContent)
}

// 查找 AI 消息及其对应的 user 消息对，用于重新生成/重新回答
function getPairForAiMessage(aiMessageId: string) {
  const msgs = activeMessages.value
  const aiIdx = msgs.findIndex(m => m.id === aiMessageId)
  if (aiIdx <= 0) return null
  const userMsg = msgs[aiIdx - 1]
  if (userMsg.role !== 'user') return null
  return { aiIdx, userMsg }
}

// 重新回答：中断后重新生成，直接覆盖当前回复（不创建版本快照）
async function handleReanswer(aiMessageId: string) {
  if (isLoading.value) return

  const pair = getPairForAiMessage(aiMessageId)
  if (!pair) return

  // 清空当前回复，清除中断标记，开始流式更新
  activeMessages.value = activeMessages.value.map((m, i) =>
    i === pair.aiIdx ? { ...m, content: '', reasoning_content: '', interrupted: false, loading: true } : m
  )

  await streamAiResponse(pair.userMsg.content, aiMessageId)
}

// 重新生成：保存当前回复 → 清空消息 → 流式生成新回复
// versions 包含所有版本（含当前），versionIndex 始终在 [0, versions.length) 范围
// 生成期间 versionIndex 暂设为 versions.length（超出末尾），[DONE] 时推入新版本
async function handleRegenerate(aiMessageId: string) {
  if (isLoading.value) return

  const pair = getPairForAiMessage(aiMessageId)
  if (!pair) return

  const aiMsg = activeMessages.value[pair.aiIdx]

  const snapshot = {
    content: aiMsg.content,
    reasoning_content: aiMsg.reasoning_content || '',
    createdAt: aiMsg.createdAt,
    interrupted: aiMsg.interrupted || false
  }
  const versions = aiMsg.versions ? [...aiMsg.versions] : []
  if (versions.length === 0 || aiMsg.versionIndex === undefined) {
    // 首次重新生成：将当前回复作为第一个版本
    versions.push(snapshot)
  } else {
    // 非首次：更新当前槽位内容（避免 push 导致重复）
    versions[aiMsg.versionIndex] = snapshot
  }
  // versionIndex 暂设为 versions.length（超出末尾），标记"正在生成新版本"
  activeMessages.value = activeMessages.value.map((m, i) =>
    i === pair.aiIdx ? { ...m, versions, versionIndex: versions.length } : m
  )

  await streamAiResponse(pair.userMsg.content, aiMessageId)

  // streamAiResponse 的 [DONE] 已原子地推入新版本；若未触发（异常中断），回退 versionIndex
  const currentMsgs = activeMessages.value
  const currentIdx = currentMsgs.findIndex(m => m.id === aiMessageId)
  if (currentIdx !== -1) {
    const msg = currentMsgs[currentIdx]
    if (msg.versions && msg.versionIndex === msg.versions.length) {
      // [DONE] 未触发：versionIndex 仍超出末尾，需回退
      currentMsgs[currentIdx] = { ...msg, versionIndex: msg.versions.length - 1 }
      activeMessages.value = currentMsgs
    }
  }
}

// 版本切换：在 versions 数组中前后导航（所有版本都在 versions 中）
function handleSwitchVersion(messageId: string, direction: 'prev' | 'next') {
  const msgs = [...activeMessages.value]
  const idx = msgs.findIndex(m => m.id === messageId)
  if (idx === -1) return

  const msg = msgs[idx]
  if (!msg.versions || msg.versionIndex === undefined) return

  const versions = msg.versions
  const curIndex = msg.versionIndex
  const targetIndex = direction === 'prev' ? curIndex - 1 : curIndex + 1
  if (targetIndex < 0 || targetIndex >= versions.length) return

  // 将当前显示的内容写回当前槽位
  const updatedVersions = [...versions]
  updatedVersions[curIndex] = {
    content: msg.content,
    reasoning_content: msg.reasoning_content || '',
    createdAt: msg.createdAt,
    interrupted: msg.interrupted || false
  }

  const targetVersion = updatedVersions[targetIndex]
  msgs[idx] = {
    ...msg,
    content: targetVersion.content,
    reasoning_content: targetVersion.reasoning_content,
    createdAt: targetVersion.createdAt,
    interrupted: targetVersion.interrupted || false,
    versions: updatedVersions,
    versionIndex: targetIndex
  }
  activeMessages.value = msgs
}
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
