declare module '@wangeditor/editor-for-vue' {
  import type { ComponentOptionsMixin, ComputedOptions, DefineComponent, MethodOptions } from 'vue'
  import type { IDomEditor, IEditorConfig, IToolbarConfig } from '@wangeditor/editor'

  export const Editor: DefineComponent<
    {
      modelValue?: string
      defaultConfig?: Partial<IEditorConfig>
      mode?: 'default' | 'simple'
    },
    Record<string, unknown>,
    unknown,
    ComputedOptions,
    MethodOptions,
    ComponentOptionsMixin,
    ComponentOptionsMixin,
    Record<string, any>
  >

  export const Toolbar: DefineComponent<
    {
      editor?: IDomEditor
      defaultConfig?: Partial<IToolbarConfig>
      mode?: 'default' | 'simple'
    },
    Record<string, unknown>,
    unknown,
    ComputedOptions,
    MethodOptions,
    ComponentOptionsMixin,
    ComponentOptionsMixin,
    Record<string, any>
  >
}
