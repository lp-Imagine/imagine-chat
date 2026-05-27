/** @type {import('@commitlint/types').UserConfig} */
module.exports = {
  extends: [],
  rules: {
    // 提交类型必填
    'type-enum': [2, 'always', [
      'feat',     // 新功能
      'fix',      // 修复
      'docs',     // 文档
      'style',    // 样式（不影响代码逻辑）
      'refactor', // 重构
      'perf',     // 性能优化
      'test',     // 测试
      'chore',    // 构建/工具
      'ci',       // CI/CD
      'build',    // 构建系统
      'revert',   // 回退
    ]],
    // 格式：type: 描述（冒号后有空格）
    'type-case': [2, 'always', 'lower-case'],
    'type-empty': [2, 'never'],
    'subject-empty': [2, 'never'],
    // 描述至少5个字符
    'subject-min-length': [2, 'always', 2],
  },
  // 忽略范围，不使用 (scope)
  parserPreset: {
    parserOpts: {
      headerPattern: /^(\w+):\s(.+)$/,
      headerCorrespondence: ['type', 'subject'],
    },
  },
}
