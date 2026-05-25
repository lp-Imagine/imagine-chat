// 消息类型定义

export type Role = 'user' | 'assistant' | 'system' | 'tool'

// 版本快照：重新生成时保存当前回复，用于版本切换
export interface VersionSnapshot {
  content: string
  reasoning_content: string
  createdAt: number
  interrupted?: boolean
}

// 单条消息：loading 字段用于前端显示打字动画（非后端字段）
// reasoning_content 为 DeepSeek 思考模式的推理过程
// versions/versionIndex 用于重新生成后的版本切换
export interface ChatMessage {
  id: string
  role: Role
  content: string
  reasoning_content?: string
  createdAt: number
  loading?: boolean
  interrupted?: boolean
  tool_calls?: any[]
  tool_call_id?: string
  versions?: VersionSnapshot[]
  versionIndex?: number
}

// 会话：包含消息列表
export interface Conversation {
  id: string
  title: string
  messages: ChatMessage[]
  updatedAt: number
}
