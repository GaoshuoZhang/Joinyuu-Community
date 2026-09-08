import { createApp } from 'vue'
import { createPinia } from 'pinia'
import TDesign from 'tdesign-vue-next'
import App from './App.vue'
import router from './router'
import './styles/tokens.css'
import 'tdesign-vue-next/es/style/index.css'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.use(TDesign)
/* 全局错误兜底：组件渲染抛错时记录日志，避免整应用白屏不可恢复 */
app.config.errorHandler = (err, instance, info) => {
  console.error('[App Error]', info, err)
}
app.mount('#app')
