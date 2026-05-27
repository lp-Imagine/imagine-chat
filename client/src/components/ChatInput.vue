<template>
  <div class="chat-input-area">
    <div class="input-wrapper">
      <el-input
        ref="inputRef"
        v-model="text"
        type="textarea"
        :rows="2"
        :autosize="{ minRows: 2, maxRows: 6 }"
        :placeholder="placeholder"
        resize="none"
        :disabled="disabled"
        @keydown="onKeydown"
      />
      <div class="input-bottom-bar">
        <div class="input-actions">
          <el-select
            v-model="selectedModel"
            class="model-select"
            size="small"
            placeholder="模型"
            :loading="loadingModels"
            popper-class="model-popper"
          >
            <template #prefix>
              <el-icon class="model-prefix-icon"><Cpu /></el-icon>
            </template>
            <el-option
              v-for="m in modelList"
              :key="m.id"
              :label="modelLabel(m.id)"
              :value="m.id"
            >
              <div class="model-opt">
                <span class="model-opt-name">{{ modelLabel(m.id) }}</span>
                <span class="model-opt-provider" :class="providerClass(m.owned_by)">{{ m.owned_by }}</span>
              </div>
            </el-option>
          </el-select>
          <el-button
            class="think-toggle"
            :type="showThinking ? 'primary' : 'default'"
            size="small"
            round
            @click="$emit('toggle-thinking')"
          >
            <el-icon style="margin-right:4px"><View /></el-icon>
            深度思考
          </el-button>
          <el-button
            class="think-toggle"
            :type="searchEnabled ? 'primary' : 'default'"
            size="small"
            round
            @click="$emit('toggle-search')"
          >
            <el-icon style="margin-right:4px"><Search /></el-icon>
            联网搜索
          </el-button>
        </div>
        <el-button
          v-if="disabled"
          class="stop-btn"
          type="danger"
          @click="stop"
        >
          <span class="stop-icon" />
        </el-button>
        <el-button
          v-else
          class="send-btn"
          type="primary"
          :disabled="!text.trim()"
          @click="send"
        >
          <el-icon :size="18"><ArrowUpBold /></el-icon>
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ArrowUpBold, View, Search, Cpu } from '@element-plus/icons-vue'
import { api } from '@/api'
import { useLocalStorageRef } from '@/composables/useLocalStorage'

const props = defineProps<{
  disabled?: boolean
  showThinking?: boolean
  searchEnabled?: boolean
  isMobile?: boolean
}>()

const emit = defineEmits<{
  send: [content: string]
  'toggle-thinking': []
  'toggle-search': []
  stop: []
}>()

const text = ref('')
const inputRef = ref()

// 模型选择（与 App.vue 共享同一个 ref 实例）
const selectedModel = useLocalStorageRef('llmModel', '')
const modelList = ref<{ id: string; owned_by: string }[]>([])
const loadingModels = ref(false)

onMounted(async () => {
  loadingModels.value = true
  try {
    const res = await api.getModels()
    modelList.value = res.models
    if (!selectedModel.value && res.default) {
      selectedModel.value = res.default
    }
  } catch {
    // 模型列表加载失败，保持现有选择
  } finally {
    loadingModels.value = false
  }
})

const placeholder = computed(() =>
  props.isMobile ? '输入消息' : '输入消息，Enter 发送，Shift+Enter 换行'
)

// 模型友好名称映射
const MODEL_NAMES: Record<string, string> = {
  'deepseek-chat': 'DeepSeek V3',
  'deepseek-reasoner': 'DeepSeek R1',
  'deepseek-v4-flash': 'DeepSeek V4 Flash',
  'deepseek-v4-pro': 'DeepSeek V4 Pro',
}

