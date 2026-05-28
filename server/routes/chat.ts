import { Router, Request, Response } from 'express'
import fs from 'fs'
import path from 'path'
import { Configuration, OpenAIApi } from 'openai'
import { DATA_FILE, CONTEXT_ROUNDS, UPLOADS_DIR, getApiBaseUrl, getApiKey, getLlmModel } from '../config'
import { authMiddleware } from '../auth'
import { tools, toolsHandleMap, CARD_TOOLS } from '../tools'
import {
  uid, readData, writeData, requireParams, getSessionOrFail,
  buildMessages, callLLM, executeTools, endSSE, createTokenWriters,
  checkStopRequest, buildAssistantMessage
} from '../utils'
import { searchKnowledge } from '../knowledge'
import { saveConversationMemory, retrieveMemories } from '../memory'
import { extractFileText, ocrImage } from '../fileUtils'
import type { Attachment, DataStore, Session, Message } from '../types'

function getOpenAI() {
  return new OpenAIApi(new Configuration({
    basePath: getApiBaseUrl(),
    apiKey: getApiKey()
  }))
}

export function createChatRouter(
  stopRequestMap: Map<string, number>,
  getSystemContext: () => string
): Router {
  const router = Router()

  // ========== 会话 CRUD ==========

  // 获取用户的所有会话列表
  router.get('/', authMiddleware, (req: Request, res: Response) => {
    const userId = req.userId!
    const data = readData(DATA_FILE) as DataStore
    const userSessions = data[userId] || {}
    const list = Object.entries(userSessions)
      .map(([id, s]) => ({
        id,
        title: s.title || '新对话',
        updatedAt: s.updatedAt || 0,
        pinned: s.pinned || false
      }))
      .sort((a, b) => {
        if (a.pinned && !b.pinned) return -1
        if (!a.pinned && b.pinned) return 1
        return b.updatedAt - a.updatedAt
      })
    res.json(list)
  })

  // 创建新会话
  router.post('/', authMiddleware, (req: Request, res: Response) => {
    const userId = req.userId!
    const data = readData(DATA_FILE) as DataStore

    if (!data[userId]) data[userId] = {}

    const sessionId = uid()
    const session: Session = {
      title: req.body.title || '新对话',
      list: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      pinned: false
    }

    data[userId][sessionId] = session
    writeData(data, DATA_FILE)

    res.json({
      id: sessionId,
      title: session.title,
      messages: [],
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    })
  })

  // 删除会话
  router.delete('/', authMiddleware, (req: Request, res: Response) => {
    const userId = req.userId!
    const sessionId = req.query.id as string
    const data = readData(DATA_FILE) as DataStore

    if (data[userId] && data[userId][sessionId]) {
      delete data[userId][sessionId]
      writeData(data, DATA_FILE)
    }

    res.json({ success: true })
  })

  // 批量删除会话
  router.delete('/batch', authMiddleware, (req: Request, res: Response) => {
    const userId = req.userId!
    const { ids } = req.body as { ids: string[] }

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: '请提供要删除的会话ID列表' })
      return
    }

    const data = readData(DATA_FILE) as DataStore
    if (data[userId]) {
      for (const id of ids) {
        delete data[userId][id]
      }
      writeData(data, DATA_FILE)
    }

    res.json({ success: true, deleted: ids.length })
  })

  // 更新会话（重命名 / 置顶）
  router.put('/', authMiddleware, (req: Request, res: Response) => {
    const { id: sessionId, title, pinned } = req.body as { id: string; title?: string; pinned?: boolean }
    const userId = req.userId!

    try {
      requireParams(req.body, 'id')
    } catch (e: any) {
      res.status(400).json({ error: e.message })
      return
    }

    const data = readData(DATA_FILE) as DataStore
    let session: Session
    try {
      session = getSessionOrFail(data, userId, sessionId)
    } catch (e: any) {
      res.status(e.statusCode).json({ error: e.message })
      return
    }

    if (title && title.trim()) {
      session.title = title.trim()
    }
    if (typeof pinned === 'boolean') {
      session.pinned = pinned
    }
    session.updatedAt = Date.now()
    writeData(data, DATA_FILE)

    res.json({ success: true, title: session.title, pinned: session.pinned || false })
  })

  // 获取会话详情（含消息列表）
  router.get('/detail', authMiddleware, (req: Request, res: Response) => {
    const userId = req.userId!
    const sessionId = req.query.id as string
    const data = readData(DATA_FILE) as DataStore

    let session: Session
    try {
      session = getSessionOrFail(data, userId, sessionId)
    } catch (e: any) {
      res.status(e.statusCode).json({ error: e.message })
      return
    }

    const messages = (session.list || []).map((msg, i) => ({
      id: `${sessionId}_${i}`,
      role: msg.role,
      content: msg.content,
      reasoning_content: msg.reasoning_content || '',
      thinkingDuration: msg.thinkingDuration,
      tool_calls: msg.tool_calls,
      tool_call_id: msg.tool_call_id,
      interrupted: msg.interrupted || false,
      createdAt: msg.createdAt || session.createdAt,
      card_tool: msg.card_tool || undefined,
      attachments: msg.attachments || undefined
    }))

    res.json({
      id: sessionId,
      title: session.title,
      messages,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      msg: '查询成功'
    })
  })

  // ========== SSE 消息（核心聊天端点） ==========
  // 流程：RAG 检索 → 第一次 LLM 调用 → 无工具则直接返回 / 有工具则执行后继续
  router.post('/messages', authMiddleware, async (req: Request, res: Response) => {
    const userId = req.userId!
    const { id: sessionId, content, attachments, searchEnabled, thinkingEnabled, model: reqModel, temperature, topP, contextRounds } = req.body as {
      id: string; content: string; attachments?: Attachment[]; searchEnabled?: boolean; thinkingEnabled?: boolean; model?: string; temperature?: number; topP?: number; contextRounds?: number
    }
    const model = reqModel || getLlmModel()
    const rounds = contextRounds && contextRounds >= 1 && contextRounds <= 50 ? contextRounds : CONTEXT_ROUNDS

    try {
      requireParams(req.body, 'id')
    } catch (e: any) {
      res.status(400).json({ error: e.message })
      return
    }
    if ((!content || !content.trim()) && (!attachments || attachments.length === 0)) {
      res.status(400).json({ error: '消息内容不能为空' })
      return
    }

    const data = readData(DATA_FILE) as DataStore
    let session: Session
    try {
      session = getSessionOrFail(data, userId, sessionId)
    } catch (e: any) {
      res.status(e.statusCode).json({ error: e.message })
      return
    }

    const initialListLen = session.list.length

    // 展示内容（存盘，不含提取文本）与 LLM 上下文内容分离
    const displayContent = (content || '').trim()
    let llmContent = displayContent

    // 附件文本提取：拼入 LLM 上下文，但不写入消息记录的 content
    // 优先级：extractedText > .meta.json 缓存 > 实时提取（兜底旧消息/重新生成）
    if (attachments && attachments.length > 0) {
      console.log(`[消息] 收到 ${attachments.length} 个附件`)
      const parts: string[] = []
      for (const att of attachments) {
        try {
          let text = att.extractedText || ''
          console.log(`[消息] 附件 ${att.name}: extractedText=${text ? text.length + '字' : '无'} meta=${fs.existsSync(path.join(UPLOADS_DIR, userId, path.basename(att.url)) + '.meta.json') ? '有' : '无'}`)
          if (!text) {
            const metaPath = path.join(UPLOADS_DIR, userId, path.basename(att.url)) + '.meta.json'
            if (fs.existsSync(metaPath)) {
              text = fs.readFileSync(metaPath, 'utf-8').trim()
              console.log(`[消息]   → 从缓存读取: ${text.length} 字`)
            }
          }
          // 兜底：老消息没有预提取数据，实时解析文件/OCR 图片
          if (!text) {
            console.log(`[消息]   → 触发实时提取`)
            const filePath = path.join(UPLOADS_DIR, userId, path.basename(att.url))
            if (fs.existsSync(filePath)) {
              const buf = fs.readFileSync(filePath)
              text = att.type === 'image'
                ? await ocrImage(buf)
                : await extractFileText(buf, att.name)
              if (text?.trim()) {
                try { fs.writeFileSync(filePath + '.meta.json', text.trim(), 'utf-8') } catch { /* ignore */ }
              }
            } else {
              console.log(`[消息]   → 文件不存在: ${filePath}`)
            }
          }
          if (text?.trim()) {
            const label = att.type === 'image' ? '图片文字识别' : '文件'
            parts.push(`[${label}: ${att.name}]\n${text}`)
          }
        } catch (e: any) { console.log(`[消息] 附件处理异常: ${e.message}`) }
      }
      console.log(`[消息] 最终提取 ${parts.length} 段文本`)
      if (parts.length > 0) {
        llmContent = parts.join('\n\n') + (llmContent ? '\n\n' + llmContent : '')
      }
    }

    const userMsg: Message = {
      role: 'user',
      content: displayContent,
      createdAt: Date.now(),
      attachments: attachments || []
    }
    session.list.push(userMsg)

    const firstUserMsg = session.list.find(m => m.role === 'user')
    if (firstUserMsg) session.title = firstUserMsg.content.slice(0, 30)
    session.updatedAt = Date.now()
    writeData(data, DATA_FILE)

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    })

    const abortController = new AbortController()
    req.socket?.on('close', () => { abortController.abort() })

    try {
      // RAG: 检索知识库 + 长期记忆，注入 systemContext
      let enhancedContext = getSystemContext() + `\n\n你当前使用的模型是 ${model}。当用户询问"你是什么模型"或类似问题时，请如实回答你正在使用 ${model} 模型。`
      try {
        const [knowledgeResults, memoryResults] = await Promise.all([
          searchKnowledge(userId, content, 3),
          retrieveMemories(userId, content, 3)
        ])
        if (knowledgeResults.length > 0) {
          const kbText = knowledgeResults
            .map((r, i) => `[${i + 1}] (${r.fileName}) ${r.text}`)
            .join('\n\n')
          enhancedContext += `\n\n## 知识库参考内容\n${kbText}`
        }
        if (memoryResults.length > 0) {
          const memText = memoryResults
            .map((r, i) => `[${i + 1}] ${r}`)
            .join('\n')
          enhancedContext += `\n\n## 历史记忆\n${memText}`
        }
      } catch { /* RAG 检索失败不影响正常对话 */ }

      // LLM 收到含提取文本的上下文，但磁盘存储保持原始展示内容
      const llmUserMsg = llmContent !== displayContent
        ? { ...userMsg, content: llmContent }
        : userMsg
      const messages = buildMessages(session.list.slice(0, -1), llmUserMsg, enhancedContext, rounds)
      const activeTools = searchEnabled ? tools : tools.filter((t: any) => t.function.name !== 'web_search')
      const writers = createTokenWriters(res, abortController)

      const firstResult = await callLLM(getOpenAI(), {
        msgs: messages, activeTools, thinkingEnabled: !!thinkingEnabled,
        ...writers,
        useStream: true,
        signal: abortController.signal,
        model,
        temperature,
        topP,
        uploadsDir: path.join(UPLOADS_DIR, userId)
      })

      const wasStopped = checkStopRequest(stopRequestMap, userId, sessionId, userMsg.createdAt!)

      // wasStopped && !aborted → 用户点停止但 LLM 已完成，清空
      // wasStopped && aborted  → 用户点停止且 LLM 被中断，保留部分
      // !wasStopped && aborted → 客户端断开（非主动停止），保留部分
      const clearContent = wasStopped && !abortController.signal.aborted
      const isInterrupted = wasStopped || abortController.signal.aborted

      if (!firstResult.toolCalls.length) {
        session.list.push(buildAssistantMessage(firstResult, { clearContent, isInterrupted }))
        saveConversationMemory(userId, sessionId, session.list).catch(() => {})
        endSSE(res, session, DATA_FILE, userId, sessionId, initialListLen)
        return
      }

      // 需要工具 → 记录 assistant，并行执行工具
      session.list.push({
        role: 'assistant', content: firstResult.content || '',
        reasoning_content: firstResult.reasoning_content || '',
        tool_calls: firstResult.toolCalls, createdAt: Date.now()
      })
      messages.push({
        role: 'assistant', content: firstResult.content || '',
        tool_calls: firstResult.toolCalls, reasoning_content: firstResult.reasoning_content || ''
      })

      const toolResults = await executeTools(firstResult.toolCalls, toolsHandleMap)

      // 检查是否包含卡片工具（如搜索衣服、点餐），卡片工具跳过 LLM 总结直接返回
      const hasCardTool = toolResults.some(tr => CARD_TOOLS.has(tr.fnName))

      const parsedResults = toolResults.map(tr => {
        if (!CARD_TOOLS.has(tr.fnName)) return { ...tr, summary: tr.toolResult, cardData: null }
        try {
          const parsed = JSON.parse(tr.toolResult)
          return {
            ...tr,
            summary: parsed.summary || tr.toolResult,
            cardData: { tool_name: parsed.tool_name, tool_data: parsed.tool_data }
          }
        } catch {
          return { ...tr, summary: tr.toolResult, cardData: null }
        }
      })

      for (const { tool_call_id, fnName, fnArgs, summary } of parsedResults) {
        messages.push({ role: 'tool', tool_call_id, content: summary })
        session.list.push({ role: 'tool', tool_call_id, content: summary, createdAt: Date.now() })
        res.write(`data: ${JSON.stringify({ tool: fnName, args: fnArgs, result: summary })}\n\n`)
      }

      if (hasCardTool) {
        const cardToolData = parsedResults.find(tr => tr.cardData)?.cardData

        if (cardToolData) {
          const lastAssistant = session.list[session.list.length - toolResults.length - 1]
          if (lastAssistant && lastAssistant.role === 'assistant') {
            lastAssistant.card_tool = cardToolData
          }
        }

        res.write(`data: ${JSON.stringify({ card_tool: cardToolData })}\n\n`)
        saveConversationMemory(userId, sessionId, session.list).catch(() => {})
        endSSE(res, session, DATA_FILE, userId, sessionId, initialListLen)
        return
      }

      // 普通工具：第二次 LLM 调用总结结果
      messages.push({ role: 'user', content: '请根据刚才获取到的信息，直接回答用户最开始的问题。' })
      const finalResult = await callLLM(getOpenAI(), {
        msgs: messages, activeTools, thinkingEnabled: false,
        ...writers,
        useStream: true,
        signal: abortController.signal,
        model,
        temperature,
        topP,
        uploadsDir: path.join(UPLOADS_DIR, userId)
      })

      // 再次检查 stop 请求（工具执行期间可能到达）
      const wasStopped2 = checkStopRequest(stopRequestMap, userId, sessionId, userMsg.createdAt!, wasStopped)
      const clearContent2 = wasStopped2 && !abortController.signal.aborted
      const isInterrupted2 = wasStopped2 || abortController.signal.aborted

      session.list.push(buildAssistantMessage(finalResult, { clearContent: clearContent2, isInterrupted: isInterrupted2 }))
      saveConversationMemory(userId, sessionId, session.list).catch(() => {})
      endSSE(res, session, DATA_FILE, userId, sessionId, initialListLen)

    } catch (err: any) {
      for (let i = session.list.length - 1; i >= 0; i--) {
        if (session.list[i].role === 'assistant') {
          session.list[i].interrupted = true
          break
        }
      }
      session.updatedAt = Date.now()
      writeData(data, DATA_FILE)
      const apiErrMsg = err.response?.data?.error?.message || err.response?.data?.error || err.message || ''
      console.error('LLM 调用失败:', apiErrMsg)
      try { if (err.response?.data) console.error('API response:', JSON.stringify(err.response.data).slice(0, 500)) } catch { /* ignore */ }
      const userMsg = apiErrMsg ? `AI 服务错误：${apiErrMsg}` : 'AI 服务暂时不可用'
      res.write(`data: ${JSON.stringify({ error: userMsg })}\n\n`)
      res.end()
    }
  })

  // 编辑消息：更新用户消息内容并截断后续消息
  router.post('/messages/edit', authMiddleware, (req: Request, res: Response) => {
    const userId = req.userId!
    const { id: sessionId, messageId, content: newContent, originalContent } = req.body as {
      id: string; messageId: string; content: string; originalContent?: string
    }

    try {
      requireParams(req.body, 'id', 'messageId')
    } catch (e: any) {
      res.status(400).json({ error: e.message })
      return
    }

    const data = readData(DATA_FILE) as DataStore
    let session: Session
    try {
      session = getSessionOrFail(data, userId, sessionId)
    } catch (e: any) {
      res.status(e.statusCode).json({ error: e.message })
      return
    }

    // 优先用 messageId 中的索引（格式: `${sessionId}_${index}`），否则按原始内容匹配
    let idx = Number(messageId.split('_').pop())
    if (isNaN(idx) || idx < 0 || idx >= session.list.length) {
      if (originalContent !== undefined) {
        idx = -1
        for (let i = session.list.length - 1; i >= 0; i--) {
          if (session.list[i].role === 'user' && session.list[i].content === originalContent) {
            idx = i
            break
          }
        }
      }
    }

    if (idx < 0 || idx >= session.list.length) {
      res.status(400).json({ error: '消息不存在' })
      return
    }

    const msg = session.list[idx]
    if (msg.role !== 'user') {
      res.status(400).json({ error: '只能编辑用户消息' })
      return
    }

    // 允许纯文件/图片消息（content 可为空但须有附件）
    if ((!newContent || !newContent.trim()) && (!msg.attachments || msg.attachments.length === 0)) {
      res.status(400).json({ error: '消息内容不能为空' })
      return
    }

    msg.content = newContent.trim()
    session.list = session.list.slice(0, idx + 1)
    session.updatedAt = Date.now()
    writeData(data, DATA_FILE)

    res.json({ success: true, index: idx })
  })

  // 标记中断：内存 Map + 磁盘兜底
  router.post('/messages/stop', authMiddleware, (req: Request, res: Response) => {
    const userId = req.userId!
    const { id: sessionId } = req.body as { id: string }

    try {
      requireParams(req.body, 'id')
    } catch (e: any) {
      res.status(400).json({ error: '缺少会话ID' })
      return
    }

    // 1. 设置内存标记（供流式处理器检查，无竞态）
    stopRequestMap.set(`${userId}:${sessionId}`, Date.now())

    // 2. 兜底：如果 assistant 已写入磁盘，直接清空
    const data = readData(DATA_FILE) as DataStore
    const session = data[userId]?.[sessionId]
    if (session) {
      for (let i = session.list.length - 1; i >= 0; i--) {
        if (session.list[i].role === 'assistant') {
          const lastUser = session.list.filter(m => m.role === 'user').pop()
          if (lastUser && (session.list[i].createdAt ?? 0) > (lastUser.createdAt ?? 0)) {
            session.list[i].interrupted = true
            session.list[i].content = ''
            session.list[i].reasoning_content = ''
          }
          break
        }
      }
      session.updatedAt = Date.now()
      writeData(data, DATA_FILE)
    }
    res.json({ success: true })
  })

  return router
}
