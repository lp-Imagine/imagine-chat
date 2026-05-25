<template>
  <div class="message-row" :class="role">
    <div class="msg-avatar" :class="role === 'user' ? 'avatar-user' : 'avatar-ai'">
      <el-icon :size="18"><UserFilled v-if="role === 'user'" /><Cpu v-else /></el-icon>
    </div>
    <div class="msg-main">
      <!-- 思考过程：仅当消息确有 reasoning_content 时才渲染，避免加载时闪现空卡片 -->
      <div
        v-if="role === 'assistant' && reasoningContent"
        class="thinking-block"
        :class="{ expanded: thinkingExpanded, active: loading && !content }"
      >
        <div class="thinking-header" @click="thinkingExpanded = !thinkingExpanded">
          <el-icon class="thinking-chevron"><ArrowRightBold /></el-icon>
          <template v-if="loading && !content">
            <span class="thinking-status thinking-status--active">正在思考</span>
            <span class="thinking-dot-flash" />
          </template>
          <template v-else>
            <span class="thinking-status thinking-status--done">已思考</span>
            <el-icon class="thinking-check"><CircleCheckFilled /></el-icon>
          </template>
        </div>
        <div ref="thinkingBody" class="thinking-body">
          <div class="thinking-text">{{ reasoningContent }}</div>
        </div>
      </div>

      <!-- 中断状态提示 -->
      <div v-if="role === 'assistant' && interrupted && !loading" class="interrupted-tag">
        <el-icon class="interrupted-icon"><VideoPause /></el-icon>
        <span>已终止</span>
      </div>

      <div class="msg-bubble" :class="role">
        <template v-if="role === 'user'">
          <div class="user-text">{{ content }}</div>
        </template>
        <template v-else>
          <div ref="mdContainer" class="markdown-body">
            <template v-if="content">
              <VueMarkdown
                :source="content"
                :plugins="plugins"
                :options="mdOptions"
              />
            </template>
            <div v-else-if="!loading && interrupted && !content" class="interrupted-placeholder">（空响应）</div>
          </div>
        </template>
        <div v-if="loading" class="typing-indicator">
          <span></span><span></span><span></span>
        </div>
      </div>

      <!-- 用户消息操作：编辑 + 复制 + 复制到输入框 -->
      <div
        v-if="role === 'user' && messageId && !isEditing && !isStreaming"
        class="msg-actions user-msg-actions"
      >
        <el-button
          :icon="Edit"
          circle
          size="small"
          @click="startEdit"
          title="编辑"
        />
        <el-button
          :icon="copyFeedback ? Check : CopyDocument"
          circle
          size="small"
          :style="{ color: copyFeedback ? '#67c23a' : undefined }"
          @click="copyContent"
          title="复制"
        />
        <el-button
          :icon="Back"
          circle
          size="small"
          @click="copyToInput"
          title="复制到输入框"
        />
      </div>

      <!-- 用户消息编辑模式 -->
      <div v-if="role === 'user' && isEditing" class="edit-area">
        <textarea
          ref="editTextarea"
          v-model="editContent"
          class="edit-textarea"
          rows="3"
          @keydown="onEditKeydown"
        />
        <div class="edit-actions">
          <el-button :icon="Close" circle size="small" @click="cancelEdit" title="取消" />
          <el-button :icon="Check" circle size="small" type="primary" :disabled="!editContent.trim()" @click="submitEdit" title="保存并重新回答" />
        </div>
      </div>

      <div
        v-if="role === 'assistant' && !loading && messageId"
        class="msg-actions"
      >
        <el-button
          :icon="copyFeedback ? Check : CopyDocument"
          circle
          size="small"
          :style="{ color: copyFeedback ? '#67c23a' : undefined }"
          @click="copyContent"
          title="复制"
        />
        <!-- 版本切换导航：仅当有多个版本时显示 -->
        <template v-if="hasVersions">
          <el-button
            :icon="ArrowLeft"
            circle
            size="small"
            :disabled="!canPrevVersion"
            @click="switchVersion('prev')"
            title="上一版本"
          />
          <span class="version-label">{{ versionLabel }}</span>
          <el-button
            :icon="ArrowRight"
            circle
            size="small"
            :disabled="!canNextVersion"
            @click="switchVersion('next')"
            title="下一版本"
          />
        </template>
        <el-button
          v-if="isLatest && interrupted"
          :icon="Refresh"
          circle
          size="small"
          @click="reanswer"
          title="重新回答"
        />
        <el-button
          v-else-if="isLatest"
          :icon="Refresh"
          circle
          size="small"
          @click="regenerate"
          title="重新生成"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, computed } from 'vue'
