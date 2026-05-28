// 长期记忆模块
// 每轮对话结束后用 LLM 生成摘要 → 向量化存入 RuVector → 后续对话语义检索注入上下文
// 与知识库使用独立的 DB 文件（memory.db vs vectors.db），避免数据混淆
import path from 'path'
import fs from 'fs'
import { Configuration, OpenAIApi } from 'openai'
import { uid, readData, writeData } from './utils'
import { embedText } from './embeddings'
import { MEMORY_RECORDS_FILE, MEMORY_VECTORS_DIR, getApiBaseUrl, getApiKey, getLlmModel } from './config'
import type { Message } from './types'

// ruvector 是 CJS 模块，无 TS 类型声明
const { VectorDB } = require('ruvector')

// ========== 记忆记录存储 ==========
// 记忆元数据存 JSON，向量存 RuVector（与知识库分离，两个独立的 DB）
// 每条记忆 = LLM 对最近几轮对话的摘要

interface MemoryRecord {
  id: string
  userId: string
  conversationId: string
  summary: string
  createdAt: number
}

function loadMemories(): MemoryRecord[] {
  const data = readData(MEMORY_RECORDS_FILE)
  return (data.records as MemoryRecord[]) || []
}

function saveMemories(records: MemoryRecord[]): void {
  writeData({ records }, MEMORY_RECORDS_FILE)
}

// ========== 向量数据库实例（懒加载） ==========
// 与知识库共用 embedText 但使用独立的 DB 文件（memory.db vs vectors.db）
// 维度在首次写入时自动检测

let memoryDb: any = null
let memoryDbUserId: string | null = null
let memoryDbDimension: number | null = null

function getMemoryDb(userId: string, dimension?: number): any {
  const dim = dimension || memoryDbDimension || 1536
  if (memoryDb && memoryDbUserId === userId && memoryDbDimension === dim) return memoryDb
  const dbDir = path.join(MEMORY_VECTORS_DIR, userId)
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true })
  const dbPath = path.join(dbDir, 'memory.db')
  memoryDb = new VectorDB({
    dimensions: dim,
    storagePath: dbPath,
    metric: 'cosine'
  })
  memoryDbUserId = userId
  return memoryDb
}

// ========== 保存对话记忆 ==========
// 在每轮对话结束后 fire-and-forget 调用（不阻塞 SSE 响应）
// 流程：取最近几条消息 → 调 LLM 生成摘要 → 向量化 → 存入记忆库

export async function saveConversationMemory(
  userId: string,
  conversationId: string,
  recentMessages: Message[]
): Promise<void> {
  // 只取用户和助手的消息（忽略工具调用消息），最多取最近 8 条（4 轮对话）
  const dialogMessages = recentMessages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .slice(-8)

  if (dialogMessages.length < 2) return

  const conversationText = dialogMessages
    .map(m => `${m.role === 'user' ? '用户' : '助手'}: ${m.content}`)
    .join('\n')

  // 用 LLM 做摘要，非流式调用，要求简短输出（2-4 句）
  let summary: string
  try {
    const openai = new OpenAIApi(new Configuration({
      basePath: getApiBaseUrl(),
      apiKey: getApiKey()
    }))
    const res = await openai.createChatCompletion({
      model: getLlmModel(),
      messages: [
        { role: 'system', content: '你是一个对话摘要助手。请用2-4句话总结以下对话的关键信息和结论，只输出摘要内容，不要加任何前缀。' },
        { role: 'user', content: conversationText }
      ],
      stream: false
    } as any)
    summary = (res.data.choices[0]?.message as any)?.content?.trim() || ''
  } catch {
    // LLM 调用失败时降级：直接用前两条消息内容作为摘要
    summary = dialogMessages.slice(0, 2).map(m => m.content).join(' | ')
  }

  if (!summary || summary.length < 10) return

  // 向量化摘要 → 写入记忆向量库
  const vector = await embedText(summary)
  const db = getMemoryDb(userId, vector.length)
  const recordId = uid()
  await db.insert({
    id: recordId,
    vector,
    metadata: { userId, conversationId, summary }
  })

  // 保存元数据，最多保留 500 条
  const records = loadMemories()
  records.push({ id: recordId, userId, conversationId, summary, createdAt: Date.now() })
  if (records.length > 500) records.splice(0, records.length - 500)
  saveMemories(records)
}

// ========== 检索记忆 ==========
// 用当前用户消息向量化 → 搜索历史记忆中语义相似的摘要 → 注入 LLM 上下文

export async function retrieveMemories(
  userId: string,
  query: string,
  k = 3
): Promise<string[]> {
  const records = loadMemories()
  const userRecords = records.filter(r => r.userId === userId)
  if (userRecords.length === 0) return []

  const queryVector = await embedText(query)
  const db = getMemoryDb(userId, queryVector.length)
  const results = await db.search({ vector: queryVector, k: Math.min(k, userRecords.length) })

  return results
    .filter((r: any) => r.metadata?.summary)
    .map((r: any) => r.metadata.summary as string)
}

// ========== 管理接口 ==========

export function getMemoryRecords(userId: string): MemoryRecord[] {
  return loadMemories().filter(r => r.userId === userId)
}

export async function clearMemories(userId: string): Promise<void> {
  const records = loadMemories()
  const userRecords = records.filter(r => r.userId === userId)
  if (userRecords.length === 0) return
  const db = getMemoryDb(userId)
  for (const r of userRecords) {
    try { await db.delete(r.id) } catch { /* ignore */ }
  }
  saveMemories(records.filter(r => r.userId !== userId))
}
