// 文本向量化（Embedding）模块
// 用于知识库和长期记忆的语义搜索
// 使用独立的 API 配置（不能复用 LLM 配置，因为 DeepSeek 等不支持 embedding 接口）
import { Configuration, OpenAIApi } from 'openai'
import { getEmbeddingApiBaseUrl, getEmbeddingApiKey, getEmbeddingModel } from './config'

// 独立的 embedding 客户端，不能复用 LLM 的配置
// → DeepSeek 等 LLM 服务商大多不支持 embedding 接口，需要用户单独配置 OpenAI / 硅基流动 等
function getEmbeddingClient(): OpenAIApi {
  return new OpenAIApi(new Configuration({
    basePath: getEmbeddingApiBaseUrl(),
    apiKey: getEmbeddingApiKey()
  }))
}

function ensureEmbeddingConfig() {
  if (!getEmbeddingApiKey()) {
    throw new Error('未配置 Embedding API Key，请在设置中配置（需要 OpenAI 或兼容的 API Key）')
  }
}

// 单条文本向量化 → number[]
export async function embedText(text: string): Promise<number[]> {
  ensureEmbeddingConfig()
  const openai = getEmbeddingClient()
  const res = await openai.createEmbedding({
    model: getEmbeddingModel(),
    input: text
  })
  // OpenAI SDK v3 的类型定义不完整，用 as any 绕过
  return (res.data as any).data[0].embedding as number[]
}

// 批量向量化，一次 API 调用处理多条文本
export async function embedBatch(texts: string[]): Promise<number[][]> {
  ensureEmbeddingConfig()
  const openai = getEmbeddingClient()
  const res = await openai.createEmbedding({
    model: getEmbeddingModel(),
    input: texts
  })
  return (res.data as any).data.map((d: any) => d.embedding as number[])
}
