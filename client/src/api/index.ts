// 后端 API 封装，所有请求统一走 /api 前缀（Vite proxy 转发到 localhost:3000）
import type { ChatMessage, Conversation } from '@/types/chat'
import { getToken, clearAuth } from '@/utils/auth'

const BASE = '/api'

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = getToken()
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  return headers
}

// 通用 JSON 请求封装：自动拼接 BASE、携带 Token、统一错误处理
async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
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
    const res = await fetch(`${BASE}/auth/login`, {
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
    const res = await fetch(`${BASE}/auth/register`, {
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

  // 发送消息（SSE 流式），返回原始 Response 供 ReadableStream 消费
  sendMessageStream(conversationId: string, content: string, searchEnabled = false, thinkingEnabled = true, signal?: AbortSignal, model?: string, temperature?: number, topP?: number, contextRounds?: number) {
    return fetch(`${BASE}/conversations/messages`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ id: conversationId, content, searchEnabled, thinkingEnabled, model, temperature, topP, contextRounds }),
      signal
    })
  },

  // 获取可用模型列表
  getModels() {
    return request<{ models: { id: string; owned_by: string }[]; default: string }>('/models')
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
    return request<{ apiBaseUrl: string; apiKey: string; llmModel: string; hasKey: boolean }>('/config')
  },

  // 更新 API 配置
  updateConfig(config: { apiBaseUrl?: string; apiKey?: string; llmModel?: string }) {
    return request<{ success: boolean; apiBaseUrl: string; apiKey: string; llmModel: string }>('/config', {
      method: 'PUT',
      body: JSON.stringify(config)
    })
  },

  // 主动标记中断（不依赖 TCP close，使用 keepalive 确保送达）
  stopMessage(conversationId: string) {
    return fetch(`${BASE}/conversations/messages/stop`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ id: conversationId }),
      keepalive: true
    })
  }
}
