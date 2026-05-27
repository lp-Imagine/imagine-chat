// 消息类型定义

export type Role = 'user' | 'assistant' | 'system' | 'tool'

// 重新生成时的版本快照：每次 regenerate 会保存当前回复，用于前后版本切换
export interface VersionSnapshot {
  content: string
  reasoning_content: string
  createdAt: number
  interrupted?: boolean
}

// 单条消息
//   loading: 前端渲染时显示打字动画（非后端字段，发送消息时客户端设置）
//   reasoning_content: DeepSeek 思考模式的推理过程，其他模型为空
//   versions/versionIndex: 重新生成产生的多个版本，versionIndex 指向当前显示的版本
//   card_tool: 交互卡片数据（如衣服搜索、点餐卡片）
//   interrupted: 用户中途停止或连接断开导致的未完成消息
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
  card_tool?: { tool_name: string; tool_data: any }
}

export interface Conversation {
  id: string
  title: string
  messages: ChatMessage[]
  updatedAt: number
}

// 知识库文档
export interface KnowledgeDoc {
  id: string
  fileName: string
  fileType: string
  fileSize: number
  chunkCount: number
  createdAt: number
}

// 知识库搜索结果（语义搜索返回的文档块）
export interface KnowledgeSearchResult {
  text: string
  score: number // 余弦相似度，越高越相关
  fileName: string
}

// 长期记忆记录
export interface MemoryRecord {
  id: string
  userId: string
  conversationId: string
  summary: string // LLM 生成的对话摘要
  createdAt: number
}
