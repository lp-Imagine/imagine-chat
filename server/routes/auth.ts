// 认证路由：注册、登录、获取当前用户
import { Router, Request, Response } from 'express'
import { registerUser, loginUser, authMiddleware } from '../auth'

export function createAuthRouter(): Router {
  const router = Router()

  // 注册
  router.post('/register', (req: Request, res: Response) => {
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
  router.post('/login', (req: Request, res: Response) => {
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
  router.get('/me', authMiddleware, (req: Request, res: Response) => {
    res.json({ user: { username: req.userId } })
  })

  return router
}
