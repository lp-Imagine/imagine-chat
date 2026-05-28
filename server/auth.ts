// 用户认证模块
// - bcrypt 哈希密码（cost=10），不存明文
// - JWT 签发的 userId 即 username，7 天有效
// - authMiddleware 验证 Bearer token，将 userId 挂载到 req
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { Request, Response, NextFunction } from 'express'
import { readData, writeData } from './utils'
import { JWT_SECRET, USERS_FILE } from './config'
import type { UsersStore } from './types'

function getUsers(): UsersStore {
  return readData(USERS_FILE) as UsersStore
}

function saveUsers(users: UsersStore): void {
  writeData(users, USERS_FILE)
}

// 注册新用户，返回 { user, token }
export function registerUser(username: string, password: string): { token: string; user: { username: string } } {
  if (!username || !username.trim()) {
    throw new Error('用户名不能为空')
  }
  if (username.trim().length < 2 || username.trim().length > 20) {
    throw new Error('用户名长度需在 2-20 个字符之间')
  }
  if (!password || password.length < 6) {
    throw new Error('密码长度不能少于 6 位')
  }

  const users = getUsers()
  const name = username.trim()

  if (users[name]) {
    throw new Error('用户名已存在')
  }

  const hashedPassword = bcrypt.hashSync(password, 10)
  users[name] = {
    username: name,
    password: hashedPassword,
    createdAt: Date.now()
  }
  saveUsers(users)

  const token = jwt.sign({ userId: name }, JWT_SECRET, { expiresIn: '7d' as const })
  return { token, user: { username: name } }
}

// 登录验证，成功返回 { user, token }
export function loginUser(username: string, password: string): { token: string; user: { username: string } } {
  if (!username || !password) {
    throw new Error('用户名和密码不能为空')
  }

  const users = getUsers()
  const user = users[username]

  if (!user || !bcrypt.compareSync(password, user.password)) {
    throw new Error('用户名或密码错误')
  }

  const token = jwt.sign({ userId: username }, JWT_SECRET, { expiresIn: '7d' as const })
  return { token, user: { username } }
}

// Express 中间件：验证 JWT，将 userId 挂载到 req
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: '未登录，请先登录' })
    return
  }
  try {
    const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET) as { userId: string }
    req.userId = decoded.userId
    next()
  } catch {
    res.status(401).json({ error: '登录已过期，请重新登录' })
  }
}
