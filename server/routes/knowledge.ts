// 知识库路由：文档上传、列表、删除、搜索、内容查看
// multer 使用 memoryStorage（不落盘），由 knowledge.processDocument 处理 buffer
import { Router, Request, Response } from 'express'
import multer from 'multer'
import path from 'path'
import { authMiddleware } from '../auth'
import { processDocument, searchKnowledge, deleteDocument, getDocuments, getDocumentContent } from '../knowledge'

// multer 配置只在这里使用（知识库上传），不放在 index.ts
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  defParamCharset: 'utf-8', // multer v2 默认 latin1，中文文件名会乱码
  fileFilter: (_req, file, cb) => {
    const allowed = ['.txt', '.md', '.pdf', '.docx', '.xlsx', '.xls']
    const ext = path.extname(file.originalname).toLowerCase()
    if (allowed.includes(ext)) {
      cb(null, true)
    } else {
      cb(new Error(`不支持的文件类型: ${ext}，仅支持 ${allowed.join(', ')}`))
    }
  }
})

export function createKnowledgeRouter(): Router {
  const router = Router()

  // 上传文档
  router.post('/upload', authMiddleware, upload.single('file'), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: '请选择文件上传' })
        return
      }
      const doc = await processDocument(req.userId!, req.file.buffer, req.file.originalname)
      res.json(doc)
    } catch (e: any) {
      res.status(500).json({ error: e.message || '上传失败' })
    }
  })

  // 获取文档列表
  router.get('/documents', authMiddleware, (_req: Request, res: Response) => {
    const docs = getDocuments()
    res.json(docs)
  })

  // 删除文档
  router.delete('/documents', authMiddleware, async (req: Request, res: Response) => {
    const docId = req.query.id as string
    if (!docId) {
      res.status(400).json({ error: '请指定文档ID' })
      return
    }
    try {
      await deleteDocument(req.userId!, docId)
      res.json({ success: true })
    } catch (e: any) {
      res.status(500).json({ error: e.message || '删除失败' })
    }
  })

  // 批量删除文档
  router.delete('/documents/batch', authMiddleware, async (req: Request, res: Response) => {
    const { ids } = req.body as { ids: string[] }
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: '请指定要删除的文档ID列表' })
      return
    }
    try {
      let deleted = 0
      for (const id of ids) {
        await deleteDocument(req.userId!, id)
        deleted++
      }
      res.json({ success: true, deleted })
    } catch (e: any) {
      res.status(500).json({ error: e.message || '批量删除失败' })
    }
  })

  // 获取文档完整文本
  router.get('/documents/:id/content', authMiddleware, async (req: Request, res: Response) => {
    const docId = req.params.id
    if (!docId) {
      res.status(400).json({ error: '请指定文档ID' })
      return
    }
    try {
      const content = await getDocumentContent(req.userId!, docId)
      if (content === null) {
        res.status(404).json({ error: '文档不存在' })
        return
      }
      res.json({ content })
    } catch (e: any) {
      res.status(500).json({ error: e.message || '获取失败' })
    }
  })

  // 搜索知识库
  router.post('/search', authMiddleware, async (req: Request, res: Response) => {
    const { query, k } = req.body as { query: string; k?: number }
    if (!query || !query.trim()) {
      res.status(400).json({ error: '请提供搜索内容' })
      return
    }
    try {
      const results = await searchKnowledge(req.userId!, query, k || 3)
      res.json(results)
    } catch (e: any) {
      res.status(500).json({ error: e.message || '搜索失败' })
    }
  })

  return router
}
