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
  /** DeepSeek 思考模式的推理过程，对其他模型为空字符串 */
  reasoning_content?: string
  /** 助手发起工具调用时的函数声明列表，每个 tool_call 都需要后续有对应的 tool 消息响应 */
  tool_calls?: ToolCall[]
  /** tool 消息的唯一标识，对应 ToolCall.id */
  tool_call_id?: string
  createdAt?: number
  /** 表示该消息被用户中途停止生成 */
  interrupted?: boolean
  /** 卡片工具数据：当 assistant 消息携带交互卡片时，此字段包含前端渲染卡片所需的业务数据 */
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
  /** AbortSignal 用于中断流式 LLM 请求 */
  signal?: AbortSignal
  model?: string
  temperature?: number
  topP?: number
}

// DataStore 结构：{ [userId]: { [sessionId]: Session } }
export type DataStore = Record<string, Record<string, Session>>
export type UsersStore = Record<string, { username: string; password: string; createdAt: number }>

// ========== Express Request 扩展 ==========
// authMiddleware 将 userId 注入到 req 上，后续路由无需重复解析 token

declare global {
  namespace Express {
    interface Request {
      userId?: string
    }
  }
}
