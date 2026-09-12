import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import { apiMode } from './api/http'
import './styles/tokens.css'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')

/* [MOCK-ONLY] 模式标识：仅 mock 模式挂载开发者工具（http 模式此日志不出现） */
if (apiMode === 'mock') {
  console.info('[joinyuu-client] API 模式 = mock（演示数据；切换真实接口见 docs/m2-client-plan.md §3.2）')
}
