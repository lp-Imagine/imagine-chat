import path from 'path'
import fs from 'fs'

// 编译后 __dirname 在 dist/ 下，数据目录需要在项目根目录
// → 检测到 __dirname 以 dist 结尾时回退一层到项目根
const SERVER_ROOT = __dirname.endsWith('dist') ? path.join(__dirname, '..') : __dirname

export const JWT_SECRET: string = process.env.JWT_SECRET || 'ai-agent-jwt-secret-2024'
export const JWT_EXPIRES_IN: string = '7d'
export const PORT: number = Number(process.env.PORT) || 3000
export const DATA_FILE: string = path.join(SERVER_ROOT, 'data', 'chat.json')
export const USERS_FILE: string = path.join(SERVER_ROOT, 'data', 'users.json')
export const CONTEXT_FILE: string = path.join(SERVER_ROOT, 'context.md')
export const CONFIG_FILE: string = path.join(SERVER_ROOT, 'data', 'api-config.json')
export const CONTEXT_ROUNDS: number = 10

// RAG 知识库 & 记忆数据文件
export const KNOWLEDGE_DOCS_FILE = path.join(SERVER_ROOT, 'data', 'knowledge-docs.json')
export const MEMORY_RECORDS_FILE = path.join(SERVER_ROOT, 'data', 'memory-records.json')
export const KNOWLEDGE_VECTORS_DIR = path.join(SERVER_ROOT, 'data', 'knowledge-vectors')
export const MEMORY_VECTORS_DIR = path.join(SERVER_ROOT, 'data', 'memory-vectors')
export const UPLOADS_DIR = path.join(SERVER_ROOT, 'data', 'uploads')

// 默认值从环境变量读取，作为兜底（运行时配置可被前端动态覆盖）
const DEFAULT_API_BASE_URL = process.env.API_BASE_URL || 'https://api.deepseek.com'
const DEFAULT_API_KEY = process.env.API_KEY || ''
const DEFAULT_LLM_MODEL = process.env.LLM_MODEL || 'deepseek-v4-flash'

// Embedding 默认值：只用专用环境变量，不 fallback 到 LLM 配置
// 原因：DeepSeek 等主流 LLM 服务商不支持 embedding 接口，混用会导致 404
const DEFAULT_EMBEDDING_API_BASE_URL = process.env.EMBEDDING_API_BASE_URL || 'https://api.openai.com'
const DEFAULT_EMBEDDING_API_KEY = process.env.EMBEDDING_API_KEY || ''
const DEFAULT_EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'text-embedding-3-small'

// 运行时配置（可被前端动态修改，存储在磁盘上的 api-config.json）
interface ApiConfig {
  apiBaseUrl: string
  apiKey: string
  llmModel: string
  embeddingApiBaseUrl: string
  embeddingApiKey: string
  embeddingModel: string
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
        embeddingApiBaseUrl: saved.embeddingApiBaseUrl || DEFAULT_EMBEDDING_API_BASE_URL,
        embeddingApiKey: saved.embeddingApiKey || DEFAULT_EMBEDDING_API_KEY,
        embeddingModel: saved.embeddingModel || DEFAULT_EMBEDDING_MODEL,
      }
      return runtimeConfig
    }
  } catch { /* ignore */ }
  return {
    apiBaseUrl: DEFAULT_API_BASE_URL,
    apiKey: DEFAULT_API_KEY,
    llmModel: DEFAULT_LLM_MODEL,
    embeddingApiBaseUrl: DEFAULT_EMBEDDING_API_BASE_URL,
    embeddingApiKey: DEFAULT_EMBEDDING_API_KEY,
    embeddingModel: DEFAULT_EMBEDDING_MODEL,
  }
}

// 标准化 LLM API 地址：去除末尾多余路径
// OpenAI SDK v3 的 URL 拼接规则：configuration.basePath + axiosArgs.url
// 例如 basePath='https://api.openai.com/v1' + url='/chat/completions' = 正确
// 但用户可能粘贴完整路径，需要清除 SDK 会自动追加的部分
function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, '').replace(/\/embeddings\/?$/, '')
}

// 标准化 Embedding API 地址：与 LLM 同理，但需要保留 /v1 前缀
// 用户常见错误：粘贴 https://api.siliconflow.cn/v1/embeddings
// → SDK 会再拼 /embeddings → /v1/embeddings/embeddings → 404
// 修复方式：去掉末尾的 /embeddings，保留 /v1
function normalizeEmbeddingBaseUrl(url: string): string {
  return url.replace(/\/+$/, '').replace(/\/v1\/embeddings\/?$/, '/v1').replace(/\/embeddings\/?$/, '')
}

export function getApiBaseUrl(): string {
  return normalizeBaseUrl(loadApiConfig().apiBaseUrl)
}

export function getApiKey(): string {
  return loadApiConfig().apiKey
}

export function getLlmModel(): string {
  return loadApiConfig().llmModel
}

export function getEmbeddingApiBaseUrl(): string {
  return normalizeEmbeddingBaseUrl(loadApiConfig().embeddingApiBaseUrl)
}

export function getEmbeddingApiKey(): string {
  return loadApiConfig().embeddingApiKey
}

export function getEmbeddingModel(): string {
  return loadApiConfig().embeddingModel
}

// 保存 API 配置到磁盘（api-config.json），并立即更新内存缓存
export function saveApiConfig(config: Partial<ApiConfig>): ApiConfig {
  const current = loadApiConfig()
  const updated: ApiConfig = {
    apiBaseUrl: config.apiBaseUrl ?? current.apiBaseUrl,
    apiKey: config.apiKey ?? current.apiKey,
    llmModel: config.llmModel ?? current.llmModel,
    embeddingApiBaseUrl: config.embeddingApiBaseUrl ?? current.embeddingApiBaseUrl,
    embeddingApiKey: config.embeddingApiKey ?? current.embeddingApiKey,
    embeddingModel: config.embeddingModel ?? current.embeddingModel,
  }
  const dir = path.dirname(CONFIG_FILE)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(updated, null, 2), 'utf-8')
  runtimeConfig = updated
  return updated
}

// 向后兼容导出（旧代码直接 import 这些常量）
export const API_BASE_URL: string = DEFAULT_API_BASE_URL
export const API_KEY: string = DEFAULT_API_KEY
export const LLM_MODEL: string = DEFAULT_LLM_MODEL
