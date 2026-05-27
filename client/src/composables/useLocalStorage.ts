import { ref, watch } from 'vue'

// 跨组件共享 localStorage 引用：同一 key 在多处 useLocalStorageRef 时共享同一个 ref
// 避免 A 组件读、B 组件写时出现数据不同步
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cache = new Map<string, any>()

// 将 localStorage 值包装为响应式 ref，修改时自动持久化
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useLocalStorageRef<T>(key: string, defaultValue: T): any {
  const cached = cache.get(key)
  if (cached) return cached

  const stored = localStorage.getItem(key)
  const val = ref<T>(stored !== null ? deserialize(stored, defaultValue) : defaultValue)

  watch(val, (v) => {
    localStorage.setItem(key, JSON.stringify(v))
  })

  cache.set(key, val)
  return val
}

// 反序列化：先尝试 JSON.parse，失败则返回原始字符串
function deserialize<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T
  } catch {
    return raw as unknown as T
  }
}
