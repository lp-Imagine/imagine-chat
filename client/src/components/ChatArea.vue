<template>
  <div class="chat-area">
    <header class="chat-header">
      <el-button
        v-if="isMobile"
        class="menu-btn"
        :icon="Expand"
        text
        @click="$emit('open-sidebar')"
      />
      <span class="chat-title">{{ title || 'IMAGINE CHAT' }}</span>
      <el-button
        v-if="messages.length"
        class="export-btn"
        :icon="Download"
        text
        size="small"
        title="导出 Markdown"
        @click="exportMarkdown"
      />
    </header>

    <div class="messages-wrapper">
      <div ref="msgContainer" class="messages-container">
        <div v-if="!messages.length" class="empty-state">
          <div class="empty-icon">
            <el-icon :size="48"><ChatDotRound /></el-icon>
          </div>
          <p>开始一段新的对话</p>
        </div>

        <div
          v-for="(msg, index) in messages"
          :key="msg.id"
          :ref="(el) => setMsgRef(el, index, msg.role)"
          :data-msg-index="index"
          :data-msg-role="msg.role"
        >
          <MessageBubble
            :role="msg.role"
            :content="msg.content"
            :reasoning_content="msg.reasoning_content"
            :loading="msg.loading"
            :message-id="msg.id"
            :is-latest="index === messages.length - 1"
            :versions="msg.versions"
            :version-index="msg.versionIndex"
            :interrupted="msg.interrupted"
            :is-streaming="loading"
            :card_tool="msg.card_tool"
            @regenerate="(id) => emit('regenerate', id)"
            @reanswer="(id) => emit('reanswer', id)"
            @copy-to-input="(content) => emit('copy-to-input', content)"
            @switch-version="(id, dir) => emit('switchVersion', id, dir)"
            @edit-message="(id, content) => emit('editMessage', id, content)"
            @card-confirm="(msg) => emit('cardConfirm', msg)"
          />
        </div>

        <div ref="scrollAnchor" />
      </div>

      <!-- 提问锚点导航（桌面端） -->
      <div v-if="!isMobile && userAnchors.length > 1" class="anchor-dots">
        <div
          v-for="(anchor, i) in userAnchors"
          :key="anchor.index"
          class="anchor-dot"
          :class="{ active: i === activeDotIndex }"
          :title="anchor.label"
          @click="scrollToUser(anchor.index)"
        />
      </div>

      <!-- 移动端回到底部按钮 -->
      <div v-if="isMobile && showScrollBtn" class="scroll-to-bottom-btn" @click="scrollToBottomClicked">
        <el-icon :size="18"><ArrowDownBold /></el-icon>
      </div>
    </div>

    <ChatInput ref="inputRef" :disabled="loading" :show-thinking="showThinking" :search-enabled="searchEnabled" :is-mobile="isMobile" @send="onSend" @toggle-thinking="$emit('toggle-thinking')" @toggle-search="$emit('toggle-search')" @stop="$emit('stop')" />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, computed, onMounted, onBeforeUnmount } from 'vue'
import { ChatDotRound, Expand, ArrowDownBold, Download } from '@element-plus/icons-vue'
import type { ChatMessage } from '@/types/chat'
import { messagesToMarkdown, downloadMarkdown } from '@/utils/markdown'
import MessageBubble from './MessageBubble.vue'
import ChatInput from './ChatInput.vue'

const props = defineProps<{
  messages: ChatMessage[]
  title?: string
  loading?: boolean
  searchEnabled?: boolean
  showThinking?: boolean
  isMobile?: boolean
}>()

const emit = defineEmits<{
  send: [content: string]
  'toggle-search': []
  'toggle-thinking': []
  regenerate: [messageId: string]
  reanswer: [messageId: string]
  'copy-to-input': [content: string]
  'switchVersion': [messageId: string, direction: 'prev' | 'next']
  editMessage: [messageId: string, newContent: string]
  stop: []
  'open-sidebar': []
  cardConfirm: [message: string]
}>()

const msgContainer = ref<HTMLElement>()
const scrollAnchor = ref<HTMLElement>()
const inputRef = ref<InstanceType<typeof ChatInput>>()

// ====== 提问锚点导航 ======

interface AnchorItem {
  index: number
  label: string
}

const userAnchors = computed<AnchorItem[]>(() => {
  const anchors: AnchorItem[] = []
  props.messages.forEach((m, i) => {
    if (m.role === 'user') {
      anchors.push({ index: i, label: m.content.slice(0, 30) })
    }
  })
  return anchors
})

const activeDotIndex = ref(-1)
const msgEls = new Map<number, HTMLElement>()

function setMsgRef(el: any, index: number, role: string) {
  if (el && role === 'user') {
    msgEls.set(index, el)
  }
}

let io: IntersectionObserver | null = null

function setupIntersectionObserver() {
  if (io) io.disconnect()
  io = new IntersectionObserver((entries) => {
    // 找到第一个可见的用户消息作为 active dot
    const visible = new Set<number>()
    for (const entry of entries) {
      if (entry.isIntersecting) {
        const idx = Number((entry.target as HTMLElement).dataset.msgIndex)
        visible.add(idx)
      }
    }
    if (visible.size > 0) {
      const sorted = [...visible].sort((a, b) => a - b)
      const firstVisible = sorted[0]
      // 找到它在 userAnchors 中的位置
      const dotIdx = userAnchors.value.findIndex(a => a.index === firstVisible)
      if (dotIdx >= 0) activeDotIndex.value = dotIdx
    }
  }, {
    root: msgContainer.value,
    threshold: 0.1
  })
  // observe all user message elements
  for (const [idx, el] of msgEls) {
    io.observe(el)
  }
}

