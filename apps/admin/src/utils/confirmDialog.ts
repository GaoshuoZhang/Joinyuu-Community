import { DialogPlugin } from 'tdesign-vue-next'

/**
 * 二次确认对话框的统一层级。
 *
 * 背景：TDesign 各浮层的默认 z-index 不在同一量级——DialogPlugin 创建出来的对话框默认
 * 只有 2500（`tdesign-vue-next/es/dialog/style/index.css`），而 Popup 是 5500、
 * Message 是 6000。因此在「先打开 Popup 系浮层（下拉选择、气泡卡片等），再弹出确认框」
 * 的场景下，确认框会被业务浮层盖住导致按钮点不到（与客户端「放弃当前填写」被底部弹层
 * 遮盖是同一类问题）。
 *
 * 取值 5600 = 高于 Popup(5500)，低于 Message(6000)：确认框压在业务浮层之上，
 * 同时不遮挡消息提示。
 */
export const CONFIRM_DIALOG_Z_INDEX = 5600

type ConfirmOptions = Parameters<typeof DialogPlugin.confirm>[0]
type DialogInstance = ReturnType<typeof DialogPlugin.confirm>

/** 二次确认对话框（统一抬高层级，避免被 Popup 等业务浮层遮盖）。 */
export function confirmDialog(options: ConfirmOptions): DialogInstance {
  return DialogPlugin.confirm({ zIndex: CONFIRM_DIALOG_Z_INDEX, ...options })
}
