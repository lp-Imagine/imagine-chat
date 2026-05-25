import 'dotenv/config'
import express, { Request, Response } from 'express'
import cors from 'cors'
import { Configuration, OpenAIApi } from 'openai'
import fs from 'fs'

const app = express()
app.use(cors())
app.use(express.json())

import { DATA_FILE, CONTEXT_FILE, CONTEXT_ROUNDS, PORT, getApiBaseUrl, getApiKey, getLlmModel, saveApiConfig } from './config'
function loadSystemContext(): string {
    return `当前日期：${new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}\n\n` + fs.readFileSync(CONTEXT_FILE, 'utf-8')
}
let systemContext = loadSystemContext()

import { tools, toolsHandleMap } from './tools'
import { uid, readData, writeData, requireParams, getSessionOrFail, buildMessages, callLLM, executeTools, endSSE, createTokenWriters, checkStopRequest, buildAssistantMessage } from './utils'
import { registerUser, loginUser, authMiddleware } from './auth'
import type { DataStore, Session, Message } from './types'

// 内存中的停止请求标记，用于 stop 端点和流式处理器之间的无竞态通信
const stopRequestMap = new Map<string, number>() // key: `${userId}:${sessionId}`, value: timestamp

function getOpenAI() {
    return new OpenAIApi(new Configuration({
        basePath: getApiBaseUrl(),
        apiKey: getApiKey()
    }))
}

// ========== 认证路由 ==========

// 注册
app.post('/api/auth/register', (req: Request, res: Response) => {
    try {
        const { username, password } = req.body as { username: string; password: string }
        const result = registerUser(username, password)
        res.json(result)
    } catch (e: any) {
        const status = e.message === '用户名已存在' ? 409 : 400
        res.status(status).json({ error: e.message })
    }
})

// 登录
app.post('/api/auth/login', (req: Request, res: Response) => {
    try {
        const { username, password } = req.body as { username: string; password: string }
        const result = loginUser(username, password)
        res.json(result)
    } catch (e: any) {
        const status = e.message === '用户名或密码错误' ? 401 : 400
        res.status(status).json({ error: e.message })
    }
})

// 获取当前用户信息
app.get('/api/auth/me', authMiddleware, (req: Request, res: Response) => {
    res.json({ user: { username: req.userId } })
})

// 获取可用模型列表
app.get('/api/models', authMiddleware, async (_req: Request, res: Response) => {
    try {
        const openai = getOpenAI()
        const list = await openai.listModels()
        const models = (list.data.data || [])
            .filter((m: any) => m.id)
            .map((m: any) => ({ id: m.id, owned_by: m.owned_by || '' }))
        res.json({ models, default: getLlmModel() })
    } catch {
        // API 不可用时返回常见模型列表
        res.json({
            models: [
                { id: 'deepseek-chat', owned_by: 'deepseek' },
                { id: 'deepseek-reasoner', owned_by: 'deepseek' },
                { id: 'deepseek-v4-flash', owned_by: 'deepseek' },
            ],
            default: getLlmModel()
        })
    }
})

// 获取系统提示词
app.get('/api/system-prompt', authMiddleware, (_req: Request, res: Response) => {
    try {
        const content = fs.readFileSync(CONTEXT_FILE, 'utf-8')
        res.json({ content })
    } catch {
        res.status(500).json({ error: '读取系统提示词失败' })
    }
})

// 更新系统提示词
app.put('/api/system-prompt', authMiddleware, (req: Request, res: Response) => {
    const { content } = req.body as { content: string }
    if (!content || !content.trim()) {
        res.status(400).json({ error: '提示词内容不能为空' })
        return
    }
    try {
        fs.writeFileSync(CONTEXT_FILE, content.trim(), 'utf-8')
        systemContext = loadSystemContext()
        res.json({ success: true })
    } catch {
        res.status(500).json({ error: '保存系统提示词失败' })
    }
})

