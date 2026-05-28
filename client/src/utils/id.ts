// 生成 8 位随机 ID（36 进制 = 数字 + 小写字母）
export function generateId(): string {
  return Math.random().toString(36).slice(2, 10)
}
