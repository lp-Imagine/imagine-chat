// 设置路由：模型列表、系统提示词读写、API 配置管理、管理后台
import { Router, Request, Response } from 'express'
import fs from 'fs'
import { Configuration, OpenAIApi } from 'openai'
import {
  CONTEXT_FILE, USERS_FILE, DATA_FILE, getApiBaseUrl, getApiKey, getLlmModel,
  getEmbeddingApiBaseUrl, getEmbeddingApiKey, getEmbeddingModel, saveApiConfig
} from '../config'
import { authMiddleware } from '../auth'
import { readData } from '../utils'
import { supportsVisionModel } from '../fileUtils'

function getOpenAI() {
  return new OpenAIApi(new Configuration({
    basePath: getApiBaseUrl(),
    apiKey: getApiKey()
  }))
}

export function createSettingsRouter(
  getSystemContext: () => string,
  setSystemContext: (ctx: string) => void
): Router {
  const router = Router()

  // 获取可用模型列表
  router.get('/models', authMiddleware, async (_req: Request, res: Response) => {
    try {
      const openai = getOpenAI()
      const list = await openai.listModels()
      const models = (list.data.data || [])
        .filter((m: any) => m.id)
        .map((m: any) => ({ id: m.id, owned_by: m.owned_by || '', supportsVision: supportsVisionModel(m.id) }))
      res.json({ models, default: getLlmModel() })
    } catch {
      // API 不可用时返回常见模型列表
        const fallbackModels = [
          { id: 'deepseek-chat', owned_by: 'deepseek' },
          { id: 'deepseek-reasoner', owned_by: 'deepseek' },
          { id: 'deepseek-v4-flash', owned_by: 'deepseek' },
        ]
        res.json({
          models: fallbackModels.map(m => ({ ...m, supportsVision: supportsVisionModel(m.id) })),
          default: getLlmModel()
        })
    }
  })

  // 获取系统提示词
  router.get('/system-prompt', authMiddleware, (_req: Request, res: Response) => {
    try {
      const content = fs.readFileSync(CONTEXT_FILE, 'utf-8')
      res.json({ content })
    } catch {
      res.status(500).json({ error: '读取系统提示词失败' })
    }
  })

  // 更新系统提示词
  router.put('/system-prompt', authMiddleware, (req: Request, res: Response) => {
    const { content } = req.body as { content: string }
    if (!content || !content.trim()) {
      res.status(400).json({ error: '提示词内容不能为空' })
      return
    }
    try {
      fs.writeFileSync(CONTEXT_FILE, content.trim(), 'utf-8')
      // 重新加载 systemContext（含日期前缀），通知 index.ts 更新缓存
      const newCtx = `当前日期：${new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}\n\n` + content.trim()
      setSystemContext(newCtx)
      res.json({ success: true })
    } catch {
      res.status(500).json({ error: '保存系统提示词失败' })
    }
  })

  // 获取 API 配置（脱敏返回）
  router.get('/config', authMiddleware, (_req: Request, res: Response) => {
    const key = getApiKey()
    const embKey = getEmbeddingApiKey()
    const masked = key ? key.slice(0, 6) + '••••••••••••' + key.slice(-4) : ''
    const embMasked = embKey ? embKey.slice(0, 6) + '••••••••••••' + embKey.slice(-4) : ''
    res.json({
      apiBaseUrl: getApiBaseUrl(),
      apiKey: masked,
      llmModel: getLlmModel(),
      hasKey: !!key,
      embeddingApiBaseUrl: getEmbeddingApiBaseUrl(),
      embeddingApiKey: embMasked,
      embeddingModel: getEmbeddingModel(),
      hasEmbeddingKey: !!embKey
    })
  })

  // 更新 API 配置
  router.put('/config', authMiddleware, (req: Request, res: Response) => {
    const { apiBaseUrl, apiKey, llmModel, embeddingApiBaseUrl, embeddingApiKey, embeddingModel } = req.body as {
      apiBaseUrl?: string; apiKey?: string; llmModel?: string
      embeddingApiBaseUrl?: string; embeddingApiKey?: string; embeddingModel?: string
    }
    if (apiKey !== undefined && !apiKey.trim()) {
      res.status(400).json({ error: 'API Key 不能为空' })
      return
    }
    if (apiBaseUrl !== undefined && !apiBaseUrl.trim()) {
      res.status(400).json({ error: 'API 地址不能为空' })
      return
    }
    const realKey = apiKey && apiKey.includes('••••') ? undefined : apiKey
    const realEmbKey = embeddingApiKey && embeddingApiKey.includes('••••') ? undefined : embeddingApiKey
    const updated = saveApiConfig({
      ...(apiBaseUrl ? { apiBaseUrl: apiBaseUrl.trim() } : {}),
      ...(realKey ? { apiKey: realKey.trim() } : {}),
      ...(llmModel ? { llmModel: llmModel.trim() } : {}),
      ...(embeddingApiBaseUrl ? { embeddingApiBaseUrl: embeddingApiBaseUrl.trim() } : {}),
      ...(realEmbKey ? { embeddingApiKey: realEmbKey.trim() } : {}),
      ...(embeddingModel ? { embeddingModel: embeddingModel.trim() } : {}),
    })
    const masked = updated.apiKey ? updated.apiKey.slice(0, 6) + '••••••••••••' + updated.apiKey.slice(-4) : ''
    const embMasked = updated.embeddingApiKey ? updated.embeddingApiKey.slice(0, 6) + '••••••••••••' + updated.embeddingApiKey.slice(-4) : ''
    res.json({ success: true, apiBaseUrl: updated.apiBaseUrl, apiKey: masked, llmModel: updated.llmModel, embeddingApiBaseUrl: updated.embeddingApiBaseUrl, embeddingApiKey: embMasked, embeddingModel: updated.embeddingModel })
  })

  // 管理接口：查看用户和会话数据
  router.get('/admin/data', authMiddleware, (_req: Request, res: Response) => {
    const users = readData(USERS_FILE) as Record<string, unknown>
    const safeUsers: Record<string, unknown> = {}
    for (const [name, info] of Object.entries(users)) {
      const u = info as Record<string, unknown>
      safeUsers[name] = { username: u.username, createdAt: u.createdAt, password: '***' }
    }
    const chatData = readData(DATA_FILE)
    res.json({ users: safeUsers, chat: chatData })
  })

  return router
}