function modelLabel(id: string): string {
  return MODEL_NAMES[id] || id.replace(/^deepseek-/, '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function providerClass(provider: string): string {
  if (provider === 'deepseek') return 'provider-deepseek'
  if (provider === 'openai') return 'provider-openai'
  return ''
}

// 发送消息：校验非空 → emit 到父组件 → 清空输入 → 稳定后锁定单行高度
function send() {
  const val = text.value.trim()
  if (!val || props.disabled) return
  emit('send', val)
  text.value = ''
  // 延迟等键盘收起动画 + viewport 稳定后，测量自然单行高度并锁定，
  // 避免 autosize 在 viewport 变化期间基于 placeholder 换行计算出一闪一闪的错误高度
  setTimeout(() => {
    const ta = inputRef.value?.$el?.querySelector?.('textarea')
    if (ta) {
      ta.style.height = 'auto'
      ta.style.overflow = 'hidden'
      const natural = ta.scrollHeight
      ta.style.height = natural + 'px'
    }
  }, 180)
}

function stop() {
  emit('stop')
}

function setText(value: string) {
  text.value = value
}

defineExpose({ setText })

// Enter 发送，Shift+Enter 换行
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    send()
  }
}
</script>

<style scoped>
.chat-input-area {
  padding: 16px 20px 20px;
  max-width: 860px;
  margin: 0 auto;
  width: 100%;
  background: transparent;
}

.input-wrapper {
  display: flex;
  flex-direction: column;
  background: var(--bg-input);
  padding: 6px 8px 8px 16px;
  border-radius: 16px;
  border: 2px solid var(--border-primary);
  transition: border-color .2s, box-shadow .2s, background .2s;
}

.input-wrapper:focus-within {
  border-color: var(--border-focus);
  box-shadow: 0 0 0 3px var(--accent-ring);
  background: var(--bg-surface-hover);
}

/* ====== 底部栏：左思考/搜索 + 右发送/停止 ====== */

.input-bottom-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 4px;
}

.input-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.think-toggle {
  margin: 0;
  font-size: 13px;
  font-weight: 500;
  border-radius: 20px;
  padding: 0 16px;
  height: 32px;
  transition: all .2s;
  background: var(--bg-surface) !important;
  border-color: var(--border-primary) !important;
  color: var(--text-muted) !important;
}

.think-toggle:hover {
  border-color: rgba(128, 128, 128, 0.25) !important;
  color: var(--text-secondary) !important;
}

.think-toggle.el-button--primary {
  background: rgba(99, 102, 241, 0.2) !important;
  border-color: rgba(99, 102, 241, 0.3) !important;
  color: var(--accent-light) !important;
}

/* ====== 模型选择器 ====== */

.model-select {
  width: 155px;
  margin: 0;
}

.model-select :deep(.el-input__wrapper),
.model-select :deep(.el-select__wrapper) {
  background: var(--bg-surface) !important;
  border: 1px solid var(--border-primary) !important;
  border-radius: 20px !important;
  box-shadow: none !important;
  padding: 0 12px 0 30px !important;
  height: 32px;
  box-sizing: border-box;
  transition: border-color .2s, box-shadow .2s, background .2s;
  cursor: pointer;
  --el-input-height: auto;
}

.model-select :deep(.el-input__wrapper:hover),
.model-select :deep(.el-select__wrapper:hover) {
  border-color: rgba(128, 128, 128, 0.25) !important;
  background: var(--bg-surface-hover) !important;
}

.model-select :deep(.el-input.is-focus .el-input__wrapper) {
  border-color: var(--accent) !important;
  box-shadow: 0 0 0 2px var(--accent-ring) !important;
}

.model-select :deep(.el-input__inner) {
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 500;
  line-height: 1.4;
  height: auto !important;
}

.model-select :deep(.el-input__suffix) {
  color: var(--text-muted);
}

.model-prefix-icon {
  font-size: 14px;
  color: var(--accent-light);
}

/* ====== 发送 / 停止 ====== */

.send-btn,
.stop-btn {
  width: 34px;
  height: 34px;
  padding: 0;
  border-radius: 8px;
  flex-shrink: 0;
}

.send-btn {
  background: var(--accent-gradient) !important;
  border: none !important;
  color: #fff !important;
}

.send-btn:hover {
  box-shadow: 0 4px 16px var(--accent-glow);
  transform: scale(1.05);
}

