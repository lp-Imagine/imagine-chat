// 后端 API 封装层
// - 开发环境：Vite dev server proxy 将 /api/* 转发到 localhost:3000
// - 生产环境：直连 Railway 部署的后端 URL
// - request<T> 泛型封装：自动携带 JWT、处理 401 过期刷新
// - sendMessageStream 返回原始 Response 供 SSE ReadableStream 消费
// - uploadAttachment 用 XMLHttpRequest 实现进度回调
import type { Attachment, ChatMessage, Conversation, KnowledgeDoc, KnowledgeSearchResult, MemoryRecord } from '@/types/chat'
import { getToken, clearAuth } from '@/utils/auth'

const API_URL = import.meta.env.DEV
  ? '/api'
  : 'https://imagine-chat-production.up.railway.app/api'

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = getToken()
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  return headers
}

// 通用 JSON 请求封装：自动拼接 API_URL、携带 Token、处理 401 过期
async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${url}`, {
    headers: authHeaders(),
    ...options
  })
  if (res.status === 401) {
    clearAuth()
    window.location.reload()
    throw new Error('登录已过期，请重新登录')
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: '请求失败' }))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.json()
}

export interface ConversationListItem {
  id: string
  title: string
  updatedAt: number
  pinned?: boolean
}

export const api = {
  // 用户登录
  async login(username: string, password: string) {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: '请求失败' }))
      throw new Error(err.error || `HTTP ${res.status}`)
    }
    return res.json() as Promise<{ token: string; user: { username: string } }>
  },

  // 用户注册
  async register(username: string, password: string) {
    const res = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: '请求失败' }))
      throw new Error(err.error || `HTTP ${res.status}`)
    }
    return res.json() as Promise<{ token: string; user: { username: string } }>
  },

  // 获取会话列表
  getConversations() {
    return request<ConversationListItem[]>(`/conversations`)
  },

  // 创建新会话
  createConversation(title?: string) {
    return request<Conversation>('/conversations', {
      method: 'POST',
      body: JSON.stringify({ title })
    })
  },

  // 删除会话
  deleteConversation(id: string) {
    return request<{ success: boolean }>(`/conversations?id=${id}`, {
      method: 'DELETE'
    })
  },

  // 批量删除会话
  batchDeleteConversations(ids: string[]) {
    return request<{ success: boolean; deleted: number }>('/conversations/batch', {
      method: 'DELETE',
      body: JSON.stringify({ ids })
    })
  },

  // 重命名会话
  renameConversation(id: string, title: string) {
    return request<{ success: boolean; title: string }>('/conversations', {
      method: 'PUT',
      body: JSON.stringify({ id, title })
    })
  },

  // 置顶/取消置顶
  pinConversation(id: string, pinned: boolean) {
    return request<{ success: boolean; pinned: boolean }>('/conversations', {
      method: 'PUT',
      body: JSON.stringify({ id, pinned })
    })
  },

  // 获取会话详情（含消息列表）
  getConversation(id: string) {
    return request<Conversation>(`/conversations/detail?id=${id}`)
  },

  // 发送消息（非流式，一般不用）
  sendMessage(conversationId: string, content: string) {
    return request<ChatMessage>('/conversations/messages', {
      method: 'POST',
      body: JSON.stringify({ id: conversationId, content })
    })
  },

  // 发送消息（SSE 流式），返回原始 fetch Response 供 ReadableStream 逐行消费
  // signal 用于 AbortController，支持用户中途停止生成
  sendMessageStream(conversationId: string, content: string, searchEnabled = false, thinkingEnabled = true, signal?: AbortSignal, model?: string, temperature?: number, topP?: number, contextRounds?: number, attachments?: Attachment[]) {
    return fetch(`${API_URL}/conversations/messages`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ id: conversationId, content, searchEnabled, thinkingEnabled, model, temperature, topP, contextRounds, attachments }),
      signal
    })
  },

  // 获取可用模型列表
  getModels() {
    return request<{ models: { id: string; owned_by: string; supportsVision: boolean }[]; default: string }>('/models')
  },

  // 编辑消息：更新用户消息内容并截断后续消息
  editMessage(conversationId: string, messageId: string, content: string, originalContent?: string) {
    return request<{ success: boolean; index: number }>('/conversations/messages/edit', {
      method: 'POST',
      body: JSON.stringify({ id: conversationId, messageId, content, originalContent })
    })
  },

  // 获取系统提示词
  getSystemPrompt() {
    return request<{ content: string }>('/system-prompt')
  },

  // 更新系统提示词
  updateSystemPrompt(content: string) {
    return request<{ success: boolean }>('/system-prompt', {
      method: 'PUT',
      body: JSON.stringify({ content })
    })
  },

  // 获取 API 配置
  getConfig() {
    return request<{
      apiBaseUrl: string; apiKey: string; llmModel: string; hasKey: boolean
      embeddingApiBaseUrl: string; embeddingApiKey: string; embeddingModel: string; hasEmbeddingKey: boolean
    }>('/config')
  },

  // 更新 API 配置
  updateConfig(config: {
    apiBaseUrl?: string; apiKey?: string; llmModel?: string
    embeddingApiBaseUrl?: string; embeddingApiKey?: string; embeddingModel?: string
  }) {
    return request<{
      success: boolean; apiBaseUrl: string; apiKey: string; llmModel: string
      embeddingApiBaseUrl: string; embeddingApiKey: string; embeddingModel: string
    }>('/config', {
      method: 'PUT',
      body: JSON.stringify(config)
    })
  },

  // 主动标记中断：用 keepalive 确保请求在页面关闭/刷新时也能送达服务端
  stopMessage(conversationId: string) {
    return fetch(`${API_URL}/conversations/messages/stop`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ id: conversationId }),
      keepalive: true
    })
  },

  // ====== 知识库 ======

  // 上传文档：用 FormData 而非 JSON（文件二进制），不经过通用 request（Content-Type 不同）
  async uploadKnowledgeDoc(file: File) {
    const formData = new FormData()
    formData.append('file', file)
    const token = getToken()
    const res = await fetch(`${API_URL}/knowledge/upload`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData
    })
    if (res.status === 401) {
      clearAuth()
      window.location.reload()
      throw new Error('登录已过期')
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: '上传失败' }))
      throw new Error(err.error || `HTTP ${res.status}`)
    }
    return res.json() as Promise<KnowledgeDoc>
  },

  // 获取文档列表
  getKnowledgeDocuments() {
    return request<KnowledgeDoc[]>('/knowledge/documents')
  },

  // 获取知识库文档完整内容
  getKnowledgeDocContent(docId: string) {
    return request<{ content: string }>(`/knowledge/documents/${docId}/content`)
  },

  // 删除文档
  deleteKnowledgeDoc(id: string) {
    return request<{ success: boolean }>(`/knowledge/documents?id=${id}`, {
      method: 'DELETE'
    })
  },

  // 批量删除文档
  batchDeleteKnowledgeDocs(ids: string[]) {
    return request<{ success: boolean; deleted: number }>('/knowledge/documents/batch', {
      method: 'DELETE',
      body: JSON.stringify({ ids })
    })
  },

  // 上传聊天附件（图片/文件），返回 Attachment 元数据
  uploadAttachment(file: File, onProgress?: (pct: number) => void): Promise<Attachment> {
    return new Promise((resolve, reject) => {
      const formData = new FormData()
      formData.append('file', file)
      const token = getToken()
      const xhr = new XMLHttpRequest()
      xhr.open('POST', `${API_URL}/upload`)
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress(Math.round((e.loaded / e.total) * 100))
        }
      }
      xhr.onload = () => {
        if (xhr.status === 401) { clearAuth(); window.location.reload(); return reject(new Error('登录已过期')) }
        if (xhr.status >= 400) {
          try { reject(new Error(JSON.parse(xhr.responseText).error || '上传失败')) }
          catch { reject(new Error('上传失败')) }
          return
        }
        resolve(JSON.parse(xhr.responseText))
      }
      xhr.onerror = () => reject(new Error('网络错误'))
      xhr.send(formData)
    })
  },

  // 搜索知识库
  searchKnowledge(query: string, k?: number) {
    return request<KnowledgeSearchResult[]>('/knowledge/search', {
      method: 'POST',
      body: JSON.stringify({ query, k })
    })
  },

  // ====== 长期记忆 ======

  // 获取记忆列表
  getMemoryList() {
    return request<MemoryRecord[]>('/memory/list')
  },

  // 搜索记忆
  searchMemory(query: string, k?: number) {
    return request<string[]>('/memory/search', {
      method: 'POST',
      body: JSON.stringify({ query, k })
    })
  },

  // 清除所有记忆
  clearMemory() {
    return request<{ success: boolean }>('/memory/clear', {
      method: 'DELETE'
    })
  }
}
