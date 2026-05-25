import type { ChatMessage } from '@/types/chat'

function formatTime(ts?: number): string {
  if (!ts) return ''
  return new Date(ts).toLocaleString('zh-CN')
}

function escapeMd(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&')
}

export function messagesToMarkdown(messages: ChatMessage[], title?: string): string {
  const lines: string[] = []

  if (title) {
    lines.push(`# ${title}`, '')
  }

  for (const msg of messages) {
    if (msg.role === 'user') {
      lines.push(`## 用户${formatTime(msg.createdAt) ? ' — ' + formatTime(msg.createdAt) : ''}`, '')
      lines.push(msg.content, '')
    } else if (msg.role === 'assistant') {
      const time = formatTime(msg.createdAt)
      lines.push(`## AI${time ? ' — ' + time : ''}`, '')
      if (msg.reasoning_content) {
        lines.push('<details>', '<summary>思考过程</summary>', '', msg.reasoning_content, '', '</details>', '')
      }
      if (msg.content) {
        lines.push(msg.content, '')
      }
    }
  }

  return lines.join('\n')
}

export function downloadMarkdown(markdown: string, filename: string): void {
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