// 获取 API 配置（脱敏返回，不暴露完整 API_KEY）
app.get('/api/config', authMiddleware, (_req: Request, res: Response) => {
    const key = getApiKey()
    const masked = key ? key.slice(0, 6) + '••••••••••••' + key.slice(-4) : ''
    res.json({
        apiBaseUrl: getApiBaseUrl(),
        apiKey: masked,
        llmModel: getLlmModel(),
        hasKey: !!key
    })
})

// 更新 API 配置
app.put('/api/config', authMiddleware, (req: Request, res: Response) => {
    const { apiBaseUrl, apiKey, llmModel } = req.body as { apiBaseUrl?: string; apiKey?: string; llmModel?: string }
    if (apiKey !== undefined && !apiKey.trim()) {
        res.status(400).json({ error: 'API Key 不能为空' })
        return
    }
    if (apiBaseUrl !== undefined && !apiBaseUrl.trim()) {
        res.status(400).json({ error: 'API 地址不能为空' })
        return
    }
    // 如果传入的是脱敏值（包含••••），保持不变
    const realKey = apiKey && apiKey.includes('••••') ? undefined : apiKey
    const updated = saveApiConfig({
        ...(apiBaseUrl ? { apiBaseUrl: apiBaseUrl.trim() } : {}),
        ...(realKey ? { apiKey: realKey.trim() } : {}),
        ...(llmModel ? { llmModel: llmModel.trim() } : {}),
    })
    const masked = updated.apiKey ? updated.apiKey.slice(0, 6) + '••••••••••••' + updated.apiKey.slice(-4) : ''
    res.json({ success: true, apiBaseUrl: updated.apiBaseUrl, apiKey: masked, llmModel: updated.llmModel })
})

// ========== API 路由（需要登录） ==========

