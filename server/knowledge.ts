import path from 'path'
import fs from 'fs'
import { uid, readData, writeData } from './utils'
import { embedText, embedBatch } from './embeddings'
import { KNOWLEDGE_DOCS_FILE, KNOWLEDGE_VECTORS_DIR, UPLOADS_DIR } from './config'

// ruvector 是 CJS 模块，且无 TS 类型声明，只能用 require
const { VectorDB } = require('ruvector')

// ========== 文档元数据存储 ==========
// 元数据存 JSON 文件，向量存 RuVector，两者通过 docId 关联
// 元数据用于列表展示，向量用于语义搜索

interface KnowledgeDoc {
  id: string
  fileName: string
  fileType: string
  fileSize: number
  chunkCount: number
  createdAt: number
}

function loadDocs(): KnowledgeDoc[] {
  const data = readData(KNOWLEDGE_DOCS_FILE)
  return (data.docs as KnowledgeDoc[]) || []
}

function saveDocs(docs: KnowledgeDoc[]): void {
  writeData({ docs }, KNOWLEDGE_DOCS_FILE)
}

// ========== 向量数据库实例（懒加载） ==========
// 首选 RuVector native 模块，构造失败则回退到纯 JS 内存实现
// RuVector 依赖平台特定的 native addon（如 ruvector-core-linux-x64-gnu），
// 线上环境可能因 glibc 版本不兼容导致 native 模块构造失败

let vectorDb: any = null
let vectorDbUserId: string | null = null
let vectorDbDimension: number | null = null
let useFallback = false

// 纯 JS 回退向量存储：余弦相似度搜索
function createFallbackStore() {
  const entries: { id: string; vector: number[]; metadata: any }[] = []
  return {
    async insertBatch(items: { id: string; vector: number[]; metadata: any }[]) {
      for (const item of items) entries.push(item)
      return items.map(i => i.id)
    },
    async search(opts: { vector: number[]; k: number }) {
      const q = opts.vector
      const norm = (v: number[]) => Math.sqrt(v.reduce((s, x) => s + x * x, 0))
      const qNorm = norm(q) || 1
      const scored = entries.map(e => {
        const eNorm = norm(e.vector) || 1
        const dot = e.vector.reduce((s, x, i) => s + x * q[i], 0)
        return { id: e.id, score: dot / (qNorm * eNorm), metadata: e.metadata }
      })
      return scored.sort((a, b) => b.score - a.score).slice(0, opts.k)
    },
    async delete(id: string) {
      const idx = entries.findIndex(e => e.id === id)
      if (idx >= 0) entries.splice(idx, 1)
      return true
    },
    async get(id: string) {
      return entries.find(e => e.id === id) || null
    },
    async len() { return entries.length }
  }
}

function getVectorDb(userId: string, dimension?: number): any {
  const dim = dimension || vectorDbDimension || 1536
  if (vectorDb && vectorDbUserId === userId && vectorDbDimension === dim) return vectorDb
  const dbDir = path.join(KNOWLEDGE_VECTORS_DIR, userId)
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true })
  const dbPath = path.join(dbDir, 'vectors.db')

  if (!useFallback) {
    try {
      vectorDb = new VectorDB({
        dimensions: dim,
        storagePath: dbPath,
        metric: 'cosine'
      })
    } catch (e: any) {
      console.warn('[知识库] RuVector native 构造失败，回退到 JS 实现:', e.message)
      useFallback = true
      vectorDb = createFallbackStore()
    }
  } else {
    vectorDb = createFallbackStore()
  }

  vectorDbUserId = userId
  vectorDbDimension = dim
  return vectorDb
}

// ========== 文本分块 ==========
// 策略：优先按段落边界切分（保留语义完整性），超大块再降级为句子级切分
// chunkSize=500 是经验值，兼顾检索精度和上下文完整性
// overlap=50 确保相邻块之间有重叠，避免关键信息刚好落在边界两侧

function splitText(text: string, chunkSize = 500, overlap = 50): string[] {
  const chunks: string[] = []
  const paragraphs = text.split(/\n\n+/).filter(p => p.trim())
  let current = ''

  for (const para of paragraphs) {
    if ((current + '\n\n' + para).length > chunkSize && current.length > 0) {
      chunks.push(current.trim())
      // 取上一个块末尾 overlap 个字符作为重叠，拼接到新块开头
      const overlapText = current.slice(-overlap)
      current = overlapText + '\n\n' + para
    } else {
      current = current ? current + '\n\n' + para : para
    }
  }

  if (current.trim()) {
    chunks.push(current.trim())
  }

  // 段落级切分后仍超过 1.5 倍 chunkSize 的块，降级为句子级切分
  const result: string[] = []
  for (const chunk of chunks) {
    if (chunk.length <= chunkSize * 1.5) {
      result.push(chunk)
    } else {
      const sentences = chunk.split(/(?<=[。！？.!?])\s*/)
      let sub = ''
      for (const s of sentences) {
        if ((sub + s).length > chunkSize && sub.length > 0) {
          result.push(sub.trim())
          sub = sub.slice(-overlap) + s
        } else {
          sub += s
        }
      }
      if (sub.trim()) result.push(sub.trim())
    }
  }

  // 过滤掉太短的碎片（< 20 字符，无检索价值）
  return result.filter(c => c.length >= 20)
}

