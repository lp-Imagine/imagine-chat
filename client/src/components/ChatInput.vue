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
        @paste="onPaste"
      />
      <!-- 附件预览 -->
      <div v-if="pendingFiles.length" class="attachment-preview">
        <div v-for="pf in pendingFiles" :key="pf.id" class="attachment-box" :class="{ 'is-uploading': pf.status === 'uploading', 'is-error': pf.status === 'error' }">
          <div class="box-thumb-wrap">
            <el-image v-if="pf.previewUrl" :src="pf.previewUrl" :preview-src-list="[pf.previewUrl]" fit="cover" class="box-thumb" />
            <div v-else class="box-file-preview" :style="{ '--file-color': getFileInfo(pf.file.name).color }">
              <el-icon class="box-file-icon"><Document /></el-icon>
              <span class="box-ext">{{ getFileInfo(pf.file.name).ext }}</span>
            </div>
            <div v-if="pf.status === 'uploading'" class="box-spinner-overlay">
              <span class="box-spinner" />
            </div>
          </div>
          <span class="box-name">{{ pf.file.name }}</span>
          <el-icon v-if="pf.status !== 'uploading'" class="box-remove" @click="removeFile(pf.id)"><Close /></el-icon>
        </div>
      </div>
      <div class="input-bottom-bar">
        <div class="input-actions">
          <el-select
            v-model="selectedModel"
            class="model-select"
            size="small"
            placeholder="模型"
            :loading="loadingModels"
            filterable
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
            :class="{ 'icon-only': isMobile }"
            :type="showThinking ? 'primary' : 'default'"
            size="small"
            round
            @click="$emit('toggle-thinking')"
          >
            <el-icon :style="isMobile ? '' : 'margin-right:4px'"><View /></el-icon>
            <span v-if="!isMobile">深度思考</span>
          </el-button>
          <el-button
            class="think-toggle"
            :class="{ 'icon-only': isMobile }"
            :type="searchEnabled ? 'primary' : 'default'"
            size="small"
            round
            @click="$emit('toggle-search')"
          >
            <el-icon :style="isMobile ? '' : 'margin-right:4px'"><Search /></el-icon>
            <span v-if="!isMobile">联网搜索</span>
          </el-button>
        </div>
        <div class="input-right-actions">
          <input
            ref="fileInputRef"
            type="file"
            multiple
            hidden
            accept="image/*,.pdf,.docx,.doc,.xlsx,.xls,.txt,.md,.csv,.json,.xml,.html,.py,.js,.ts,.java,.go,.rs,.yml,.yaml,.zip,.tar,.gz"
            @change="onFilesSelected"
          />
          <el-popover
            v-model="attachPopVisible"
            placement="top"
            :width="170"
            trigger="click"
          >
            <template #reference>
              <el-button
                ref="attachBtnRef"
                class="attach-btn"
                size="small"
                :disabled="disabled"
                title="支持图片、文档、代码等文件，单个文件最大 10MB"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
              </el-button>
            </template>
            <div class="attach-menu">
              <div class="attach-menu-item" @click="openFilePicker(); attachPopVisible = false">
                <svg class="attach-menu-svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                <span>本地文件</span>
              </div>
              <div class="attach-menu-item" @click="openKnowledgePicker(); attachPopVisible = false">
                <svg class="attach-menu-svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>
                <span>知识库文件</span>
              </div>
            </div>
          </el-popover>
          <el-button
            v-if="disabled"
            class="stop-btn"
            @click="stop"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="3"/></svg>
          </el-button>
          <el-button
            v-else
            class="send-btn"
            :disabled="!canSend"
            @click="send"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>
          </el-button>
        </div>
      </div>
    </div>

    <!-- 知识库文件选择对话框 -->
    <el-dialog v-model="knowledgeDialogVisible" title="选择知识库文件" width="420px" :close-on-click-modal="true" custom-class="knowledge-dialog">
      <div v-if="knowledgeDocs.length === 0" class="knowledge-empty">知识库中暂无文档</div>
      <div v-else class="knowledge-list">
        <div
          v-for="doc in knowledgeDocs"
          :key="doc.id"
          class="knowledge-item"
          :class="{ selected: selectedKnowledgeIds.includes(doc.id) }"
          @click="toggleKnowledgeSelect(doc.id)"
        >
          <el-icon class="knowledge-check" :size="18">
            <Check v-if="selectedKnowledgeIds.includes(doc.id)" />
          </el-icon>
          <div class="knowledge-doc-info">
            <span class="knowledge-doc-name">{{ doc.fileName }}</span>
            <span class="knowledge-doc-meta">{{ fmtFileSize(doc.fileSize) }} · {{ doc.chunkCount }} 块</span>
          </div>
        </div>
      </div>
      <template #footer>
        <div class="knowledge-footer">
          <el-button class="knowledge-cancel-btn" @click="knowledgeDialogVisible = false">取消</el-button>
          <el-button class="knowledge-confirm-btn" type="primary" :disabled="selectedKnowledgeIds.length === 0" @click="confirmKnowledgeSelect">确定</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
