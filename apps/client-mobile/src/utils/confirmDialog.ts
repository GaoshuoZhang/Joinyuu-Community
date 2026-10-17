import { DialogPlugin } from 'tdesign-mobile-vue'

/**
 * 二次确认对话框的统一层级。
 *
 * 背景：TDesign Mobile 各浮层的默认 z-index 并不在同一量级——DialogPlugin 创建出来的
 * 对话框默认只有 2500（`tdesign-mobile-vue/es/dialog/index.mjs` 的 zIndex 默认值），
 * 而 Popup 是 11500、Toast 是 12001（各自 style/index.css）。因此在「先打开 Popup，
 * 再弹出确认框」的场景下（例如安全中心里的「绑定手机号 / 更换邮箱」底部弹层填了内容后返回），
 * 确认框会被业务弹层整个盖住，按钮点不到。
 *
 * 取值 11800 = 高于 Popup(11500)，低于 Toast(12001)/Message(15000)：
 * 确认框压在业务弹层之上，同时不遮挡提示类浮层。
 */
export const CONFIRM_DIALOG_Z_INDEX = 11800

/* DialogPlugin.confirm 的入参签名是 `Partial<TdDialogProps> | string`（字符串为纯文案简写），
 * 这里排除字符串分支，保留对象分支以便调用点仍能获得属性名与类型的校验。 */
type ConfirmOptions = Exclude<Parameters<typeof DialogPlugin.confirm>[0], string>
type DialogInstance = ReturnType<typeof DialogPlugin.confirm>

/** 二次确认对话框（统一抬高层级，避免被 Popup 等业务弹层遮盖）。 */
export function confirmDialog(options: ConfirmOptions): DialogInstance {
  return DialogPlugin.confirm({ zIndex: CONFIRM_DIALOG_Z_INDEX, ...options })
}
