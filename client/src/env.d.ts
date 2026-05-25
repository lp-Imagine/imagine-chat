// TypeScript 环境声明：.vue 文件和 vue-markdown-render 模块的类型定义
/// <reference types="vite/client" />
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

declare module 'vue-markdown-render'