// 聊天输入组件：文本输入 + 模型选择 + 深度思考/联网搜索开关 + 附件上传
// - 附件上传支持本地文件（拖拽/粘贴/点击）和知识库文件选择
// - 上传通过 XMLHttpRequest 实现进度回调，非图片文件显示类型图标和扩展名
// - 移动端下深度思考和联网搜索按钮仅显示图标，节省空间
import { ref, computed, onMounted, nextTick } from 'vue'
import { View, Search, Cpu, Close, Document, Check } from '@element-plus/icons-vue'
import { api } from '@/api'
import { useLocalStorageRef } from '@/composables/useLocalStorage'
import type { Attachment, KnowledgeDoc } from '@/types/chat'

const props = defineProps<{
  disabled?: boolean
  showThinking?: boolean
  searchEnabled?: boolean
  isMobile?: boolean
}>()

const emit = defineEmits<{
  send: [payload: { content: string; attachments: Attachment[] }]
  'toggle-thinking': []
  'toggle-search': []
  stop: []
}>()

const text = ref('')
const inputRef = ref()
const fileInputRef = ref<HTMLInputElement>()
const attachBtnRef = ref()
const attachPopVisible = ref(false)

// 知识库文件选择
const knowledgeDialogVisible = ref(false)
const knowledgeDocs = ref<KnowledgeDoc[]>([])
const selectedKnowledgeIds = ref<string[]>([])

async function openKnowledgePicker() {
  knowledgeDialogVisible.value = true
  selectedKnowledgeIds.value = []
  try {
    knowledgeDocs.value = await api.getKnowledgeDocuments()
  } catch { /* 加载失败 */ }
}

function toggleKnowledgeSelect(docId: string) {
  const idx = selectedKnowledgeIds.value.indexOf(docId)
  if (idx >= 0) selectedKnowledgeIds.value.splice(idx, 1)
  else selectedKnowledgeIds.value.push(docId)
}

async function confirmKnowledgeSelect() {
  knowledgeDialogVisible.value = false
  for (const docId of selectedKnowledgeIds.value) {
    const doc = knowledgeDocs.value.find(d => d.id === docId)
    if (!doc) continue
    const id = `pf_${Date.now()}_${_fileIdCounter++}`
    const pf: PendingFile = {
      file: new File([], doc.fileName),
      id,
      status: 'uploading',
      progress: 0
    }
    pendingFiles.value = [...pendingFiles.value, pf]
    try {
      const res = await api.getKnowledgeDocContent(docId)
      const attachment: Attachment = {
        id: docId,
        name: doc.fileName,
        url: '',
        type: 'file',
        mimeType: doc.fileType,
        size: doc.fileSize,
        extractedText: res.content
      }
      updateFile(id, { status: 'done', attachment })
    } catch {
      updateFile(id, { status: 'error', error: '获取知识库内容失败' })
    }
  }
}

function fmtFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

// 附件暂存
interface PendingFile {
  file: File
  id: string
  status: 'pending' | 'uploading' | 'done' | 'error'
  progress: number
  attachment?: Attachment
  error?: string
  previewUrl?: string
}