import { UserFilled, Cpu, ArrowRightBold, CircleCheckFilled, CopyDocument, Refresh, Check, ArrowLeft, ArrowRight, VideoPause, Back, Edit, Close } from '@element-plus/icons-vue'
import type { VersionSnapshot } from '@/types/chat'
import VueMarkdown from 'vue-markdown-render'
import hljs from 'highlight.js/lib/core'

// 按需注册常用语言，减少打包体积
import javascript from 'highlight.js/lib/languages/javascript'
import typescript from 'highlight.js/lib/languages/typescript'
import python from 'highlight.js/lib/languages/python'
import css from 'highlight.js/lib/languages/css'
import json from 'highlight.js/lib/languages/json'
import bash from 'highlight.js/lib/languages/bash'
import xml from 'highlight.js/lib/languages/xml'
import yaml from 'highlight.js/lib/languages/yaml'
import sql from 'highlight.js/lib/languages/sql'
import java from 'highlight.js/lib/languages/java'
import go from 'highlight.js/lib/languages/go'
import rust from 'highlight.js/lib/languages/rust'
import shell from 'highlight.js/lib/languages/shell'
import markdown from 'highlight.js/lib/languages/markdown'
import diff from 'highlight.js/lib/languages/diff'

// 注册语言及其常用别名（如 js/javascript, ts/typescript）
hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('js', javascript)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('ts', typescript)
hljs.registerLanguage('python', python)
hljs.registerLanguage('py', python)
hljs.registerLanguage('css', css)
hljs.registerLanguage('json', json)
hljs.registerLanguage('bash', bash)
hljs.registerLanguage('sh', bash)
hljs.registerLanguage('html', xml)
hljs.registerLanguage('xml', xml)
hljs.registerLanguage('yaml', yaml)
hljs.registerLanguage('yml', yaml)
hljs.registerLanguage('sql', sql)
hljs.registerLanguage('java', java)
hljs.registerLanguage('go', go)
hljs.registerLanguage('rust', rust)
hljs.registerLanguage('shell', shell)
hljs.registerLanguage('markdown', markdown)
hljs.registerLanguage('md', markdown)
hljs.registerLanguage('diff', diff)

const props = defineProps<{
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  reasoning_content?: string
  loading?: boolean
  messageId?: string
  isLatest?: boolean
  interrupted?: boolean
  versions?: VersionSnapshot[]
  versionIndex?: number
  isStreaming?: boolean
}>()

const emit = defineEmits<{
  regenerate: [messageId: string]
  reanswer: [messageId: string]
  'copy-to-input': [content: string]
  'switch-version': [messageId: string, direction: 'prev' | 'next']
  'edit-message': [messageId: string, newContent: string]
}>()

// 思考过程展开/折叠状态：收到推理内容时自动展开
const thinkingExpanded = ref(props.interrupted && !!props.reasoning_content)
const reasoningContent = computed(() => props.reasoning_content || '')
const thinkingBody = ref<HTMLElement>()

// 新消息开始时重置折叠状态，推理内容流入时自动展开
watch(() => props.loading, (isLoading) => {
  if (isLoading) thinkingExpanded.value = false
})
watch(() => props.reasoning_content, (val) => {
  if (val && props.loading) thinkingExpanded.value = true
  nextTick(() => {
    if (thinkingBody.value) {
      thinkingBody.value.scrollTop = thinkingBody.value.scrollHeight
    }
  })
})

// 复制全文到剪贴板，2 秒内显示绿色勾反馈
const copyFeedback = ref(false)

async function copyContent() {
  if (!props.content) return
  try {
    await navigator.clipboard.writeText(props.content)
    copyFeedback.value = true
    setTimeout(() => { copyFeedback.value = false }, 2000)
  } catch { /* clipboard write failed */ }
}

function copyToInput() {
  if (props.content) {
    emit('copy-to-input', props.content)
  }
}

// ====== 消息编辑 ======

const isEditing = ref(false)
const editContent = ref('')
const editTextarea = ref<HTMLTextAreaElement>()

function startEdit() {
  editContent.value = props.content
  isEditing.value = true
  nextTick(() => {
    editTextarea.value?.focus()
    editTextarea.value?.select()
  })
}

function cancelEdit() {
  isEditing.value = false
  editContent.value = ''
}

