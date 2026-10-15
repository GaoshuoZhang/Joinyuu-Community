import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { MessagePlugin } from 'tdesign-vue-next'
import App from './App.vue'
import router from './router'
import { accessibleField } from './directives/accessibleField'
import { permission } from './directives/permission'
import { installTDesignAccessibility } from './utils/tdesignAccessibility'
import { useThemeStore } from './stores/theme'
/* 顺序敏感：TDesign 基础样式先加载，本应用样式后加载。
 * 两者存在同特异性的同名规则（如 .t-select__wrap 与工具类 .ctl-w-* 都只声明 width），
 * 顺序决定胜负 —— 应用样式放前面会被组件库的 width:100% 覆盖，筛选控件全部撑满整行 */
import 'tdesign-vue-next/es/style/index.css'
import './styles/tokens.css'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
/* 暗色模式：启动即应用持久化主题（localStorage） */
useThemeStore(pinia).init()
app.use(router)
/* RBAC：按钮/元素级权限指令 */
app.directive('permission', permission)
app.directive('accessible-field', accessibleField)
/* 全局错误兜底：组件渲染抛错时记录日志并给出可见提示，
 * 避免整应用白屏不可恢复且用户无从感知出错原因 */
app.config.errorHandler = (err, instance, info) => {
  console.error('[App Error]', info, err)
  MessagePlugin.error('页面渲染出错，请刷新重试')
}
app.mount('#app')
const disposeAccessibility = installTDesignAccessibility()
if (import.meta.hot) import.meta.hot.dispose(disposeAccessibility)