const pendingFiles = ref<PendingFile[]>([])

const isUploading = computed(() => pendingFiles.value.some(f => f.status === 'uploading'))
const canSend = computed(() =>
  !props.disabled && !isUploading.value && (text.value.trim() || pendingFiles.value.some(f => f.status === 'done'))
)

// 模型选择（与 App.vue 共享同一个 ref 实例）
const selectedModel = useLocalStorageRef('llmModel', '')
const modelList = ref<{ id: string; owned_by: string; supportsVision: boolean }[]>([])
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

const FILE_TYPE_MAP: Record<string, { color: string }> = {
  pdf:  { color: '#ef4444' },
  doc:  { color: '#3b82f6' },
  docx: { color: '#3b82f6' },
  xls:  { color: '#22c55e' },
  xlsx: { color: '#22c55e' },
  csv:  { color: '#22c55e' },
  ppt:  { color: '#f97316' },
  pptx: { color: '#f97316' },
  txt:  { color: '#6b7280' },
  md:   { color: '#6b7280' },
  json: { color: '#f59e0b' },
  xml:  { color: '#f59e0b' },
  yml:  { color: '#f59e0b' },
  yaml: { color: '#f59e0b' },
  html: { color: '#f97316' },
  htm:  { color: '#f97316' },
  css:  { color: '#06b6d4' },
  js:   { color: '#eab308' },
  ts:   { color: '#3b82f6' },
  jsx:  { color: '#06b6d4' },
  tsx:  { color: '#3b82f6' },
  py:   { color: '#3b82f6' },
  java: { color: '#ef4444' },
  go:   { color: '#06b6d4' },
  rs:   { color: '#f97316' },
  zip:  { color: '#78716c' },
  tar:  { color: '#78716c' },
  gz:   { color: '#78716c' },
  rar:  { color: '#78716c' },
  '7z': { color: '#78716c' },
}

function getFileInfo(name: string): { color: string; ext: string } {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  const info = FILE_TYPE_MAP[ext] || { color: '#9ca3af' }
  return { color: info.color, ext: ext.slice(0, 4).toUpperCase() }
}

// 发送消息：收集文本 + 已上传成功的附件 → emit 到父组件 → 清空
function send() {
  const val = text.value.trim()
  if ((!val && !pendingFiles.value.some(f => f.status === 'done')) || props.disabled) return
  const attachments = pendingFiles.value
    .filter(f => f.status === 'done' && f.attachment)
    .map(f => f.attachment!)
  emit('send', { content: val, attachments })
  text.value = ''
  // 清理附件预览
  for (const pf of pendingFiles.value) {
    if (pf.previewUrl) URL.revokeObjectURL(pf.previewUrl)
  }
  pendingFiles.value = []
  // 延迟等键盘收起动画 + viewport 稳定后，测量自然单行高度并锁定
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

function openFilePicker() {
  fileInputRef.value?.click()
}

function onFilesSelected(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files?.length) {
    handleFiles(Array.from(input.files))
    input.value = ''
  }
  input.blur()
  // 文件选择结束后移除按钮焦点，并将焦点归还输入框
  nextTick(() => {
    const btnEl = attachBtnRef.value?.$el || attachBtnRef.value
    if (btnEl instanceof HTMLElement) btnEl.blur()
    inputRef.value?.focus()
  })
}

let _fileIdCounter = 0

// 通过替换数组项确保 Vue 响应式更新（XHR 回调不在 Vue 上下文中）
function updateFile(id: string, patch: Partial<PendingFile>) {
  const idx = pendingFiles.value.findIndex(f => f.id === id)
  if (idx >= 0) {
    pendingFiles.value[idx] = { ...pendingFiles.value[idx], ...patch }
  }
}

