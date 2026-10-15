import { describe, expect, it } from 'vitest'
import { applyCustomerTheme, customerThemeCss, HOME_MODULES, orderedHomeModules, type CustomerTheme } from './customerTheme'

const base: CustomerTheme = { packageId: 'package-a', id: 'customer-a', name: '客户 A', version: '1.0.0', schemaVersion: 1 }
describe('customer theme rendering', () => {
  it('preserves public module order by default and appends omitted modules', () => {
    expect(orderedHomeModules(null)).toEqual(HOME_MODULES)
    const ordered = orderedHomeModules({ ...base, layout: { homeModules: ['articles', 'entries'] } })
    expect(ordered.slice(0, 2)).toEqual(['articles', 'entries'])
    expect(new Set(ordered).size).toBe(HOME_MODULES.length)
  })
  it('switches themes without leaving previous CSS variables behind', () => {
    applyCustomerTheme({ ...base, tokens: { light: { primary: '#0052d9' } } })
    expect(document.getElementById('customer-theme')?.textContent).toContain('--td-brand-color:#0052d9')
    applyCustomerTheme({ ...base, tokens: { light: { background: '#fafafa' } } })
    expect(document.getElementById('customer-theme')?.textContent).not.toContain('--td-brand-color:')
    applyCustomerTheme(null)
    expect(document.getElementById('customer-theme')).toBeNull()
  })
  it('uses separate dark values and refuses CSS payloads', () => {
    const css = customerThemeCss({ ...base, tokens: { light: { primary: '#0052d9', text: 'red;}body{display:none' }, dark: { primary: '#60a5fa' } } })
    expect(css).toContain(':root:root:root.dark{--td-brand-color-1:')
    expect(css).toContain('--td-brand-color:#60a5fa')
    expect(css).not.toContain('display:none')
    const darkCss = css.split(':root:root:root.dark{')[1]
    expect(darkCss).toContain('--td-brand-color-1:#0e1824')
    expect(darkCss).toContain('--td-button-primary-color:#000000')
  })
})
