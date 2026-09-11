import { createApp } from 'vue'
import { createPinia } from 'pinia'
import TDesign from 'tdesign-vue-next'
import App from './App.vue'
import router from './router'
import { permission } from './directives/permission'
import { useThemeStore } from './stores/theme'
import './styles/tokens.css'
import 'tdesign-vue-next/es/style/index.css'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
/* 暗色模式：启动即应用持久化主题（localStorage） */
useThemeStore(pinia).init()
app.use(router)
app.use(TDesign)
/* RBAC：按钮/元素级权限指令 */
app.directive('permission', permission)
/* 全局错误兜底：组件渲染抛错时记录日志，避免整应用白屏不可恢复 */
app.config.errorHandler = (err, instance, info) => {
  console.error('[App Error]', info, err)
}
app.mount('#app')
