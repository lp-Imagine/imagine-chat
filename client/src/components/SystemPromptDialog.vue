<template>
  <!-- 桌面端：弹窗 -->
  <el-dialog
    v-if="!isMobile"
    v-model="visible"
    title="设置"
    width="680px"
    class="sp-dialog"
    :close-on-click-modal="false"
    append-to-body
    @open="onOpen"
  >
    <div class="sp-dialog-body">
      <!-- API 配置 -->
      <div class="sp-section">
        <label class="sp-label">API 配置（LLM）</label>
        <p class="sp-desc">更换 API 地址和 Key 以接入不同的模型服务（如 OpenAI / Qwen）</p>
        <div class="sp-config-grid">
          <div class="sp-config-field">
            <span class="sp-config-label">接口地址</span>
            <el-input v-model="apiBaseUrl" placeholder="https://api.deepseek.com" size="small" />
          </div>
          <div class="sp-config-field">
            <span class="sp-config-label">API Key</span>
            <el-input v-model="apiKey" type="password" show-password :placeholder="apiKeyPlaceholder" size="small" />
          </div>
        </div>
      </div>

      <!-- Embedding API 配置 -->
      <div class="sp-section">
        <label class="sp-label">Embedding API 配置</label>
        <p class="sp-desc">用于知识库向量化，需要支持 OpenAI embedding 接口的服务（如 OpenAI / 硅基流动）</p>
        <div class="sp-config-grid">
          <div class="sp-config-field">
            <span class="sp-config-label">接口地址</span>
            <el-input v-model="embeddingApiBaseUrl" placeholder="https://api.openai.com" size="small" />
          </div>
          <div class="sp-config-field">
            <span class="sp-config-label">API Key</span>
            <el-input v-model="embeddingApiKey" type="password" show-password :placeholder="embeddingKeyPlaceholder" size="small" />
          </div>
          <div class="sp-config-field">
            <span class="sp-config-label">模型</span>
            <el-input v-model="embeddingModel" placeholder="text-embedding-3-small" size="small" />
          </div>
        </div>
      </div>

      <div class="sp-section">
        <label class="sp-label">系统提示词</label>
        <p class="sp-desc">设置 AI 的角色、行为规则和输出格式。修改后生效于后续对话，不影响已有历史。</p>
        <textarea
          ref="textareaRef"
          v-model="promptContent"
          class="sp-textarea"
          placeholder="输入系统提示词..."
          :disabled="loadingPrompt"
        />
      </div>

      <div class="sp-section">
        <label class="sp-label">回答参数</label>
        <p class="sp-desc">调节 AI 回答的随机性和创造性</p>
        <div class="sp-params">
          <div class="sp-param">
            <div class="sp-param-head">
              <span class="sp-param-label">Temperature</span>
              <span class="sp-param-value">{{ temperature }}</span>
            </div>
            <el-slider v-model="temperature" :min="0" :max="2" :step="0.1" :show-tooltip="false" />
            <p class="sp-param-desc">越高回答越有创意，越低越确定</p>
          </div>
          <div class="sp-param">
            <div class="sp-param-head">
              <span class="sp-param-label">Top-P</span>
              <span class="sp-param-value">{{ topP }}</span>
            </div>
            <el-slider v-model="topP" :min="0" :max="1" :step="0.05" :show-tooltip="false" />
            <p class="sp-param-desc">核采样，限制候选词累计概率</p>
          </div>
          <div class="sp-param">
            <div class="sp-param-head">
              <span class="sp-param-label">上下文轮数</span>
              <span class="sp-param-value">{{ contextRounds }}</span>
            </div>
            <el-slider v-model="contextRounds" :min="1" :max="50" :step="1" :show-tooltip="false" />
            <p class="sp-param-desc">每次对话携带的历史消息轮数，越大理解越连贯但消耗更多 token</p>
          </div>
        </div>
      </div>
    </div>
    <template #footer>
      <div class="sp-footer">
        <el-button @click="visible = false" :disabled="saving">取消</el-button>
        <el-button type="primary" :disabled="!promptContent.trim() || saving" :loading="saving" @click="onSave">
          保存
        </el-button>
      </div>
    </template>
  </el-dialog>

  <!-- 移动端：侧边滑入面板 -->
  <Teleport v-else to="body">
    <transition name="sp-panel-fade">
      <div v-if="visible" class="sp-backdrop" @click="onCancel" />
    </transition>
    <transition name="sp-panel-slide">
      <div v-if="visible" class="sp-panel">
        <div class="sp-panel-header">
          <el-button :icon="ArrowLeft" text class="sp-panel-back" @click="onCancel" />
          <span class="sp-panel-title">设置</span>
          <el-button type="primary" size="small" :disabled="!promptContent.trim() || saving" :loading="saving" @click="onSave">
            保存
          </el-button>
        </div>
        <div class="sp-panel-body">
          <!-- API 配置 -->
          <div class="sp-section">
            <label class="sp-label">API 配置（LLM）</label>
            <p class="sp-desc">更换 API 地址和 Key 以接入不同的模型服务</p>
            <div class="sp-config-grid">
              <div class="sp-config-field">
                <span class="sp-config-label">接口地址</span>
                <el-input v-model="apiBaseUrl" placeholder="https://api.deepseek.com" size="small" />
              </div>
              <div class="sp-config-field">
                <span class="sp-config-label">API Key</span>
                <el-input v-model="apiKey" type="password" show-password :placeholder="apiKeyPlaceholder" size="small" />
              </div>
            </div>
          </div>

          <!-- Embedding API 配置 -->
          <div class="sp-section">
            <label class="sp-label">Embedding API 配置</label>
            <p class="sp-desc">用于知识库向量化，需 OpenAI 兼容接口</p>
            <div class="sp-config-grid">
              <div class="sp-config-field">
                <span class="sp-config-label">接口地址</span>
                <el-input v-model="embeddingApiBaseUrl" placeholder="https://api.openai.com" size="small" />
              </div>
              <div class="sp-config-field">
                <span class="sp-config-label">API Key</span>
                <el-input v-model="embeddingApiKey" type="password" show-password :placeholder="embeddingKeyPlaceholder" size="small" />
              </div>
              <div class="sp-config-field">
                <span class="sp-config-label">模型</span>
                <el-input v-model="embeddingModel" placeholder="text-embedding-3-small" size="small" />
              </div>
            </div>
          </div>

          <div class="sp-section">
            <label class="sp-label">系统提示词</label>
            <p class="sp-desc">设置 AI 的角色、行为规则和输出格式。</p>
            <textarea
              ref="textareaRef"
              v-model="promptContent"
              class="sp-textarea sp-textarea-mobile"
              placeholder="输入系统提示词..."
              :disabled="loadingPrompt"
            />
          </div>

          <div class="sp-section">
            <label class="sp-label">回答参数</label>
            <div class="sp-params">
              <div class="sp-param">
                <div class="sp-param-head">
                  <span class="sp-param-label">Temperature</span>
                  <span class="sp-param-value">{{ temperature }}</span>
                </div>
                <el-slider v-model="temperature" :min="0" :max="2" :step="0.1" :show-tooltip="false" />
              </div>
              <div class="sp-param">
                <div class="sp-param-head">
                  <span class="sp-param-label">Top-P</span>
                  <span class="sp-param-value">{{ topP }}</span>
                </div>
                <el-slider v-model="topP" :min="0" :max="1" :step="0.05" :show-tooltip="false" />
              </div>
              <div class="sp-param">
                <div class="sp-param-head">
                  <span class="sp-param-label">上下文轮数</span>
                  <span class="sp-param-value">{{ contextRounds }}</span>
                </div>
                <el-slider v-model="contextRounds" :min="1" :max="50" :step="1" :show-tooltip="false" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, nextTick, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { ArrowLeft } from '@element-plus/icons-vue'
