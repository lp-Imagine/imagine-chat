import fs from 'fs'
import path from 'path'
import { StringDecoder } from 'string_decoder'
import { Response } from 'express'
import { OpenAIApi } from 'openai'
import { LLM_MODEL } from './config'
import type { Session, Message, ToolCall, ToolResult, LLMResult, CallLLMParams, DataStore } from './types'

// ========== 通用工具函数 ==========

export const uid = (): string => Math.random().toString(36).slice(2, 10)

// ========== 请求校验 ==========

export function requireParams(obj: Record<string, unknown>, ...keys: string[]): void {
  for (const key of keys) {
    if (!obj[key]) {
      const err: Error & { statusCode?: number } = new Error(`缺少必要参数: ${key}`)
      err.statusCode = 400
      throw err
    }
  }
}

// ========== 会话查找 ==========

export function getSessionOrFail(data: DataStore, userId: string, sessionId: string): Session {
  const session = data[userId]?.[sessionId]
  if (!session) {
    const err: Error & { statusCode?: number } = new Error('对话不存在')
    err.statusCode = 404
    throw err
  }
  return session
}

// ========== JSON 文件读写 ==========

export function readData(dataFile: string): Record<string, unknown> {
  try {
    if (fs.existsSync(dataFile)) {
      return JSON.parse(fs.readFileSync(dataFile, 'utf-8'))
    }
  } catch (e: any) {
    console.error('读取数据文件失败:', e.message)
  }
  return {}
}

export function writeData(data: unknown, dataFile: string): void {
  const dir = path.dirname(dataFile)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2), 'utf-8')
}

// ========== LLM 上下文构建 ==========

// 构建发送给 LLM 的消息数组：system prompt + 最近 N 轮历史 + 当前用户消息
// 以 user 消息为轮次边界，保证不会切断 tool 调用链（避免 tool 消息孤悬导致 API 400）
export function buildMessages(
  history: Message[],
  newUserMsg: Message,
  systemContext: string,
  contextRounds = 10
): Message[] {
  let startIdx = history.length
  let userCount = 0
  for (let i = history.length - 1; i >= 0 && userCount < contextRounds; i--) {
    if (history[i].role === 'user') userCount++
    startIdx = i
  }
  const recent = history.slice(startIdx)

  // 过滤连续的 user 消息（重新生成/失败重试可能产生连续 user），避免 API 400
  const cleaned: Message[] = []
  for (let i = 0; i < recent.length; i++) {
    if (recent[i].role === 'user' && i + 1 < recent.length && recent[i + 1].role === 'user') {
      continue
    }
    cleaned.push(recent[i])
  }
  // 如果 cleaned 最后一条是 user，newUserMsg 也是 user，去掉 cleaned 尾部的 user
  while (cleaned.length > 0 && cleaned[cleaned.length - 1].role === 'user') {
    cleaned.pop()
  }

  // 修复不完整的 tool_call 链：assistant 有 N 个 tool_calls 但不足 N 个 tool 响应时，
  // 截断多余的 tool_calls（API 要求每个 tool_call 都要有对应的 tool 消息）
  const validated: Message[] = []
  for (let i = 0; i < cleaned.length; i++) {
    const msg = { ...cleaned[i] }
    if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
      let toolCount = 0
      let j = i + 1
      while (j < cleaned.length && cleaned[j].role === 'tool') {
        toolCount++
        j++
      }
      if (toolCount < msg.tool_calls.length) {
        msg.tool_calls = msg.tool_calls.slice(0, toolCount)
      }
    }
    validated.push(msg)
  }

  return [
    { role: 'system', content: systemContext } as Message,
    ...validated,
    newUserMsg
  ]
}

// ========== LLM API 调用 ==========