function scrollToUser(msgIndex: number) {
  const el = msgEls.get(msgIndex)
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

watch(() => props.messages.length, () => {
  nextTick(() => setupIntersectionObserver())
})

onMounted(() => {
  nextTick(() => {
    setupIntersectionObserver()
    if (msgContainer.value) {
      msgContainer.value.addEventListener('scroll', onScroll, { passive: true })
    }
  })
})

onBeforeUnmount(() => {
  if (io) io.disconnect()
  if (msgContainer.value) {
    msgContainer.value.removeEventListener('scroll', onScroll)
  }
})

// ====== 滚动 ======

// 直接操作 scrollTop 比 scrollIntoView 更可靠：
// scrollIntoView 在流式更新时可能因动画队列堆积或元素高度未变而失效
function scrollToBottom() {
  nextTick(() => {
    if (msgContainer.value) {
      msgContainer.value.scrollTop = msgContainer.value.scrollHeight
    }
  })
}

watch(() => props.messages.length, () => scrollToBottom())
// 仅在流式输出时（最后一条消息 loading）跟随内容滚动，避免版本切换等操作触发滚底
watch(() => props.messages, () => {
  const msgs = props.messages
  if (msgs.length > 0 && msgs[msgs.length - 1].loading) {
    scrollToBottom()
  }
}, { deep: true })

// ====== 移动端「回到底部」按钮 ======

const showScrollBtn = ref(false)

function checkScrollPosition() {
  const el = msgContainer.value
  if (!el) return
  showScrollBtn.value = el.scrollHeight - el.scrollTop - el.clientHeight > 120
}

function onScroll() {
  checkScrollPosition()
}

// watch(msgContainer) removed — listener set up in onMounted

function scrollToBottomClicked() {
  scrollToBottom()
  showScrollBtn.value = false
}

function onSend(content: string) {
  emit('send', content)
  scrollToBottom()
}

function setInputText(value: string) {
  inputRef.value?.setText(value)
}

function exportMarkdown() {
  const md = messagesToMarkdown(props.messages, props.title)
  const filename = `${props.title || '对话'}.md`
  downloadMarkdown(md, filename)
}

// 暴露 scrollToBottom 方法，父组件可直接调用
defineExpose({ scrollToBottom, setInputText })
</script>

<style scoped>
.chat-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--bg-chat);
  min-width: 0;
}

.messages-wrapper {
  flex: 1;
  position: relative;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.chat-header {
  padding: 14px 20px;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--bg-header);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.chat-title {
  color: var(--text-primary);
  font-size: 15px;
  font-weight: 600;
}

.export-btn {
  color: var(--text-muted);
  flex-shrink: 0;
  transition: color .15s;
}

.export-btn:hover {
  color: var(--accent-light);
}

.menu-btn {
  color: var(--text-muted);
  display: none;
}

.messages-container {
  flex: 1;
  overflow-y: auto;
  padding: 16px 0;
  background: var(--bg-chat);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-muted);
  gap: 12px;
}

.empty-state p {
  font-size: 15px;
}

/* 提问锚点导航 */
.anchor-dots {
  position: absolute;
  right: 14px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  z-index: 10;
  padding: 10px 8px;
  background: var(--bg-glass);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border-radius: 16px;
  border: 1px solid var(--border-subtle);
}

.anchor-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--dot-bg);
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
}

.anchor-dot::before {
  content: '';
  position: absolute;
  inset: -4px;
  border-radius: 50%;
  transition: all 0.2s ease;
}

.anchor-dot:hover {
  background: var(--dot-hover);
  transform: scale(1.6);
}

.anchor-dot.active {
  background: var(--dot-active);
  box-shadow: var(--dot-glow);
  transform: scale(1.4);
}

.anchor-dot.active::before {
  content: '';
  position: absolute;
  inset: -5px;
  border-radius: 50%;
  border: 2px solid var(--accent);
  opacity: 0.4;
  animation: dotPulse 1.8s ease-out infinite;
}

@keyframes dotPulse {
  0% { transform: scale(0.8); opacity: 0.6; }
  100% { transform: scale(1.8); opacity: 0; }
}

/* ====== 移动端 ====== */
@media (max-width: 768px) {
  .chat-header {
    padding: 10px 14px;
  }

  .menu-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    flex-shrink: 0;
  }

  .chat-title {
    font-size: 14px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .messages-container {
    padding: 8px 0;
  }

  .empty-state p {
    font-size: 14px;
  }

  .scroll-to-bottom-btn {
    position: absolute;
    right: 12px;
    bottom: 12px;
    width: 38px;
    height: 38px;
    border-radius: 50%;
    background: var(--bg-glass);
    border: 1px solid var(--border-primary);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-primary);
    cursor: pointer;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.3);
    z-index: 10;
    animation: scrollBtnIn 0.2s ease;
  }

  @keyframes scrollBtnIn {
    from { transform: scale(0.6); opacity: 0; }
    to { transform: scale(1); opacity: 1; }
  }
}
</style>
