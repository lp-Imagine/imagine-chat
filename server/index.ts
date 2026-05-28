import 'dotenv/config'
import express, { Request, Response } from 'express'
import cors from 'cors'
import fs from 'fs'
import path from 'path'
import { initOcr } from './fileUtils'

const app = express()
app.use(cors())
app.use(express.json({ limit: '10mb' }))

import { PORT, CONTEXT_FILE, UPLOADS_DIR } from './config'
import { createAuthRouter } from './routes/auth'
import { createChatRouter } from './routes/chat'
import { createKnowledgeRouter } from './routes/knowledge'
import { createMemoryRouter } from './routes/memory'
import { createSettingsRouter } from './routes/settings'
import { createUploadRouter } from './routes/upload'

// 加载系统提示词（含日期前缀），RAG 检索时会在此基础上追加知识库/记忆内容
function loadSystemContext(): string {
  return `当前日期：${new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}\n\n` + fs.readFileSync(CONTEXT_FILE, 'utf-8')
}
let systemContext = loadSystemContext()

// 共享状态：stopRequestMap 是内存 Map，用于 /stop 端点与 SSE 流式处理器之间的无竞态通信
const stopRequestMap = new Map<string, number>()

// 挂载路由
app.use('/api/auth', createAuthRouter())
app.use('/api/conversations', createChatRouter(stopRequestMap, () => systemContext))
app.use('/api/knowledge', createKnowledgeRouter())
app.use('/api/memory', createMemoryRouter())
app.use('/api', createSettingsRouter(
  () => systemContext,
  (ctx: string) => { systemContext = ctx }
))
app.use('/api/upload', createUploadRouter())

// 健康检查（无需认证）
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' })
})

// 静态文件服务：上传文件（须在 clientDist 之前，否则 catch-all 会拦截）
app.use('/uploads', express.static(UPLOADS_DIR))

// 生产环境：托管前端静态资源
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist')
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist))
  app.get('*', (_req: Request, res: Response) => {
    res.sendFile(path.join(clientDist, 'index.html'))
  })
}

app.listen(PORT, () => {
  console.log(`服务启动: http://localhost:${PORT}`)
  // 预热 OCR Worker（预下载语言数据，避免首次图片上传时等待）
  initOcr().then(() => console.log('[OCR] 预热完成')).catch(() => {})
})
