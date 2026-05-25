// Vue 应用入口：挂载 Element Plus（中文 locale）、全局样式
import { createApp } from 'vue'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
// @ts-ignore - element-plus locale typing
import zhCn from 'element-plus/dist/locale/zh-cn.mjs'
import App from './App.vue'
import './styles/theme.css'
import './styles/global.css'
import './styles/hljs.css'

const app = createApp(App)
app.use(ElementPlus, { locale: zhCn })
app.mount('#app')
