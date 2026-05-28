// 聊天附件上传路由
// 处理图片和文件的接收、存储、OCR/文本提取
import { Router, Request, Response } from 'express'
import multer from 'multer'
import fs from 'fs'
import path from 'path'
import { uid } from '../utils'
import { authMiddleware } from '../auth'
import { extractFileText, ocrImage } from '../fileUtils'
import { UPLOADS_DIR } from '../config'

// multer 内部使用 busboy 解析 multipart，对非 ASCII 文件名会按 Latin-1 编码导致中文乱码
function decodeFilename(name: string): string {
  try {
    return Buffer.from(name, 'latin1').toString('utf8')
  } catch { return name }
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      // 按用户隔离上传目录：data/uploads/{userId}/
      const dir = path.join(UPLOADS_DIR, (_req as any).userId || 'anonymous')
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      cb(null, dir)
    },
    filename: (_req, file, cb) => {
      const decoded = decodeFilename(file.originalname)
      // 过滤特殊字符，保留中文、字母、数字、常用符号，防止路径穿越
      const safeName = decoded.replace(/[^a-zA-Z0-9._\-一-鿿㐀-䶿]/g, '_')
      cb(null, `${uid()}_${safeName}`)
    }
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const imageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']
    // 图片按 MIME 类型放行，文件按扩展名白名单
    const allowed = ['.txt', '.md', '.pdf', '.docx', '.xlsx', '.xls', '.csv', '.json', '.xml', '.html', '.py', '.js', '.ts', '.java', '.go', '.rs', '.yml', '.yaml']
    const ext = path.extname(decodeFilename(file.originalname)).toLowerCase()
    if (imageTypes.includes(file.mimetype) || allowed.includes(ext)) {
      cb(null, true)
    } else {
      cb(new Error(`不支持的文件类型: ${ext}`))
    }
  }
})

export function createUploadRouter(): Router {
  const router = Router()

  // POST /api/upload — 上传聊天附件
  router.post('/', authMiddleware, upload.single('file'), async (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({ error: '请选择文件上传' })
      return
    }
    const relPath = `/uploads/${req.userId}/${req.file.filename}`
    const isImage = req.file.mimetype.startsWith('image/')

    const filePath = req.file.path
    // 缓存提取结果到 .meta.json，后续发消息时直接读取，避免重复 OCR/解析
    const metaPath = filePath + '.meta.json'
    const buf = fs.readFileSync(filePath)

    let extractedText: string | undefined
    try {
      const extractPromise = isImage
        ? ocrImage(buf)
        : extractFileText(buf, decodeFilename(req.file.originalname))
      // 直接等待提取完成，不再设超时（大文件 PDF 解析可能超过 15s）
      // 超时会导致 extractedText 为空、缓存不写入，后续发消息时 LLM 看不到文件内容
      const result = await extractPromise
      extractedText = result?.trim() || undefined
      if (extractedText) {
        try { fs.writeFileSync(metaPath, extractedText, 'utf-8') } catch { /* ignore */ }
      }
    } catch (err: any) { console.error(`[提取/OCR] 失败:`, err.message || err) }

    res.json({
      id: uid(),
      name: decodeFilename(req.file.originalname),
      url: relPath,
      type: isImage ? 'image' : 'file',
      mimeType: req.file.mimetype,
      size: req.file.size,
      extractedText
    })
  })

  return router
}
