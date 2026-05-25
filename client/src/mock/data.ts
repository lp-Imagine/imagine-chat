// Mock 数据（开发初期使用，现已切换到后端 API，仅保留作参考）
import type { ChatMessage, Conversation } from '@/types/chat'

const uid = () => Math.random().toString(36).slice(2, 10)

export const mockConversations: Conversation[] = [
  {
    id: uid(),
    title: 'Vue3 组件通信方式',
    updatedAt: Date.now() - 1000 * 60 * 5,
    messages: [
      {
        id: uid(),
        role: 'user',
        content: 'Vue3 里组件之间有几种通信方式?',
        createdAt: Date.now() - 1000 * 60 * 6
      },
      {
        id: uid(),
        role: 'assistant',
        createdAt: Date.now() - 1000 * 60 * 5,
        content: `Vue3 常用的组件通信方式:

1. **Props / Emits**:父子组件最常用
2. **v-model**:双向绑定语法糖
3. **provide / inject**:跨层级注入
4. **Pinia / Vuex**:全局状态管理
5. **EventBus / mitt**:任意组件通信

\`\`\`ts
// 父组件
const msg = ref('hello')
provide('msg', msg)

// 子组件
const msg = inject<Ref<string>>('msg')
\`\`\`

| 方式 | 适用场景 |
| --- | --- |
| props | 父子 |
| provide | 跨层级 |
| pinia | 全局 |
`
      }
    ]
  },
  {
    id: uid(),
    title: 'TypeScript 泛型用法',
    updatedAt: Date.now() - 1000 * 60 * 60,
    messages: []
  },
  {
    id: uid(),
    title: '新对话',
    updatedAt: Date.now() - 1000 * 60 * 60 * 24,
    messages: []
  }
]

export const createMessage = (role: ChatMessage['role'], content: string): ChatMessage => ({
  id: uid(),
  role,
  content,
  createdAt: Date.now()
})

export const createConversation = (title = '新对话'): Conversation => ({
  id: uid(),
  title,
  messages: [],
  updatedAt: Date.now()
})