async function handleFiles(files: File[]) {
  for (const file of files) {
    const id = `pf_${Date.now()}_${_fileIdCounter++}`
    const pf: PendingFile = {
      file,
      id,
      status: 'pending',
      progress: 0
    }
    if (file.type.startsWith('image/')) {
      pf.previewUrl = URL.createObjectURL(file)
    }
    pendingFiles.value = [...pendingFiles.value, pf]

    updateFile(id, { status: 'uploading' })
    try {
      const attachment = await api.uploadAttachment(file, (pct) => { updateFile(id, { progress: pct }) })
      updateFile(id, { status: 'done', attachment })
    } catch (e: any) {
      updateFile(id, { status: 'error', error: e.message || '上传失败' })
    }
  }
}

function removeFile(id: string) {
  const pf = pendingFiles.value.find(f => f.id === id)
  if (pf?.previewUrl) URL.revokeObjectURL(pf.previewUrl)
  pendingFiles.value = pendingFiles.value.filter(f => f.id !== id)
}

function onPaste(e: ClipboardEvent) {
  const items = e.clipboardData?.items
  if (!items) return
  const files: File[] = []
  for (const item of Array.from(items)) {
    if (item.kind === 'file') {
      const file = item.getAsFile()
      if (file) files.push(file)
    }
  }
  if (files.length > 0) {
    e.preventDefault()
    handleFiles(files)
  }
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
  background: var(--bg-surface-hover);
}

/* ====== 底部栏 ====== */

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

.input-right-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
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

/* ====== 右侧操作按钮：统一尺寸 ====== */

.attach-btn,
.send-btn,
.stop-btn {
  width: 32px;
  height: 32px;
  padding: 0;
  border-radius: 8px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.attach-btn {
  background: var(--bg-surface) !important;
  border-color: var(--border-primary) !important;
  color: var(--text-muted) !important;
}

.attach-btn:hover {
  border-color: rgba(128, 128, 128, 0.25) !important;
  color: var(--text-secondary) !important;
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
  background: var(--bg-surface) !important;
  border: 1px solid var(--border-primary) !important;
  color: var(--text-secondary) !important;
}

.stop-btn:hover {
  background: var(--bg-surface-hover) !important;
  color: var(--text-primary) !important;
}

/* ====== 附件预览：圆角正方形卡片 ====== */

.attachment-preview {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px 0 4px;
}

.attachment-box {
  position: relative;
  width: 56px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  transition: opacity .2s;
}

.attachment-box.is-uploading {
  opacity: 0.7;
}

.attachment-box.is-error .box-thumb-wrap {
  border-color: rgba(245, 108, 108, 0.4);
  background: rgba(245, 108, 108, 0.08);
}

.box-thumb-wrap {
  position: relative;
  width: 48px;
  height: 48px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-surface);
  border: 1px solid var(--border-primary);
  border-radius: 10px;
  overflow: hidden;
}

.box-spinner-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.45);
  border-radius: 10px;
}

.box-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: box-spin 0.6s linear infinite;
}

@keyframes box-spin {
  to { transform: rotate(360deg); }
}