function submitEdit() {
  const trimmed = editContent.value.trim()
  if (!trimmed || !props.messageId) return
  emit('edit-message', props.messageId, trimmed)
  isEditing.value = false
  editContent.value = ''
}

function onEditKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    submitEdit()
  }
  if (e.key === 'Escape') {
    cancelEdit()
  }
}

function regenerate() {
  if (props.messageId) {
    emit('regenerate', props.messageId)
  }
}

function reanswer() {
  if (props.messageId) {
    emit('reanswer', props.messageId)
  }
}

const hasVersions = computed(() => props.versions && props.versions.length > 1 && props.versionIndex !== undefined)
const versionLabel = computed(() => {
  if (!hasVersions.value) return ''
  return `${props.versionIndex! + 1}/${props.versions!.length}`
})
const canPrevVersion = computed(() => hasVersions.value && props.versionIndex! > 0)
const canNextVersion = computed(() => hasVersions.value && props.versionIndex! < props.versions!.length - 1)

function switchVersion(direction: 'prev' | 'next') {
  if (props.messageId) {
    emit('switch-version', props.messageId, direction)
  }
}

// vue-markdown-render v2 通过 options 传递 MarkdownIt 配置
const plugins: any[] = []
const mdOptions = { highlight: highlightCode }
const mdContainer = ref<HTMLElement>()

// highlight.js 代码高亮回调，供 MarkdownIt 渲染围栏代码块时调用
function highlightCode(code: string, lang: string): string {
  if (lang && hljs.getLanguage(lang)) {
    try {
      return hljs.highlight(code, { language: lang }).value
    } catch {}
  }
  return hljs.highlightAuto(code).value
}

// 为 markdown 渲染后的 <pre> 代码块添加语言标签和复制按钮
function enhanceCodeBlocks() {
  if (!mdContainer.value) return
  const pres = mdContainer.value.querySelectorAll('pre')
  pres.forEach((pre) => {
    // 避免重复包裹
    if (pre.parentElement?.classList.contains('code-block')) return

    const code = pre.querySelector('code')
    const langClass = code?.className.match(/language-(\w+)/)
    const lang = langClass ? langClass[1] : ''

    const wrapper = document.createElement('div')
    wrapper.className = 'code-block'

    const header = document.createElement('div')
    header.className = 'code-block-header'

    const langLabel = document.createElement('span')
    langLabel.className = 'code-lang'
    langLabel.textContent = lang || 'code'

    const copyBtn = document.createElement('button')
    copyBtn.className = 'code-copy-btn'
    copyBtn.textContent = '复制'
    copyBtn.onclick = () => {
      const text = code?.textContent || ''
      navigator.clipboard.writeText(text).then(() => {
        copyBtn.textContent = '已复制'
        setTimeout(() => { copyBtn.textContent = '复制' }, 2000)
      })
    }

    header.appendChild(langLabel)
    header.appendChild(copyBtn)
    wrapper.appendChild(header)

    pre.parentNode?.insertBefore(wrapper, pre)
    wrapper.appendChild(pre)
  })
}

// 监听 content 变化，markdown 渲染后执行 enhanceCodeBlocks
watch(() => props.content, () => {
  nextTick(() => enhanceCodeBlocks())
}, { immediate: true })
</script>

<style scoped>
.message-row {
  display: flex;
  gap: 12px;
  padding: 12px 20px;
  max-width: 860px;
  margin: 0 auto;
  width: 100%;
  transition: background 0.15s;
}

.message-row:hover {
  background: var(--bg-surface-hover);
}

.message-row.user {
  flex-direction: row-reverse;
}