// 获取用户的所有会话列表
app.get('/api/conversations', authMiddleware, (req: Request, res: Response) => {
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
app.post('/api/conversations', authMiddleware, (req: Request, res: Response) => {
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
app.delete('/api/conversations', authMiddleware, (req: Request, res: Response) => {
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
app.delete('/api/conversations/batch', authMiddleware, (req: Request, res: Response) => {
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
app.put('/api/conversations', authMiddleware, (req: Request, res: Response) => {
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
app.get('/api/conversations/detail', authMiddleware, (req: Request, res: Response) => {
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
        tool_calls: msg.tool_calls,
        tool_call_id: msg.tool_call_id,
        interrupted: msg.interrupted || false,
        createdAt: msg.createdAt || session.createdAt
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

// 发送消息（SSE 流式，支持 Function Calling 循环）
app.post('/api/conversations/messages', authMiddleware, async (req: Request, res: Response) => {
    const userId = req.userId!
    const { id: sessionId, content, searchEnabled, thinkingEnabled, model: reqModel, temperature, topP, contextRounds } = req.body as {
        id: string; content: string; searchEnabled?: boolean; thinkingEnabled?: boolean; model?: string; temperature?: number; topP?: number; contextRounds?: number
    }
    const model = reqModel || getLlmModel()
    const rounds = contextRounds && contextRounds >= 1 && contextRounds <= 50 ? contextRounds : CONTEXT_ROUNDS

    try {
        requireParams(req.body, 'id')
    } catch (e: any) {
        res.status(400).json({ error: e.message })
        return
    }
    if (!content || !content.trim()) {
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

    const userMsg: Message = {
        role: 'user',
        content: content.trim(),
        createdAt: Date.now()
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

    // 客户端断开时中止 LLM 流
    // 注意：不能用 res.on('close') —— 它会在 res.end() 正常完成时也触发，导致误判
    const abortController = new AbortController()
    req.socket?.on('close', () => { abortController.abort() })

    try {
        const messages = buildMessages(session.list.slice(0, -1), userMsg, systemContext, rounds)
        const activeTools = searchEnabled ? tools : tools.filter((t: any) => t.function.name !== 'web_search')
        const writers = createTokenWriters(res, abortController)

        // 第一次调用（流式）：LLM 决定是否使用工具
        const firstResult = await callLLM(getOpenAI(), {
            msgs: messages, activeTools, thinkingEnabled: !!thinkingEnabled,
            ...writers,
            useStream: true,
            signal: abortController.signal,
            model,
            temperature,
            topP
        })

        // 检查 stop 端点是否通过内存 Map 通知了中断
        const wasStopped = checkStopRequest(stopRequestMap, userId, sessionId, userMsg.createdAt!)

        // wasStopped && !signal.aborted → LLM 自然完成（太快），用户没看到内容，清空
        // wasStopped && signal.aborted  → LLM 被中断，保留已生成的部分内容
        // !wasStopped && signal.aborted → 客户端断开（非主动停止），保留部分内容
        const clearContent = wasStopped && !abortController.signal.aborted
        const isInterrupted = wasStopped || abortController.signal.aborted

        if (!firstResult.toolCalls.length) {
            session.list.push(buildAssistantMessage(firstResult, { clearContent, isInterrupted }))
            endSSE(res, session, DATA_FILE, userId, sessionId, initialListLen)
            return
        }

        // 需要工具 → 记录 assistant，并行执行
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
        for (const { tool_call_id, fnName, fnArgs, toolResult } of toolResults) {
            messages.push({ role: 'tool', tool_call_id, content: toolResult })
            session.list.push({ role: 'tool', tool_call_id, content: toolResult, createdAt: Date.now() })
            res.write(`data: ${JSON.stringify({ tool: fnName, args: fnArgs, result: toolResult })}\n\n`)
        }

        // 第二次调用（流式）：基于工具结果总结回答
        messages.push({ role: 'user', content: '请根据刚才获取到的信息，直接回答用户最开始的问题。' })
        const finalResult = await callLLM(getOpenAI(), {
            msgs: messages, activeTools, thinkingEnabled: false,
            ...writers,
            useStream: true,
            signal: abortController.signal,
            model,
            temperature,
            topP
        })

        // 再次检查 stop 请求（工具执行期间可能到达）
        const wasStopped2 = checkStopRequest(stopRequestMap, userId, sessionId, userMsg.createdAt!, wasStopped)
        const clearContent2 = wasStopped2 && !abortController.signal.aborted
        const isInterrupted2 = wasStopped2 || abortController.signal.aborted

        session.list.push(buildAssistantMessage(finalResult, { clearContent: clearContent2, isInterrupted: isInterrupted2 }))
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
        console.error('LLM 调用失败:', err.message)
        try { if (err.response?.data) console.error('API response:', JSON.stringify(err.response.data).slice(0, 500)) } catch { /* ignore */ }
        res.write(`data: ${JSON.stringify({ error: 'AI 服务暂时不可用' })}\n\n`)
        res.end()
    }
})

// 编辑消息：更新用户消息内容并截断后续消息
app.post('/api/conversations/messages/edit', authMiddleware, (req: Request, res: Response) => {
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
    if (!newContent || !newContent.trim()) {
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

    // 优先用 messageId 中的索引（格式: `${sessionId}_${index}`），否则按原始内容匹配
    let idx = Number(messageId.split('_').pop())
    if (isNaN(idx) || idx < 0 || idx >= session.list.length) {
        if (originalContent) {
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

    msg.content = newContent.trim()
    // 截断后续消息
    session.list = session.list.slice(0, idx + 1)
    session.updatedAt = Date.now()
    writeData(data, DATA_FILE)

    res.json({ success: true, index: idx })
})

// 标记中断（前端主动调用）：内存 Map 通知流式处理器 + 磁盘直接修复兜底
app.post('/api/conversations/messages/stop', authMiddleware, (req: Request, res: Response) => {
    const userId = req.userId!
    const { id: sessionId } = req.body as { id: string }

    try {
        requireParams(req.body, 'id')
    } catch (e: any) {
        res.status(400).json({ error: '缺少会话ID' })
        return
    }

    // 1. 设置内存标记（供流式处理器 callLLM 返回后检查，无竞态）
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

app.listen(PORT, () => {
    console.log(`服务启动: http://localhost:${PORT}`)
})
