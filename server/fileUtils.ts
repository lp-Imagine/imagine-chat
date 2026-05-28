// 文件解析工具
// - 文本提取：PDF(pdfjs-dist)、DOCX(mammoth)、XLSX(xlsx)、纯文本
// - OCR：Tesseract.js 中英文混合识别，Worker 单例复用
// - 视觉模型检测：基于模式匹配判断模型是否支持图片输入
import path from 'path'

// ========== 各格式文本提取 ==========

export async function extractPdfText(buffer: Buffer): Promise<string> {
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

export async function extractDocxText(buffer: Buffer): Promise<string> {
  const mammoth = await import('mammoth')
  const result = await mammoth.extractRawText({ buffer })
  return result.value.trim()
}

export function extractXlsxText(buffer: Buffer): string {
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

// OCR 图片文字识别（用于非视觉模型）
let _ocrWorker: any = null

async function getOcrWorker(): Promise<any> {
  if (_ocrWorker) return _ocrWorker
  const Tesseract = (await import('tesseract.js')).default
  _ocrWorker = await Tesseract.createWorker('eng+chi_sim', 1, {
    logger: (m: any) => { if (m.status === 'recognizing text') console.log(`[OCR] 进度: ${Math.round(m.progress * 100)}%`) }
  })
  console.log('[OCR] Worker 初始化完成')
  return _ocrWorker
}

// 服务启动时调用，预下载语言数据
export async function initOcr(): Promise<void> {
  try { await getOcrWorker() } catch (err) { console.error('[OCR] 初始化失败:', err) }
}

export async function ocrImage(buffer: Buffer): Promise<string> {
  const worker = await getOcrWorker()
  const { data: { text } } = await worker.recognize(buffer)
  return text.trim()
}

// 根据文件扩展名自动选择提取方法
export async function extractFileText(buffer: Buffer, fileName: string): Promise<string> {
  const ext = path.extname(fileName).toLowerCase()
  if (ext === '.pdf') return extractPdfText(buffer)
  if (ext === '.docx') return extractDocxText(buffer)
  if (ext === '.xlsx' || ext === '.xls') return extractXlsxText(buffer)
  return buffer.toString('utf-8')
}

// ========== 视觉模型检测 ==========
// 基于通用模式匹配，自动适配大多数模型，避免硬编码具体模型 ID
// 规则：正向优先 — 视觉标识符（vl/vision/omni 等）优先匹配，避免被负向规则误伤

export function supportsVisionModel(model: string): boolean {
  const m = model.toLowerCase()

  // 正向优先：通用视觉/多模态标识符
  // - vl / vision : DeepSeek VL 系列、Qwen-VL 等
  // - omni       : 多模态模型（如 qwen-omni）
  // - gpt-4o     : OpenAI 多模态系列（o=omni）
  // - gpt-5      : 未来 OpenAI 系列
  // - o1 / o3 / o4 : OpenAI reasoning（部分支持视觉）
  // - claude-3 / claude-4 / claude-3.5 : Anthropic（Claude 3+ 全系支持视觉）
  // - gemini     : Google（几乎所有 Gemini 型号都支持视觉）
  // - cogview / glm-4v : 智谱
  const VISION_PATTERNS = [
    'vl', 'vision', 'omni',
    'gpt-4o', 'gpt-4-turbo', 'gpt-4-vision', 'gpt-5',
    'o1-', 'o3-', 'o4-',
    'claude-3', 'claude-4', 'claude-3.5',
    'gemini-2', 'gemini-1.5', 'gemini-3', 'gemini-pro-vision',
    'cogview', 'glm-4v',
    'kimi-k2', 'kimi-k1.5',
  ]
  if (VISION_PATTERNS.some(p => m.includes(p))) return true

  // 负向：已知纯文本模型（正向之后检查，仅排除未匹配到视觉标识符的模型）
  const TEXT_ONLY_PATTERNS = [
    'deepseek-chat', 'deepseek-reasoner', 'deepseek-coder',
    'llama-3.2-1b', 'llama-3.2-3b',
  ]
  if (TEXT_ONLY_PATTERNS.some(p => m.includes(p))) return false

  return false
}
