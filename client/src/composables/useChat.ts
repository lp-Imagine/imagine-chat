import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import type { ChatMessage } from '@/types/chat'
import { api, type ConversationListItem } from '@/api'
import { generateId } from '@/utils/id'
import { useLocalStorageRef } from '@/composables/useLocalStorage'

// ========== 纯函数：消息处理 ==========

// 合并重新生成产生的重复 user+assistant 组，转为单条 assistant（多版本）
// 服务端每次 regenerate 会在末尾追加：user(同内容) + assistant(新回复)
// 结果：user(X), assistant(Y1), user(X), assistant(Y2), ...
// 前端将它们合并为：user(X), assistant(Y_N) { versions: [Y1, Y2, ...] }
function groupMessages(messages: ChatMessage[]): ChatMessage[] {
  const result: ChatMessage[] = []
  let i = 0
  while (i < messages.length) {
    const msg = messages[i]

    if (msg.role === 'user') {
      result.push(msg)
      i++

      const assistants: ChatMessage[] = []
      while (i < messages.length && messages[i].role === 'assistant') {
        assistants.push(messages[i])
        i++
      }

      // 检查后面是否有重复的 user(同内容) + assistant 组（重新生成产生）
      while (i < messages.length && messages[i].role === 'user' && messages[i].content === msg.content) {
        i++
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

// 查找 AI 消息及其对应的 user 消息对，用于重新生成/重新回答
function getPairForAiMessage(messages: ChatMessage[], aiMessageId: string) {
  const aiIdx = messages.findIndex(m => m.id === aiMessageId)
  if (aiIdx <= 0) return null
  const userMsg = messages[aiIdx - 1]
  if (userMsg.role !== 'user') return null
  return { aiIdx, userMsg }
}

// ========== useChat ==========

export function useChat() {
  // ---- 会话列表状态 ----
  const conversations = ref<ConversationListItem[]>([])
  const activeId = ref<string | null>(null)
  const activeMessages = ref<ChatMessage[]>([])
  const activeTitle = ref('')
  const isLoading = ref(false)
  const abortController = ref<AbortController | null>(null)

  // ---- 设置项（localStorage 持久化） ----
  const showThinking = useLocalStorageRef('showThinking', true)
  const searchEnabled = useLocalStorageRef('searchEnabled', false)
  const llmModel = useLocalStorageRef('llmModel', '')
  const llmTemperature = useLocalStorageRef('llmTemperature', 1.0)
  const llmTopP = useLocalStorageRef('llmTopP', 1.0)
  const llmContextRounds = useLocalStorageRef('llmContextRounds', 10)

  // ---- 从后端加载消息列表，做三种清洗 ----
  //   1. 跳过 tool 消息（前端不展示原始工具调用）
  //   2. 合并工具调用的中间 assistant 消息到后续的最终回复
  //   3. 清除旧版停止产生的空 assistant 残留
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
        if (m.role === 'assistant' && m.tool_calls && m.tool_calls.length > 0 && !m.interrupted && !(m as any).card_tool) {
          if (m.content) pendingContent += (pendingContent ? '\n' : '') + m.content
          if (m.reasoning_content) pendingReasoning += (pendingReasoning ? '\n' : '') + m.reasoning_content
          continue
        }
        if (m.role === 'assistant' && !m.content && !m.reasoning_content && !m.interrupted && !(m as any).card_tool) {
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

  // ---- 会话列表加载 ----
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

  // ---- 会话 CRUD ----

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
    } catch {
      ElMessage.error('创建对话失败')
    }
  }

  function selectConv(id: string) {
    if (id === activeId.value) return
    loadConversation(id)
  }

  async function renameConv(id: string, title: string) {
    try {
      await api.renameConversation(id, title)
      const conv = conversations.value.find(c => c.id === id)
      if (conv) conv.title = title
      if (activeId.value === id) activeTitle.value = title
    } catch {
      ElMessage.error('重命名失败')
    }
  }

  async function handlePin(id: string, pinned: boolean) {
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
      conversations.value.sort((a, b) => {
        if (a.pinned && !b.pinned) return -1
        if (!a.pinned && b.pinned) return 1
        return b.updatedAt - a.updatedAt
      })
    } catch (e: any) {
      ElMessage.error(e?.message || '操作失败')
    }
  }

  async function handleBatchDelete(ids: string[]) {
    try {
      await api.batchDeleteConversations(ids)
      const idSet = new Set(ids)
      conversations.value = conversations.value.filter(c => !idSet.has(c.id))
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

  // ---- 核心：SSE 流式消费 ----
  // existingMsgId 非空时复用已有消息（重新生成/重新回答场景）
  async function streamAiResponse(
    userContent: string,
    chatAreaScrollToBottom: () => void,
    existingMsgId?: string
  ) {
    const msgId = existingMsgId || generateId()

    if (!existingMsgId) {
      const aiMsg: ChatMessage = {
        id: msgId, role: 'assistant', content: '',
        reasoning_content: '', createdAt: Date.now(), loading: true
      }
      activeMessages.value = [...activeMessages.value, aiMsg]
    } else {
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
            if (parsed.error) throw new Error(parsed.error)

            if (parsed.token) {
              const msgs = [...activeMessages.value]
              const idx = msgs.findIndex(m => m.id === msgId)
              if (idx !== -1) msgs[idx] = { ...msgs[idx], content: msgs[idx].content + parsed.token }
              activeMessages.value = msgs
            }
            if (parsed.reasoning_token) {
              const msgs = [...activeMessages.value]
              const idx = msgs.findIndex(m => m.id === msgId)
              if (idx !== -1) msgs[idx] = { ...msgs[idx], reasoning_content: (msgs[idx].reasoning_content || '') + parsed.reasoning_token }
              activeMessages.value = msgs
            }
            if (parsed.card_tool) {
              const msgs = [...activeMessages.value]
              const idx = msgs.findIndex(m => m.id === msgId)
              if (idx !== -1) msgs[idx] = { ...msgs[idx], card_tool: parsed.card_tool }
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
            const stoppedVersion = { content: msgs[idx].content, reasoning_content: msgs[idx].reasoning_content || '', createdAt: msgs[idx].createdAt, interrupted: true }
            const versions = [...msgs[idx].versions!, stoppedVersion]
            msgs[idx] = { ...msgs[idx], versions, versionIndex: versions.length - 1, loading: false, interrupted: true }
          } else if (!existingMsgId && !msgs[idx].content && !msgs[idx].reasoning_content) {
            if (idx > 0 && msgs[idx - 1].role === 'user') msgs.splice(idx - 1, 2)
            else msgs.splice(idx, 1)
          } else {
            msgs[idx] = { ...msgs[idx], loading: false, interrupted: true }
          }
          activeMessages.value = msgs
        }
        return
      }
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
        const msgs = [...activeMessages.value]
        const idx = msgs.findIndex(m => m.id === msgId)
        if (idx !== -1) msgs[idx] = { ...msgs[idx], loading: false }
        activeMessages.value = msgs
      }
      ElMessage.error(e.message || '发送失败')
    } finally {
      isLoading.value = false
      abortController.value = null
      chatAreaScrollToBottom()
    }
  }

  // ---- 发送消息入口 ----
  async function sendMessage(content: string, chatAreaScrollToBottom: () => void) {
    if (!activeId.value) {
      try {
        const conv = await api.createConversation(content.slice(0, 20))
        conversations.value.unshift({ id: conv.id, title: conv.title, updatedAt: conv.updatedAt })
        activeId.value = conv.id
        activeMessages.value = []
        activeTitle.value = conv.title
      } catch {
        ElMessage.error('创建对话失败')
        return
      }
    }

    const userMsg: ChatMessage = {
      id: generateId(), role: 'user', content, createdAt: Date.now()
    }
    activeMessages.value = [...activeMessages.value, userMsg]

    const convItem = conversations.value.find(c => c.id === activeId.value)
    if (convItem) {
      convItem.title = content.slice(0, 30)
      convItem.updatedAt = Date.now()
    }

    await streamAiResponse(content, chatAreaScrollToBottom)
  }

  // ---- 停止生成 ----
  function handleStop() {
    if (activeId.value) api.stopMessage(activeId.value).catch(() => {})
    abortController.value?.abort()
  }

  // ---- 卡片确认 ----
  function handleCardConfirm(message: string, chatAreaScrollToBottom: () => void) {
    sendMessage(message, chatAreaScrollToBottom)
  }

  // ---- 编辑消息 ----
  async function handleEditMessage(messageId: string, newContent: string, chatAreaScrollToBottom: () => void) {
    if (isLoading.value) return

    const msgs = activeMessages.value
    const userIdx = msgs.findIndex(m => m.id === messageId)
    if (userIdx === -1 || msgs[userIdx].role !== 'user') return

    const originalContent = msgs[userIdx].content
    if (activeId.value) {
      try {
        await api.editMessage(activeId.value, messageId, newContent, originalContent)
      } catch {
        ElMessage.error('编辑失败')
        return
      }
    }

    const updatedUserMsg = { ...msgs[userIdx], content: newContent }
    activeMessages.value = msgs.slice(0, userIdx).concat(updatedUserMsg)

    await streamAiResponse(newContent, chatAreaScrollToBottom)
  }

  // ---- 重新回答（覆盖当前回复，不创建版本） ----
  async function handleReanswer(aiMessageId: string, chatAreaScrollToBottom: () => void) {
    if (isLoading.value) return

    const pair = getPairForAiMessage(activeMessages.value, aiMessageId)
    if (!pair) return

    activeMessages.value = activeMessages.value.map((m, i) =>
      i === pair.aiIdx ? { ...m, content: '', reasoning_content: '', interrupted: false, loading: true } : m
    )

    await streamAiResponse(pair.userMsg.content, chatAreaScrollToBottom, aiMessageId)
  }

  // ---- 重新生成（保存当前为版本，生成新回复） ----
  async function handleRegenerate(aiMessageId: string, chatAreaScrollToBottom: () => void) {
    if (isLoading.value) return

    const pair = getPairForAiMessage(activeMessages.value, aiMessageId)
    if (!pair) return

    const aiMsg = activeMessages.value[pair.aiIdx]
    const snapshot = { content: aiMsg.content, reasoning_content: aiMsg.reasoning_content || '', createdAt: aiMsg.createdAt, interrupted: aiMsg.interrupted || false }
    const versions = aiMsg.versions ? [...aiMsg.versions] : []

    if (versions.length === 0 || aiMsg.versionIndex === undefined) {
      versions.push(snapshot)
    } else {
      versions[aiMsg.versionIndex] = snapshot
    }
    // versionIndex 暂设为 versions.length（表示"正在生成新版本"）
    activeMessages.value = activeMessages.value.map((m, i) =>
      i === pair.aiIdx ? { ...m, versions, versionIndex: versions.length } : m
    )

    await streamAiResponse(pair.userMsg.content, chatAreaScrollToBottom, aiMessageId)

    // [DONE] 未触发时回退 versionIndex
    const currentMsgs = activeMessages.value
    const currentIdx = currentMsgs.findIndex(m => m.id === aiMessageId)
    if (currentIdx !== -1) {
      const msg = currentMsgs[currentIdx]
      if (msg.versions && msg.versionIndex === msg.versions.length) {
        currentMsgs[currentIdx] = { ...msg, versionIndex: msg.versions.length - 1 }
        activeMessages.value = currentMsgs
      }
    }
  }

  // ---- 版本切换 ----
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

    const updatedVersions = [...versions]
    updatedVersions[curIndex] = { content: msg.content, reasoning_content: msg.reasoning_content || '', createdAt: msg.createdAt, interrupted: msg.interrupted || false }

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

  return {
    // State
    conversations, activeId, activeMessages, activeTitle, isLoading,
    // Settings
    showThinking, searchEnabled,
    // Actions — 会话列表
    loadConversationList, selectConv, newChat, renameConv, deleteConv,
    handlePin, handleBatchDelete,
    // Actions — 消息
    sendMessage, handleStop, handleCardConfirm,
    handleEditMessage, handleReanswer, handleRegenerate, handleSwitchVersion,
  }
}