// 统一封装 DeepSeek API 调用（流式 / 非流式）
// 返回 { content, reasoning_content, toolCalls } 的 Promise
// signal 为可选 AbortSignal，触发后中断流式请求并以已接收的部分内容 resolve
export function callLLM(openai: OpenAIApi, params: CallLLMParams): Promise<LLMResult> {
  const { msgs, activeTools, thinkingEnabled, onToken, onReasoningToken, useStream = true, signal, model, temperature, topP } = params

  const baseParams = {
    model: model || LLM_MODEL,
    messages: msgs.map(m => {
      // 清理多余字段，避免 API 400（如 createdAt、interrupted）
      const clean: Record<string, unknown> = { role: m.role }
      // assistant 有 tool_calls 时 content 应为 null，空字符串可能导致 400
      if (m.tool_calls && m.tool_calls.length > 0) {
        clean.content = null
      } else if (m.content !== undefined) {
        clean.content = m.content
      }
      if (m.reasoning_content) clean.reasoning_content = m.reasoning_content
      if (m.tool_calls) clean.tool_calls = m.tool_calls
      if (m.tool_call_id) clean.tool_call_id = m.tool_call_id
      return clean
    }),
    tools: activeTools,
    thinking: { type: thinkingEnabled ? 'enabled' : 'disabled' },
    ...(temperature !== undefined ? { temperature } : {}),
    ...(topP !== undefined ? { top_p: topP } : {}),
  }

  // 非流式
  if (!useStream) {
    return openai.createChatCompletion({ ...baseParams, stream: false } as any).then(llmRes => {
      const msg = llmRes.data.choices[0]?.message as any
      if (onToken && msg?.content) onToken(msg.content)
      if (onReasoningToken && msg?.reasoning_content) onReasoningToken(msg.reasoning_content)
      return {
        content: msg?.content || '',
        reasoning_content: msg?.reasoning_content || '',
        toolCalls: (msg?.tool_calls || []) as ToolCall[]
      }
    })
  }

  // 流式：逐 token 推送给前端，同时捕获 tool_calls 和 reasoning_content
  return new Promise<LLMResult>((resolve, reject) => {
    let streamRef: any = null
    let aborted = false
    let fullContent = ''
    let reasoningContent = ''
    let toolCalls: ToolCall[] = []

    if (signal) {
      if (signal.aborted) aborted = true
      signal.addEventListener('abort', () => {
        aborted = true
        if (streamRef) {
          streamRef.destroy(new Error('Aborted'))
        }
        resolve({ content: fullContent, reasoning_content: reasoningContent, toolCalls: toolCalls.filter(Boolean) })
      })
    }

    openai.createChatCompletion({ ...baseParams, stream: true } as any, { responseType: 'stream' } as any).then(llmRes => {
      const stream = (llmRes as any).data
      streamRef = stream

      const decoder = new StringDecoder('utf-8')
      let lineBuf = ''

      // 先注册 error 处理器（确保 abort 时 stream.destroy() 能正常 resolve）
      stream.on('error', (err: Error) => {
        if (aborted) {
          resolve({ content: fullContent, reasoning_content: reasoningContent, toolCalls: toolCalls.filter(Boolean) })
        } else {
          reject(err)
        }
      })

      // 再检查是否已被 abort，是则销毁流并以空内容 resolve
      if (aborted) {
        stream.destroy(new Error('Aborted'))
        return
      }

      stream.on('data', (chunk: Buffer) => {
        if (aborted) return
        // StringDecoder 跨 chunk 缓冲多字节 UTF-8 字符，避免截断产生乱码
        lineBuf += decoder.write(chunk)
        const lines = lineBuf.split('\n')
        lineBuf = lines.pop() || ''

        for (const line of lines) {
          if (!line.trim()) continue
          const text = line.replace(/^data: /, '')
          if (text === '[DONE]') {
            resolve({ content: fullContent, reasoning_content: reasoningContent, toolCalls: toolCalls.filter(Boolean) })
            return
          }
          try {
            const parsed = JSON.parse(text)
            const delta = parsed.choices?.[0]?.delta
            if (delta?.content) {
              fullContent += delta.content
              if (onToken) onToken(delta.content)
            }
            if (delta?.reasoning_content) {
              reasoningContent += delta.reasoning_content
              if (onReasoningToken) onReasoningToken(delta.reasoning_content)
            }
            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls) {
                if (!toolCalls[tc.index]) {
                  toolCalls[tc.index] = { id: tc.id || '', type: 'function', function: { name: '', arguments: '' } }
                }
                if (tc.id) toolCalls[tc.index].id = tc.id
                if (tc.function?.name) toolCalls[tc.index].function.name += tc.function.name
                if (tc.function?.arguments) toolCalls[tc.index].function.arguments += tc.function.arguments
              }
            }
          } catch { /* 忽略无法解析的行 */ }
        }
      })

      stream.on('end', () => {
        if (aborted) return
        // 刷新 decoder 内部缓冲 + 处理残留行
        const remainder = decoder.end()
        if (remainder) lineBuf += remainder
        if (lineBuf.trim()) {
          const text = lineBuf.replace(/^data: /, '')
          if (text === '[DONE]') {
            resolve({ content: fullContent, reasoning_content: reasoningContent, toolCalls: toolCalls.filter(Boolean) })
            return
          }
          try {
            const parsed = JSON.parse(text)
            const delta = parsed.choices?.[0]?.delta
            if (delta?.content) {
              fullContent += delta.content
              if (onToken) onToken(delta.content)
            }
            if (delta?.reasoning_content) {
              reasoningContent += delta.reasoning_content
              if (onReasoningToken) onReasoningToken(delta.reasoning_content)
            }
          } catch { /* ignore */ }
        }
        resolve({ content: fullContent, reasoning_content: reasoningContent, toolCalls: toolCalls.filter(Boolean) })
      })

    }).catch(reject)
  })
}

// ========== 工具调用执行 ==========

