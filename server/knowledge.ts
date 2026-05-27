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
// 每个用户在磁盘上有一个独立的 RuVector DB 文件
// 维度在首次写入时自动检测（不同 embedding 模型输出维度不同，如 OpenAI 1536，Qwen3 4096）

let vectorDb: any = null
let vectorDbUserId: string | null = null
let vectorDbDimension: number | null = null

function getVectorDb(userId: string, dimension?: number): any {
  const dim = dimension || vectorDbDimension || 1536
  // 用户切换或维度变化时重建实例（单用户场景下很少触发）
  if (vectorDb && vectorDbUserId === userId && vectorDbDimension === dim) return vectorDb
  const dbDir = path.join(KNOWLEDGE_VECTORS_DIR, userId)
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true })
  const dbPath = path.join(dbDir, 'vectors.db')
  vectorDb = new VectorDB({
    dimensions: dim,
    storagePath: dbPath,
    metric: 'cosine'
  })
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

// ========== 各格式文本提取 ==========

async function extractPdfText(buffer: Buffer): Promise<string> {
  // 使用 pdfjs-dist 的 legacy 构建，兼容 Node.js 环境（没有浏览器 DOM API）
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise
  let text = ''
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    const pageText = content.items.map((item: any) => item.str).join(' ')
    text += pageText + '\n'
  }
  return text.trim()
}

async function extractDocxText(buffer: Buffer): Promise<string> {
  // mammoth 将 .docx 转为纯文本，忽略格式（加粗、颜色等）
  const mammoth = await import('mammoth')
  const result = await mammoth.extractRawText({ buffer })
  return result.value.trim()
}

function extractXlsxText(buffer: Buffer): string {
  // xlsx 是同步 API，每个 sheet 转 CSV 后带上 sheet 名作为标签
  const XLSX = require('xlsx')
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const texts: string[] = []
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    const csv = XLSX.utils.sheet_to_csv(sheet)
    if (csv.trim()) {
      texts.push(`[Sheet: ${sheetName}]\n${csv}`)
    }
  }
  return texts.join('\n\n')
}

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