.msg-avatar {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.avatar-user {
  background: var(--accent-gradient);
  color: #fff;
  box-shadow: 0 2px 12px var(--accent-glow);
}

.avatar-ai {
  background: var(--bg-surface);
  color: var(--accent-light);
  border: 1px solid var(--border-primary);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.msg-main {
  max-width: 75%;
  min-width: 0;
}

.msg-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  margin-top: 4px;
  opacity: 0;
  transition: opacity 0.15s;
}

.version-label {
  font-size: 12px;
  color: var(--text-muted);
  min-width: 28px;
  text-align: center;
  user-select: none;
}

.message-row:hover .msg-actions {
  opacity: 1;
}

.user-msg-actions {
  justify-content: flex-end;
}

/* 操作按钮统一样式 */
.msg-actions :deep(.el-button) {
  --el-button-bg-color: transparent;
  --el-button-border-color: transparent;
  --el-button-text-color: var(--text-muted);
  --el-button-hover-bg-color: var(--bg-surface);
  --el-button-hover-border-color: var(--border-primary);
  --el-button-hover-text-color: var(--text-primary);
  transition: all 0.15s;
}

.msg-actions :deep(.el-button.is-disabled) {
  opacity: 0.25;
}

.interrupted-placeholder {
  color: var(--text-muted);
  font-style: italic;
}

.msg-bubble {
  padding: 12px 16px;
  border-radius: 14px;
  line-height: 1.65;
  font-size: 14px;
  word-break: break-word;
}

.msg-bubble.user {
  background: var(--bubble-user);
  color: var(--bubble-user-text);
}

.msg-bubble.assistant {
  background: var(--bubble-assistant);
  color: var(--bubble-assistant-text);
  border: 1px solid var(--bubble-assistant-border);
}

[data-theme="light"] .msg-bubble.assistant {
  box-shadow: var(--shadow-card);
}

.user-text {
  white-space: pre-wrap;
}

/* Markdown body */
.markdown-body {
  line-height: 1.7;
  font-size: 14px;
  color: var(--bubble-assistant-text);
}

.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3) {
  color: var(--text-primary);
  margin: 14px 0 6px;
  font-weight: 600;
}
.markdown-body :deep(h1) { font-size: 1.25em; }
.markdown-body :deep(h2) { font-size: 1.12em; }
.markdown-body :deep(h3) { font-size: 1.04em; }

.markdown-body :deep(p) { margin: 4px 0; }

.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  padding-left: 18px;
  margin: 6px 0;
}

.markdown-body :deep(li) { margin: 2px 0; }

.markdown-body :deep(code) {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 13px;
}

.markdown-body :deep(:not(pre) > code) {
  background: var(--code-inline-bg);
  padding: 2px 6px;
  border-radius: 5px;
  color: var(--code-inline-text);
}

/* Code block wrapper */
.markdown-body :deep(.code-block) {
  margin: 10px 0;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid var(--border-primary);
  background: var(--code-block-bg);
}

.markdown-body :deep(.code-block-header) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 14px;
  background: var(--code-block-header);
  border-bottom: 1px solid var(--border-subtle);
  user-select: none;
}

.markdown-body :deep(.code-lang) {
  font-size: 12px;
  color: var(--text-muted);
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
}

.markdown-body :deep(.code-copy-btn) {
  font-size: 12px;
  padding: 3px 12px;
  border-radius: 5px;
  border: 1px solid var(--border-primary);
  background: var(--bg-surface);
  color: var(--text-muted);
  cursor: pointer;
  transition: all .15s;
}

.markdown-body :deep(.code-copy-btn:hover) {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}

.markdown-body :deep(.code-block pre) {
  margin: 0;
  background: transparent;
  border: none;
  border-radius: 0;
  padding: 14px 16px;
  overflow-x: auto;
}

.markdown-body :deep(.code-block pre code) {
  background: transparent;
  padding: 0;
}

/* Plain pre (fallback, no language) */
.markdown-body :deep(pre:not(.code-block pre)) {
  background: var(--code-block-bg);
  border-radius: 10px;
  padding: 14px;
  overflow-x: auto;
  margin: 10px 0;
  border: 1px solid var(--border-primary);
}

.markdown-body :deep(pre:not(.code-block pre) code) {
  background: transparent;
  padding: 0;
  color: var(--text-primary);
}

.markdown-body :deep(table) {
  border-collapse: collapse;
  margin: 10px 0;
  width: 100%;
  border-radius: 8px;
  overflow: hidden;
}

.markdown-body :deep(th),
.markdown-body :deep(td) {
  border: 1px solid var(--table-border);
  padding: 8px 12px;
  text-align: left;
}

.markdown-body :deep(th) {
  background: var(--table-header-bg);
  font-weight: 600;
  color: var(--text-secondary);
}

.markdown-body :deep(blockquote) {
  border-left: 3px solid var(--accent);
  padding-left: 12px;
  color: var(--text-muted);
  margin: 6px 0;
}

.markdown-body :deep(a) { color: var(--accent-light); }

.markdown-body :deep(strong) { color: var(--text-primary); }

/* Thinking block */
.thinking-block {
  margin-bottom: 8px;
  border-radius: 10px;
  border: 1px solid var(--thinking-border);
  background: var(--thinking-bg);
  overflow: hidden;
  font-size: 13px;
}

.thinking-block.active {
  border-color: var(--thinking-border);
}