// 并行执行工具调用，返回 { tool_call_id, fnName, fnArgs, toolResult }[]
export async function executeTools(
  toolCalls: ToolCall[],
  toolsHandleMap: Record<string, (args: Record<string, unknown>) => string | Promise<string>>
): Promise<ToolResult[]> {
  return Promise.all(
    toolCalls.map(async (tc) => {
      const fnName = tc.function.name
      let fnArgs: Record<string, unknown> = {}
      try { fnArgs = JSON.parse(tc.function.arguments || '{}') } catch { /* ignore */ }
      const handler = toolsHandleMap[fnName]
      const toolResult = await (handler
        ? Promise.resolve(handler(fnArgs)).then(r => String(r))
        : `工具 ${fnName} 未实现`)
      return { tool_call_id: tc.id, fnName, fnArgs, toolResult }
    })
  )
}

// ========== SSE 辅助 ==========

// 创建 SSE token 写入回调（统一检查连接状态，避免重复）
export function createTokenWriters(res: Response, abortController: AbortController) {
  const checkConn = (): boolean => {
    if (res.destroyed || !res.writable) { abortController.abort(); return true }
    return false
  }
  return {
    onToken(token: string) {
      if (checkConn()) return
      try { res.write(`data: ${JSON.stringify({ token })}\n\n`) } catch { abortController.abort() }
    },
    onReasoningToken(reasoningToken: string) {
      if (checkConn()) return
      try { res.write(`data: ${JSON.stringify({ reasoning_token: reasoningToken })}\n\n`) } catch { abortController.abort() }
    }
  }
}

// 检查 /stop 端点是否请求了中断
// 每次都检查 stopRequestMap（内存 Map）+ 上次的 wasStopped 状态
export function checkStopRequest(
  stopRequestMap: Map<string, number>,
  userId: string,
  sessionId: string,
  userMsgCreatedAt: number,
  prevWasStopped = false
): boolean {
  const key = `${userId}:${sessionId}`
  const stopTs = stopRequestMap.get(key) || 0
  const wasStopped = prevWasStopped || stopTs >= userMsgCreatedAt
  if (wasStopped && !prevWasStopped) stopRequestMap.delete(key)
  return wasStopped
}

// 构建 assistant 消息对象（统一 clearContent / isInterrupted 处理）
export function buildAssistantMessage(
  result: LLMResult,
  opts: { clearContent: boolean; isInterrupted: boolean }
): Message {
  return {
    role: 'assistant',
    content: opts.clearContent ? '' : (result.content || ''),
    reasoning_content: opts.clearContent ? '' : (result.reasoning_content || ''),
    createdAt: Date.now(),
    interrupted: opts.isInterrupted || undefined
  }
}

// ========== 响应收尾 ==========

export function endSSE(
  res: Response,
  session: Session,
  dataFile: string,
  userId: string,
  sessionId: string,
  initialListLen: number
): void {
  session.updatedAt = Date.now()

  // 总是重新读取磁盘数据，避免并发请求间的读写竞态
  // 多个 regenerate 请求可能同时进行，每个都会向 session.list 追加消息
  // 如果不重新读取，后面完成的请求会用过期数据覆盖前面请求写入的消息
  const freshData = readData(dataFile) as DataStore
  if (!freshData[userId]) freshData[userId] = {}

  const freshSession = freshData[userId]?.[sessionId]

  if (freshSession && initialListLen !== undefined && freshSession.list.length > initialListLen) {
    // 磁盘被并发请求修改过 — 合并本次请求新增的消息
    const thisNewMsgs = session.list.slice(initialListLen)
    for (const newMsg of thisNewMsgs) {
      const exists = freshSession.list.some(
        m => m.createdAt === newMsg.createdAt && m.role === newMsg.role
      )
      if (!exists) {
        freshSession.list.push(newMsg)
      }
    }
    freshSession.list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
    freshSession.updatedAt = Date.now()
    freshData[userId][sessionId] = freshSession
    session.list = freshSession.list
  } else {
    freshData[userId][sessionId] = session
  }

  writeData(freshData, dataFile)

  // 写后验证：检查 /stop 端点是否在 write 之后修改了磁盘，如有则合并重写
  if (userId && sessionId) {
    try {
      const diskData = readData(dataFile) as DataStore
      const diskList = diskData[userId]?.[sessionId]?.list
      if (diskList) {
        let needsRewrite = false
        for (let i = Math.min(session.list.length, diskList.length) - 1; i >= 0; i--) {
          if (diskList[i].role === 'assistant' && diskList[i].interrupted && !session.list[i].interrupted) {
            session.list[i].interrupted = true
            session.list[i].content = diskList[i].content
            session.list[i].reasoning_content = diskList[i].reasoning_content
            needsRewrite = true
          }
        }
        if (needsRewrite) {
          freshData[userId][sessionId] = session
          writeData(freshData, dataFile)
        }
      }
    } catch { /* ignore */ }
  }
  res.write(`data: [DONE]\n\n`)
  res.end()
}