import { extractPdfText, extractDocxText, extractXlsxText } from './fileUtils'

// ========== 文档处理（上传入口） ==========
// 流程：提取文本 → 分块 → 批量向量化 → 写入向量库 + 保存文件 + 写元数据

export async function processDocument(
  userId: string,
  buffer: Buffer,
  fileName: string
): Promise<KnowledgeDoc> {
  // 检查同名文件是否已存在
  const existingDocs = loadDocs()
  const duplicate = existingDocs.find(d => d.fileName === fileName)
  if (duplicate) {
    throw new Error(`文件 "${fileName}" 已存在，请勿重复上传`)
  }

  const ext = path.extname(fileName).toLowerCase()
  let text: string

  if (ext === '.pdf') {
    text = await extractPdfText(buffer)
  } else if (ext === '.docx') {
    text = await extractDocxText(buffer)
  } else if (ext === '.xlsx' || ext === '.xls') {
    text = extractXlsxText(buffer)
  } else {
    // txt / md 等纯文本格式，直接 UTF-8 解码
    text = buffer.toString('utf-8')
  }

  if (!text || !text.trim()) {
    throw new Error('文档内容为空，无法解析')
  }

  const chunks = splitText(text)
  if (chunks.length === 0) {
    throw new Error('文档内容太少，无法分块')
  }

  // 批量向量化，一次 API 调用减少网络往返
  const vectors = await embedBatch(chunks)
  const dimension = vectors[0]?.length || 1536

  // 向量 ID 格式为 `${docId}_${chunkIndex}`，删除时可定位所有块
  const db = getVectorDb(userId, dimension)
  const docId = uid()
  const entries = chunks.map((chunk, i) => ({
    id: `${docId}_${i}`,
    vector: vectors[i],
    metadata: { docId, fileName, chunkIndex: i, text: chunk }
  }))
  await db.insertBatch(entries)

  // 保存原始文件副本到磁盘，便于后续追溯
  const uploadsDir = path.join(UPLOADS_DIR, userId)
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true })
  fs.writeFileSync(path.join(uploadsDir, `${docId}_${fileName}`), buffer)

  const doc: KnowledgeDoc = {
    id: docId,
    fileName,
    fileType: ext.replace('.', ''),
    fileSize: buffer.length,
    chunkCount: chunks.length,
    createdAt: Date.now()
  }
  const docs = loadDocs()
  docs.push(doc)
  saveDocs(docs)

  return doc
}

// ========== 语义搜索 ==========
// 将查询文本向量化 → 在向量库中搜索 top-k 最相似的文档块 → 返回原文+来源

export async function searchKnowledge(
  userId: string,
  query: string,
  k = 3
): Promise<Array<{ text: string; score: number; fileName: string }>> {
  const docs = loadDocs()
  if (docs.length === 0) return []

  const queryVector = await embedText(query)
  const dimension = queryVector.length
  const db = getVectorDb(userId, dimension)
  const results = await db.search({ vector: queryVector, k })

  return results.map((r: any) => ({
    text: r.metadata?.text || '',
    score: r.score,
    fileName: r.metadata?.fileName || ''
  }))
}

// ========== 删除文档 ==========
// 同时清理：向量库记录 + 磁盘文件 + 元数据 JSON

export async function deleteDocument(userId: string, docId: string): Promise<void> {
  const docs = loadDocs()
  const doc = docs.find(d => d.id === docId)
  if (!doc) return

  // 按 chunkIndex 逐个删除向量（RuVector 不支持按前缀批量删）
  const db = getVectorDb(userId)
  for (let i = 0; i < doc.chunkCount; i++) {
    try { await db.delete(`${docId}_${i}`) } catch { /* ignore */ }
  }

  const uploadsDir = path.join(UPLOADS_DIR, userId)
  const files = fs.readdirSync(uploadsDir)
  for (const f of files) {
    if (f.startsWith(docId)) {
      fs.unlinkSync(path.join(uploadsDir, f))
    }
  }

  saveDocs(docs.filter(d => d.id !== docId))
}

export function getDocuments(): KnowledgeDoc[] {
  return loadDocs()
}

// 获取文档完整文本（拼接所有块）
export async function getDocumentContent(userId: string, docId: string): Promise<string | null> {
  const docs = loadDocs()
  const doc = docs.find(d => d.id === docId)
  if (!doc) return null

  const db = getVectorDb(userId)
  const chunks: string[] = []
  for (let i = 0; i < doc.chunkCount; i++) {
    try {
      const entry = await db.get(`${docId}_${i}`)
      if (entry?.metadata?.text) chunks.push(entry.metadata.text)
    } catch { /* chunk may not exist */ }
  }
  return chunks.length > 0 ? chunks.join('\n\n') : null
}