.thinking-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  cursor: pointer;
  user-select: none;
  color: var(--thinking-text);
  font-weight: 500;
}

.thinking-header:hover {
  background: var(--bg-surface-hover);
}

.thinking-chevron {
  font-size: 12px;
  transition: transform .2s;
}

.thinking-block.expanded .thinking-chevron {
  transform: rotate(90deg);
}

.thinking-status {
  font-size: 13px;
}

.thinking-status--active,
.thinking-status--done,
.thinking-check,
.thinking-dot-flash {
  color: var(--thinking-text);
}

.thinking-dot-flash {
  width: 7px;
  height: 7px;
  background: currentColor;
  border-radius: 50%;
  margin-left: 4px;
  animation: blink 1s infinite;
}

@keyframes blink {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 1; }
}

.thinking-body {
  display: none;
  padding: 0 12px 10px;
  color: var(--thinking-text);
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 200px;
  overflow-y: auto;
}

.thinking-block.expanded .thinking-body {
  display: block;
}

/* Interrupted tag */
.interrupted-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 6px;
  padding: 3px 10px;
  border-radius: 12px;
  background: rgba(220,38,38,0.12);
  border: 1px solid rgba(220,38,38,0.25);
  color: #f87171;
  font-size: 12px;
}

.interrupted-icon {
  font-size: 13px;
}

/* Typing indicator */
.typing-indicator {
  display: inline-flex;
  gap: 4px;
  padding: 6px 0 2px;
}
.typing-indicator span {
  width: 7px;
  height: 7px;
  background: var(--text-muted);
  border-radius: 50%;
  animation: bounce 1.4s infinite ease-in-out both;
}
.typing-indicator span:nth-child(1) { animation-delay: -.32s; }
.typing-indicator span:nth-child(2) { animation-delay: -.16s; }

@keyframes bounce {
  0%, 80%, 100% { transform: scale(0); }
  40% { transform: scale(1); }
}

/* ====== 消息编辑 ====== */

.edit-area {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.edit-textarea {
  width: 100%;
  padding: 10px 14px;
  font-size: 14px;
  font-family: inherit;
  line-height: 1.6;
  color: var(--text-primary);
  background: var(--bg-input);
  border: 1px solid var(--border-focus);
  border-radius: 10px;
  resize: vertical;
  outline: none;
  box-sizing: border-box;
  min-height: 60px;
}

.edit-textarea:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-ring);
}

.edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

/* ====== 移动端 ====== */
@media (max-width: 768px) {
  .message-row {
    padding: 10px 12px;
    gap: 8px;
  }

  .msg-avatar {
    width: 32px;
    height: 32px;
    border-radius: 8px;
  }

  .msg-avatar .el-icon {
    font-size: 15px;
  }

  .msg-main {
    max-width: 82%;
  }

  .msg-bubble {
    padding: 10px 14px;
    border-radius: 12px;
    font-size: 14px;
  }

  .msg-bubble.user {
    border-radius: 12px 12px 4px 12px;
  }

  .msg-bubble.assistant {
    border-radius: 12px 12px 12px 4px;
  }

  .msg-actions {
    opacity: 1;
    margin-top: 2px;
    gap: 2px;
  }

  .msg-actions :deep(.el-button) {
    width: 30px;
    height: 30px;
    padding: 0;
  }

  .msg-actions :deep(.el-button .el-icon) {
    font-size: 14px;
  }

  .version-label {
    font-size: 11px;
  }

  .thinking-block {
    font-size: 12px;
  }

  .thinking-header {
    padding: 6px 10px;
  }

  .thinking-body {
    max-height: 160px;
    font-size: 12px;
  }

  .interrupted-tag {
    font-size: 11px;
    padding: 2px 8px;
  }

  .markdown-body {
    font-size: 13px;
  }

  .markdown-body :deep(h1) { font-size: 1.15em; }
  .markdown-body :deep(h2) { font-size: 1.05em; }

  .markdown-body :deep(.code-block pre) {
    padding: 10px 12px;
    font-size: 12px;
  }

  .markdown-body :deep(.code-block-header) {
    padding: 4px 10px;
  }

  .markdown-body :deep(.code-lang) {
    font-size: 11px;
  }

  .markdown-body :deep(.code-copy-btn) {
    font-size: 11px;
    padding: 2px 8px;
  }

  .markdown-body :deep(pre:not(.code-block pre)) {
    padding: 10px;
    font-size: 12px;
  }
}
</style>
