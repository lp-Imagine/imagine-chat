import path from 'path'
import fs from 'fs'

const SERVER_ROOT = __dirname.endsWith('dist') ? path.join(__dirname, '..') : __dirname

export const JWT_SECRET: string = process.env.JWT_SECRET || 'ai-agent-jwt-secret-2024'
export const JWT_EXPIRES_IN: string = '7d'
export const PORT: number = Number(process.env.PORT) || 3000
export const DATA_FILE: string = path.join(SERVER_ROOT, 'data', 'chat.json')
export const USERS_FILE: string = path.join(SERVER_ROOT, 'data', 'users.json')
export const CONTEXT_FILE: string = path.join(SERVER_ROOT, 'context.md')
export const CONFIG_FILE: string = path.join(SERVER_ROOT, 'data', 'api-config.json')
export const CONTEXT_ROUNDS: number = 10

// 默认值（从环境变量读取，作为兜底）
const DEFAULT_API_BASE_URL = process.env.API_BASE_URL || 'https://api.deepseek.com'
const DEFAULT_API_KEY = process.env.API_KEY || ''
const DEFAULT_LLM_MODEL = process.env.LLM_MODEL || 'deepseek-v4-flash'

// 运行时配置（可被前端动态修改）
interface ApiConfig {
  apiBaseUrl: string
  apiKey: string
  llmModel: string
}

let runtimeConfig: ApiConfig | null = null

function loadApiConfig(): ApiConfig {
  if (runtimeConfig) return runtimeConfig
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const saved = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'))
      runtimeConfig = {
        apiBaseUrl: saved.apiBaseUrl || DEFAULT_API_BASE_URL,
        apiKey: saved.apiKey || DEFAULT_API_KEY,
        llmModel: saved.llmModel || DEFAULT_LLM_MODEL,
      }
      return runtimeConfig
    }
  } catch { /* ignore */ }
  return {
    apiBaseUrl: DEFAULT_API_BASE_URL,
    apiKey: DEFAULT_API_KEY,
    llmModel: DEFAULT_LLM_MODEL,
  }
}

export function getApiBaseUrl(): string {
  return loadApiConfig().apiBaseUrl
}

export function getApiKey(): string {
  return loadApiConfig().apiKey
}

export function getLlmModel(): string {
  return loadApiConfig().llmModel
}

export function saveApiConfig(config: Partial<ApiConfig>): ApiConfig {
  const current = loadApiConfig()
  const updated: ApiConfig = {
    apiBaseUrl: config.apiBaseUrl ?? current.apiBaseUrl,
    apiKey: config.apiKey ?? current.apiKey,
    llmModel: config.llmModel ?? current.llmModel,
  }
  const dir = path.dirname(CONFIG_FILE)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(updated, null, 2), 'utf-8')
  runtimeConfig = updated
  return updated
}

// 保持向后兼容的导出（模块级常量，其他文件可能直接引用）
export const API_BASE_URL: string = DEFAULT_API_BASE_URL
export const API_KEY: string = DEFAULT_API_KEY
export const LLM_MODEL: string = DEFAULT_LLM_MODEL
