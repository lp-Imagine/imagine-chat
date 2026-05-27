<template>
  <div class="auth-container">
    <canvas ref="particleCanvas" class="particle-canvas" />

    <div class="auth-card">
      <div class="auth-brand">
        <div class="brand-icon">
          <svg viewBox="0 0 48 48" fill="none">
            <rect width="48" height="48" rx="14" fill="url(#bg)"/>
            <path d="M16 32V16l8 6-8 6zm0 0l8-6 8 6" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
            <circle cx="24" cy="24" r="3" fill="#fff"/>
            <defs>
              <linearGradient id="bg" x1="0" y1="0" x2="48" y2="48">
                <stop stop-color="#3b5cf6"/>
                <stop offset="1" stop-color="#8b5cf6"/>
              </linearGradient>
            </defs>
          </svg>
        </div>
        <h1 class="auth-title">IMAGINE CHAT</h1>
      </div>
      <p class="auth-subtitle">{{ isLogin ? '欢迎回来，继续你的探索' : '创建账号，开启智能之旅' }}</p>

      <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent>
        <el-form-item label="用户名" prop="username">
          <el-input
            v-model="form.username"
            placeholder="请输入用户名"
            :prefix-icon="User"
            size="large"
            @keyup.enter="submit"
          />
        </el-form-item>

        <el-form-item label="密码" prop="password">
          <el-input
            v-model="form.password"
            type="password"
            placeholder="请输入密码"
            :prefix-icon="Lock"
            size="large"
            show-password
            @keyup.enter="submit"
          />
        </el-form-item>

        <el-form-item v-if="!isLogin" label="确认密码" prop="confirmPassword">
          <el-input
            v-model="form.confirmPassword"
            type="password"
            placeholder="请再次输入密码"
            :prefix-icon="Lock"
            size="large"
            show-password
            @keyup.enter="submit"
          />
        </el-form-item>

        <el-form-item>
          <el-button
            type="primary"
            size="large"
            :loading="loading"
            class="submit-btn"
            @click="submit"
          >
            {{ isLogin ? '登录' : '注册' }}
          </el-button>
        </el-form-item>
      </el-form>

      <div class="auth-switch">
        <span>{{ isLogin ? '还没有账号？' : '已有账号？' }}</span>
        <el-button link type="primary" @click="toggleMode">
          {{ isLogin ? '立即注册' : '去登录' }}
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onBeforeUnmount } from 'vue'
import { User, Lock } from '@element-plus/icons-vue'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { setAuth } from '@/utils/auth'
import { api } from '@/api'

const emit = defineEmits<{ loginSuccess: [] }>()

const isLogin = ref(true)
const loading = ref(false)
const formRef = ref<FormInstance>()

const form = reactive({
  username: '',
  password: '',
  confirmPassword: ''
})

const rules: FormRules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { min: 2, max: 20, message: '用户名长度在 2 到 20 个字符', trigger: 'blur' }
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, message: '密码长度不能少于6位', trigger: 'blur' }
  ],
  confirmPassword: [
    {
      validator: (_rule, value, callback) => {
        if (isLogin.value) return callback()
        if (!value) return callback(new Error('请再次输入密码'))
        if (value !== form.password) return callback(new Error('两次输入的密码不一致'))
        callback()
      },
      trigger: 'blur'
    }
  ]
}

function toggleMode() {
  isLogin.value = !isLogin.value
  form.confirmPassword = ''
  formRef.value?.clearValidate()
}

async function submit() {
  if (!formRef.value) return
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  loading.value = true
  try {
    const data = isLogin.value
      ? await api.login(form.username, form.password)
      : await api.register(form.username, form.password)

    setAuth(data.token, data.user)
    ElMessage.success(isLogin.value ? '登录成功' : '注册成功')
    emit('loginSuccess')
  } catch (e: any) {
    ElMessage.error(e.message || '操作失败')
  } finally {
    loading.value = false
  }
}

// ====== 粒子动画 ======
const particleCanvas = ref<HTMLCanvasElement>()
let animId = 0

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  r: number
  alpha: number
}

onMounted(() => {
  const canvas = particleCanvas.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  let w = 0, h = 0
  const particles: Particle[] = []
  const count = 80

  function resize() {
    w = canvas!.width = window.innerWidth
    h = canvas!.height = window.innerHeight
  }
  resize()
  window.addEventListener('resize', resize)

  for (let i = 0; i < count; i++) {
    particles.push({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      r: Math.random() * 2 + 0.8,
      alpha: Math.random() * 0.4 + 0.1
    })
  }

  function draw() {
    ctx!.clearRect(0, 0, w, h)

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i]
      p.x += p.vx
      p.y += p.vy
      if (p.x < 0) p.x = w
      if (p.x > w) p.x = 0
      if (p.y < 0) p.y = h
      if (p.y > h) p.y = 0

      ctx!.beginPath()
      ctx!.arc(p.x, p.y, p.r, 0, Math.PI * 2)
      ctx!.fillStyle = `rgba(99, 102, 241, ${p.alpha})`
      ctx!.fill()

      // 连线：距相邻粒子 < 120px 时画半透明线
      for (let j = i + 1; j < particles.length; j++) {
        const q = particles[j]
        const dx = p.x - q.x
        const dy = p.y - q.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < 120) {
          ctx!.beginPath()
          ctx!.moveTo(p.x, p.y)
          ctx!.lineTo(q.x, q.y)
          ctx!.strokeStyle = `rgba(99, 102, 241, ${0.08 * (1 - dist / 120)})`
          ctx!.lineWidth = 0.5
          ctx!.stroke()
        }
      }
    }

    animId = requestAnimationFrame(draw)
  }
  draw()
})

