import { Router, Request, Response } from 'express'
import { authMiddleware } from '../auth'
import { retrieveMemories, getMemoryRecords, clearMemories } from '../memory'

export function createMemoryRouter(): Router {
  const router = Router()

  // 获取记忆列表
  router.get('/list', authMiddleware, (req: Request, res: Response) => {
    const records = getMemoryRecords(req.userId!)
    res.json(records)
  })

  // 搜索记忆
  router.post('/search', authMiddleware, async (req: Request, res: Response) => {
    const { query, k } = req.body as { query: string; k?: number }
    if (!query || !query.trim()) {
      res.status(400).json({ error: '请提供搜索内容' })
      return
    }
    try {
      const results = await retrieveMemories(req.userId!, query, k || 3)
      res.json(results)
    } catch (e: any) {
      res.status(500).json({ error: e.message || '搜索失败' })
    }
  })

  // 清除所有记忆
  router.delete('/clear', authMiddleware, async (req: Request, res: Response) => {
    try {
      await clearMemories(req.userId!)
      res.json({ success: true })
    } catch (e: any) {
      res.status(500).json({ error: e.message || '清除失败' })
    }
  })

  return router
}
