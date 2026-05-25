import { ref, watchEffect, onUnmounted } from 'vue'

export type ThemeMode = 'light' | 'dark' | 'auto'
type ResolvedTheme = 'light' | 'dark'

const STORAGE_KEY = 'imagine-theme'
const stored = localStorage.getItem(STORAGE_KEY) as ThemeMode | null
const currentMode = ref<ThemeMode>(stored || 'auto')
const resolved = ref<ResolvedTheme>('dark')

let mediaQuery: MediaQueryList | null = null

function applyTheme(theme: ResolvedTheme) {
  document.documentElement.setAttribute('data-theme', theme)
  resolved.value = theme
}

function detectSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'dark'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function update() {
  const mode = currentMode.value
  const theme = mode === 'auto' ? detectSystemTheme() : mode
  applyTheme(theme)
}

// 监听系统主题变化
function setupMediaListener() {
  if (!mediaQuery && typeof window !== 'undefined') {
    mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    mediaQuery.addEventListener('change', () => {
      if (currentMode.value === 'auto') {
        applyTheme(detectSystemTheme())
      }
    })
  }
}

// 初始化
setupMediaListener()
update()

// 监听 mode 变化（来自 toggle/setMode 调用）
watchEffect(() => {
  localStorage.setItem(STORAGE_KEY, currentMode.value)
  update()
  if (currentMode.value === 'auto') setupMediaListener()
})

export function useTheme() {
  function setMode(mode: ThemeMode) {
    currentMode.value = mode
  }

  function toggle() {
    // 循环切换：auto → light → dark → auto
    const order: ThemeMode[] = ['auto', 'light', 'dark']
    const idx = order.indexOf(currentMode.value)
    currentMode.value = order[(idx + 1) % order.length]
  }

  return {
    mode: currentMode,
    resolved,
    setMode,
    toggle
  }
}