onBeforeUnmount(() => {
  cancelAnimationFrame(animId)
})
</script>

<style scoped>
.auth-container {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100vh;
  overflow: hidden;
  background: linear-gradient(135deg, #0f0f23 0%, #1a1040 30%, #0d1b3e 60%, #0f0f23 100%);
  background-size: 300% 300%;
  animation: gradientShift 15s ease infinite;
}

[data-theme="light"] .auth-container {
  background: linear-gradient(135deg, #e8ecf5 0%, #dfe6f0 30%, #edf2f9 60%, #e8ecf5 100%);
  background-size: 300% 300%;
}

@keyframes gradientShift {
  0%, 100% { background-position: 0% 50%; }
  25% { background-position: 100% 0%; }
  50% { background-position: 100% 100%; }
  75% { background-position: 0% 100%; }
}

.particle-canvas {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
}

.auth-card {
  position: relative;
  z-index: 1;
  width: 420px;
  padding: 40px;
  background: var(--bg-glass);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border-radius: 24px;
  box-shadow: var(--shadow-glass), inset 0 1px 0 rgba(255,255,255,.08);
  border: 1px solid var(--border-primary);
}

[data-theme="light"] .auth-card {
  box-shadow: 0 8px 32px rgba(0,0,0,.08), inset 0 1px 0 rgba(255,255,255,.6);
}

.auth-brand {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}

.brand-icon {
  width: 56px;
  height: 56px;
}

.brand-icon svg {
  width: 100%;
  height: 100%;
  filter: drop-shadow(0 4px 12px rgba(59, 92, 246, 0.4));
}

.auth-title {
  text-align: center;
  font-size: 26px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
  letter-spacing: 2px;
}

.auth-subtitle {
  text-align: center;
  color: var(--text-muted);
  margin: 0 0 32px 0;
  font-size: 14px;
}

/* Element Plus form overrides */
.auth-card :deep(.el-form-item__label) {
  color: var(--text-secondary);
  font-weight: 500;
}

.auth-card :deep(.el-input__wrapper) {
  background: var(--bg-surface);
  border: 1px solid var(--border-primary);
  border-radius: 12px;
  box-shadow: none;
  transition: border-color .2s, box-shadow .2s;
}

.auth-card :deep(.el-input__wrapper:hover) {
  border-color: rgba(128, 128, 128, 0.25);
}

.auth-card :deep(.el-input__wrapper.is-focus) {
  border-color: var(--border-focus);
  box-shadow: 0 0 0 3px var(--accent-ring);
}

.auth-card :deep(.el-input__inner) {
  color: var(--text-primary);
  caret-color: var(--accent);
}

.auth-card :deep(.el-input__inner::placeholder) {
  color: var(--text-placeholder);
}

.auth-card :deep(.el-input__prefix) {
  color: var(--text-muted);
}

.auth-card :deep(.el-input__suffix) {
  color: var(--text-muted);
}

.submit-btn {
  width: 100%;
  height: 46px;
  border-radius: 14px;
  font-weight: 600;
  font-size: 15px;
  letter-spacing: 1px;
  background: var(--accent-gradient) !important;
  border: none !important;
  transition: all .25s !important;
}

.submit-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px var(--accent-glow);
}

.auth-switch {
  text-align: center;
  font-size: 14px;
  color: var(--text-muted);
}

.auth-switch :deep(.el-button) {
  color: var(--accent-light);
  font-weight: 500;
}

/* ====== 移动端 ====== */
@media (max-width: 768px) {
  .auth-container {
    align-items: flex-start;
    padding: 0;
  }

  .particle-canvas {
    display: none;
  }

  .auth-card {
    width: 100%;
    min-height: 100vh;
    min-height: 100dvh;
    border-radius: 0;
    padding: 60px 24px 40px;
    background: transparent;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    box-shadow: none;
    border: none;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }

  [data-theme="light"] .auth-card {
    box-shadow: none;
  }

  .brand-icon {
    width: 44px;
    height: 44px;
  }

  .auth-title {
    font-size: 22px;
    letter-spacing: 1px;
  }

  .auth-subtitle {
    font-size: 13px;
    margin-bottom: 28px;
  }

  .auth-card :deep(.el-form-item) {
    margin-bottom: 16px;
  }

  .auth-card :deep(.el-form-item__label) {
    font-size: 13px;
  }

  .auth-card :deep(.el-input__wrapper) {
    border-radius: 10px;
    padding: 6px 12px;
  }

  .submit-btn {
    height: 44px;
    border-radius: 12px;
    font-size: 15px;
  }

  .auth-switch {
    font-size: 13px;
    margin-top: 4px;
  }
}
</style>
