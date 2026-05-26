// ========== 数据模型 ==========

export interface Session {
  title: string
  list: Message[]
  createdAt: number
  updatedAt: number
  pinned: boolean
}

export interface Message {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  reasoning_content?: string
  tool_calls?: ToolCall[]
  tool_call_id?: string
  createdAt?: number
  interrupted?: boolean
  /** 卡片工具数据：当 assistant 消息携带卡片工具调用时，此字段包含前端渲染卡片所需的业务数据 */
  card_tool?: { tool_name: string; tool_data: unknown }
}

export interface ToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string // JSON string
  }
}

export interface ToolResult {
  tool_call_id: string
  fnName: string
  fnArgs: Record<string, unknown>
  toolResult: string
}

export interface LLMResult {
  content: string
  reasoning_content: string
  toolCalls: ToolCall[]
}

export interface CallLLMParams {
  msgs: Message[]
  activeTools: unknown[] // OpenAI ChatCompletionTool[]
  thinkingEnabled: boolean
  onToken?: (token: string) => void
  onReasoningToken?: (token: string) => void
  useStream?: boolean
  signal?: AbortSignal
  model?: string
  temperature?: number
  topP?: number
}

export type DataStore = Record<string, Record<string, Session>>
export type UsersStore = Record<string, { username: string; password: string; createdAt: number }>

// ========== Express Request 扩展 ==========

declare global {
  namespace Express {
    interface Request {
      userId?: string
    }
  }
}
