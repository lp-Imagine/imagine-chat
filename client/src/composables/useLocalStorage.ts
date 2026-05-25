import { ref, watch } from 'vue'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cache = new Map<string, any>()

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

function deserialize<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T
  } catch {
    return raw as unknown as T
  }
}