.send-btn:disabled {
  background: var(--bg-surface) !important;
  color: var(--text-muted) !important;
  box-shadow: none;
  transform: none;
}

.stop-btn {
  border-radius: 8px;
}

/* 停止按钮 — CSS 绘制的方块图标 */
.stop-icon {
  display: block;
  width: 14px;
  height: 14px;
  background: currentColor;
  border-radius: 3px;
}

/* ====== Textarea ====== */

.input-wrapper :deep(.el-textarea) {
  display: flex;
  width: 100%;
}

.input-wrapper :deep(.el-textarea__inner) {
  background: transparent;
  border: none;
  box-shadow: none;
  color: var(--text-primary);
  border-radius: 0;
  font-size: 14px;
  line-height: 1.5;
  padding: 8px 4px 0 0;
  min-height: 24px;
  resize: none;
  caret-color: var(--accent);
  scrollbar-width: thin;
  scrollbar-color: var(--scrollbar-thumb) transparent;
  overscroll-behavior: contain;
}

.input-wrapper :deep(.el-textarea__inner):focus {
  border: none;
  box-shadow: none;
}

.input-wrapper :deep(.el-textarea__inner)::placeholder {
  color: var(--text-placeholder);
}

.input-wrapper :deep(.el-textarea__inner)::-webkit-scrollbar {
  width: 4px;
}

.input-wrapper :deep(.el-textarea__inner)::-webkit-scrollbar-track {
  background: transparent;
}

.input-wrapper :deep(.el-textarea__inner)::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb);
  border-radius: 2px;
}

/* ====== 移动端 ====== */
@media (max-width: 768px) {
  .chat-input-area {
    padding: 10px 12px 14px;
  }

  .input-wrapper {
    padding: 4px 6px 8px 12px;
    border-radius: 12px;
  }

  .input-bottom-bar {
    flex-wrap: wrap;
    gap: 6px;
  }

  .input-actions {
    gap: 6px;
    flex: 1;
    min-width: 0;
  }

  .model-select {
    width: 115px;
    flex-shrink: 0;
  }

  .model-select :deep(.el-input__wrapper) {
    padding: 0 8px 0 24px !important;
    height: 28px;
    box-sizing: border-box;
  }

  .model-select :deep(.el-input__inner) {
    font-size: 11px;
    height: auto !important;
  }

  .model-prefix-icon {
    font-size: 12px;
  }

  .think-toggle {
    font-size: 11px;
    padding: 0 10px;
    height: 28px;
    border-radius: 14px;
    white-space: nowrap;
  }

  .input-wrapper :deep(.el-textarea__inner) {
    font-size: 14px;
    padding: 6px 4px 0 0;
    min-height: 22px;
  }

  .send-btn,
  .stop-btn {
    width: 30px;
    height: 30px;
    border-radius: 6px;
    flex-shrink: 0;
  }

  .stop-icon {
    width: 12px;
    height: 12px;
    border-radius: 2px;
  }
}
</style>

<!-- 非 scoped：el-select 的 popper 被 teleport 到 body -->
<style>
.model-popper {
  min-width: 180px !important;
}

.model-popper .el-select-dropdown__item {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  border-radius: 8px;
  margin: 2px 6px;
  line-height: 1;
}

.model-popper .el-select-dropdown__item.is-selected {
  background: var(--bg-surface-active);
  font-weight: inherit;
}

.model-popper .el-select-dropdown__item:hover {
  background: var(--bg-surface-hover);
}

.model-popper .model-opt-provider {
  font-size: 10px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 8px;
  letter-spacing: 0.3px;
  text-transform: uppercase;
  flex-shrink: 0;
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-muted);
  margin-left: auto;
}

.model-popper .provider-deepseek {
  background: rgba(99, 102, 241, 0.15);
  color: #a5b4fc;
}

.model-popper .provider-openai {
  background: rgba(16, 185, 129, 0.15);
  color: #6ee7b7;
}

.model-popper .model-opt {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
}

.model-popper .model-opt-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