import { api } from '@/api'
import { useLocalStorageRef } from '@/composables/useLocalStorage'
import { useMobile } from '@/composables/useMobile'

const visible = defineModel<boolean>({ required: true })

const promptContent = ref('')
const loadingPrompt = ref(false)
const saving = ref(false)
const textareaRef = ref<HTMLTextAreaElement>()

// API 配置
const apiBaseUrl = ref('')
const apiKey = ref('')
const apiKeyPlaceholder = ref('已设置，输入新 Key 覆盖')

// Embedding API 配置
const embeddingApiBaseUrl = ref('')
const embeddingApiKey = ref('')
const embeddingModel = ref('')
const embeddingKeyPlaceholder = ref('已设置，输入新 Key 覆盖')

const temperature = useLocalStorageRef('llmTemperature', 1.0)
const topP = useLocalStorageRef('llmTopP', 1.0)
const contextRounds = useLocalStorageRef('llmContextRounds', 10)

const { isMobile } = useMobile()

// 打开时加载数据
watch(visible, (v) => {
  if (v) onOpen()
})

async function onOpen() {
  loadingPrompt.value = true
  promptContent.value = ''
  apiBaseUrl.value = ''
  apiKey.value = ''

  try {
    const res = await api.getSystemPrompt()
    promptContent.value = res.content
  } catch {
    ElMessage.error('加载系统提示词失败')
  } finally {
    loadingPrompt.value = false
  }

  try {
    const cfg = await api.getConfig()
    apiBaseUrl.value = cfg.apiBaseUrl
    apiKeyPlaceholder.value = cfg.hasKey ? cfg.apiKey : '输入 API Key'
    embeddingApiBaseUrl.value = cfg.embeddingApiBaseUrl
    embeddingModel.value = cfg.embeddingModel
    embeddingKeyPlaceholder.value = cfg.hasEmbeddingKey ? cfg.embeddingApiKey : '输入 OpenAI API Key'
  } catch { /* ignore */ }

  nextTick(() => textareaRef.value?.focus())
}