.box-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* 文件类型预览（非图片） */
.box-file-preview {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  width: 100%;
  height: 100%;
  background: color-mix(in srgb, var(--file-color, #9ca3af) 8%, transparent);
}

.box-file-icon {
  font-size: 20px;
  color: var(--file-color, #9ca3af);
}

.box-ext {
  font-size: 9px;
  font-weight: 700;
  color: var(--file-color, #9ca3af);
  letter-spacing: 0.3px;
}

.box-name {
  font-size: 10px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 56px;
  text-align: center;
  line-height: 1.2;
}

.box-remove {
  position: absolute;
  top: -4px;
  right: -2px;
  font-size: 12px;
  color: var(--text-muted);
  cursor: pointer;
  background: var(--bg-surface);
  border-radius: 50%;
  padding: 1px;
}

.box-remove:hover {
  color: #f56c6c;
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
    padding: 4px 6px 6px 10px;
    border-radius: 12px;
  }

  .input-bottom-bar {
    gap: 4px;
  }

  .input-actions {
    gap: 4px;
    flex: 1;
    min-width: 0;
    overflow: hidden;
  }

  .input-right-actions {
    gap: 4px;
  }

  .model-select {
    width: 100px;
    flex-shrink: 0;
  }

  .model-select :deep(.el-input__wrapper) {
    padding: 0 6px 0 24px !important;
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
    flex-shrink: 0;
  }

  .think-toggle.icon-only {
    width: 28px;
    padding: 0;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .input-wrapper :deep(.el-textarea__inner) {
    font-size: 14px;
    padding: 6px 4px 0 0;
    min-height: 22px;
  }

  .attach-btn,
  .send-btn,
  .stop-btn {
    width: 28px;
    height: 28px;
    border-radius: 6px;
    flex-shrink: 0;
  }

  .attachment-box {
    width: 48px;
  }

  .box-thumb-wrap {
    width: 40px;
    height: 40px;
    border-radius: 8px;
  }

  .box-name {
    max-width: 48px;
    font-size: 9px;
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

/* ====== 附件弹出菜单（popover 内容被 teleport 到 body） ====== */

.attach-menu {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px;
}

.attach-menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-secondary);
  transition: background 0.15s;
}

.attach-menu-item:hover {
  background: var(--bg-surface-hover);
  color: var(--text-primary);
}

.attach-menu-svg {
  flex-shrink: 0;
  color: var(--text-muted);
}

/* ====== 知识库选择对话框（el-dialog 被 teleport 到 body） ====== */

.knowledge-empty {
  text-align: center;
  padding: 40px 0;
  color: var(--text-muted);
  font-size: 14px;
}

.knowledge-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 360px;
  overflow-y: auto;
  margin: -8px 0;
}

.knowledge-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-radius: 10px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
  border: 1.5px solid transparent;
  -webkit-tap-highlight-color: transparent;
  user-select: none;
}

.knowledge-item:active {
  background: var(--bg-surface-active);
}

.knowledge-item:hover {
  background: var(--bg-surface-hover);
}

.knowledge-item.selected {
  background: var(--bg-surface-active);
  border-color: var(--accent-ring);
}

.knowledge-check {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  border: 2px solid var(--border-primary);
  color: transparent;
  font-size: 14px;
  transition: all 0.15s;
}

.knowledge-item.selected .knowledge-check {
  border-color: var(--accent);
  background: var(--accent);
  color: #fff;
}

.knowledge-doc-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.knowledge-doc-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.knowledge-doc-meta {
  font-size: 12px;
  color: var(--text-muted);
}

/* 底部按钮 */
.knowledge-footer {
  display: flex;
  gap: 10px;
}

.knowledge-cancel-btn,
.knowledge-confirm-btn {
  flex: 1;
  height: 40px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 500;
}

.knowledge-cancel-btn {
  background: var(--bg-surface) !important;
  border-color: var(--border-primary) !important;
  color: var(--text-secondary) !important;
}

/* ====== 移动端：对话框全屏 ====== */
@media (max-width: 768px) {
  .knowledge-dialog {
    width: 100% !important;
    max-width: 100vw !important;
    margin: 0 !important;
    border-radius: 0 !important;
  }

  .knowledge-dialog .el-dialog__header {
    padding: 16px 16px 12px;
    margin: 0;
  }

  .knowledge-dialog .el-dialog__title {
    font-size: 16px;
    font-weight: 600;
  }

  .knowledge-dialog .el-dialog__body {
    padding: 8px 16px 16px;
  }

  .knowledge-dialog .el-dialog__footer {
    padding: 0 16px 16px;
  }

  .knowledge-list {
    max-height: 50vh;
    gap: 8px;
  }

  .knowledge-item {
    padding: 16px;
    border-radius: 12px;
    gap: 14px;
  }

  .knowledge-check {
    width: 24px;
    height: 24px;
    border-radius: 6px;
    border-width: 2px;
  }

  .knowledge-doc-name {
    font-size: 15px;
  }

  .knowledge-doc-meta {
    font-size: 13px;
  }

  .knowledge-cancel-btn,
  .knowledge-confirm-btn {
    height: 44px;
    font-size: 15px;
    border-radius: 12px;
  }

  .knowledge-footer {
    gap: 12px;
  }
}
</style>