function onCancel() {
  visible.value = false
}

async function onSave() {
  const trimmed = promptContent.value.trim()
  if (!trimmed) return
  saving.value = true
  try {
    await api.updateSystemPrompt(trimmed)
    // 如果有填写配置，同时保存
    if (apiBaseUrl.value.trim() || apiKey.value.trim() || embeddingApiBaseUrl.value.trim() || embeddingApiKey.value.trim()) {
      await api.updateConfig({
        apiBaseUrl: apiBaseUrl.value.trim() || undefined,
        apiKey: apiKey.value || undefined,
        embeddingApiBaseUrl: embeddingApiBaseUrl.value.trim() || undefined,
        embeddingApiKey: embeddingApiKey.value || undefined,
        embeddingModel: embeddingModel.value.trim() || undefined,
      })
    }
    ElMessage.success('设置已保存')
    visible.value = false
  } catch {
    ElMessage.error('保存失败')
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
/* ====== 共享样式 ====== */

.sp-dialog-body,
.sp-panel-body {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.sp-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.sp-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.sp-desc {
  font-size: 13px;
  color: var(--text-muted);
  margin: 0;
  line-height: 1.6;
}

.sp-textarea {
  width: 100%;
  height: 320px;
  padding: 14px 16px;
  font-size: 14px;
  font-family: 'JetBrains Mono', 'Fira Code', 'PingFang SC', monospace;
  line-height: 1.7;
  color: var(--text-primary);
  background: var(--bg-input);
  border: 1px solid var(--border-primary);
  border-radius: 10px;
  resize: vertical;
  outline: none;
  box-sizing: border-box;
  transition: border-color .2s, box-shadow .2s;
}

.sp-textarea:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-ring);
}

.sp-textarea:disabled {
  opacity: 0.5;
  cursor: wait;
}

.sp-params {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.sp-param-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.sp-param-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}

.sp-param-value {
  font-size: 13px;
  font-weight: 600;
  color: var(--accent);
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
}

.sp-param-desc {
  font-size: 12px;
  color: var(--text-muted);
  margin: 2px 0 0;
}

.sp-config-grid {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.sp-config-field {
  display: flex;
  align-items: center;
  gap: 10px;
}

.sp-config-label {
  font-size: 13px;
  color: var(--text-secondary);
  white-space: nowrap;
  min-width: 56px;
}

.sp-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

/* ====== 桌面端 ====== */
@media (min-width: 769px) {
  .sp-dialog-body {
    gap: 20px;
  }
}

/* ====== 移动端侧滑面板 ====== */

.sp-backdrop {
  display: none;
}

.sp-panel {
  display: none;
}

@media (max-width: 768px) {
  /* 桌面弹窗移动端降级 */
  .sp-dialog-body {
    gap: 16px;
  }

  .sp-textarea {
    height: 220px;
    padding: 12px 14px;
    font-size: 13px;
    border-radius: 8px;
    font-family: 'PingFang SC', system-ui, sans-serif;
  }

  .sp-footer {
    flex-direction: column-reverse;
  }

  /* 侧滑面板 */
  .sp-backdrop {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 100;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(2px);
    -webkit-backdrop-filter: blur(2px);
  }

  .sp-panel {
    display: flex;
    flex-direction: column;
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    z-index: 110;
    width: 88vw;
    max-width: 380px;
    overflow: hidden;
    background: var(--bg-chat);
    box-shadow: -4px 0 32px rgba(0, 0, 0, 0.4);
  }

  .sp-panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 14px;
    border-bottom: 1px solid var(--border-subtle);
    flex-shrink: 0;
  }

  .sp-panel-back {
    width: 36px;
    height: 36px;
    color: var(--text-muted);
  }

  .sp-panel-title {
    font-size: 16px;
    font-weight: 600;
    color: var(--text-primary);
  }

  .sp-panel-body {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 16px;
    gap: 20px;
    min-width: 0;
  }

  .sp-panel-body > * {
    min-width: 0;
    max-width: 100%;
  }

  .sp-textarea-mobile {
    height: 200px;
    max-width: 100%;
    padding: 12px 14px;
    font-size: 14px;
    border-radius: 8px;
    font-family: 'PingFang SC', system-ui, sans-serif;
  }

  .sp-desc {
    font-size: 12px;
  }

  .sp-config-field {
    flex-direction: column;
    align-items: stretch;
    gap: 4px;
  }

  .sp-config-label {
    min-width: auto;
  }

  /* 过渡动画 */
  .sp-panel-fade-enter-active,
  .sp-panel-fade-leave-active {
    transition: opacity 0.3s ease;
  }
  .sp-panel-fade-enter-from,
  .sp-panel-fade-leave-to {
    opacity: 0;
  }

  .sp-panel-slide-enter-active,
  .sp-panel-slide-leave-active {
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }
  .sp-panel-slide-enter-from,
  .sp-panel-slide-leave-to {
    transform: translateX(100%);
  }
}
</style>

<!-- 桌面端弹窗覆写（非 scoped，经 teleport 渲染到 body） -->
<style>
.sp-dialog .el-dialog__body {
  max-height: 60vh;
  overflow-y: auto;
  overflow-x: hidden;
}

@media (max-width: 768px) {
  .el-dialog {
    width: 92vw !important;
    max-height: 90vh;
    margin-top: 5vh !important;
  }

  .el-dialog__body {
    padding: 14px 16px !important;
  }

  .el-dialog__header {
    padding: 16px 16px 10px !important;
  }

  .el-dialog__footer {
    padding: 10px 16px 16px !important;
    text-align: stretch !important;
  }

  .el-dialog__footer .el-button {
    width: 100%;
    height: 42px;
    font-size: 15px;
    border-radius: 10px;
    margin-left: 0 !important;
  }

  .el-dialog__footer .el-button + .el-button {
    margin-left: 0 !important;
  }
}
</style>
