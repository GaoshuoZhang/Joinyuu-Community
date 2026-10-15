import { describe, expect, it } from 'vitest'
import { applyCustomerTheme, brandHeadline, customerThemeCss, HOME_MODULES, orderedHomeModules, type CustomerTheme } from './customerTheme'

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
  it('preserves control/card hierarchy and optional accent and soft surfaces', () => {
    const css = customerThemeCss({ ...base, tokens: { radius: 'large', light: { primary: '#0d1b3d', accent: '#dc590d', primaryLight: '#edf4f8', heroStart: '#f4f8fb', heroEnd: '#fff8e8' } } })
    expect(css).toContain('--td-radius-default:12px')
    expect(css).toContain('--td-radius-large:16px')
    expect(css).toContain('--app-theme-accent:#dc590d')
    expect(css).toContain('--td-brand-color-light:#edf4f8')
    expect(css).toContain('--app-theme-hero-start:#f4f8fb')
  })
  it('separates button and service colors from the global brand and clears them on theme switch', () => {
    applyCustomerTheme({ ...base, tokens: { light: { primary: '#101d3e', buttonBackground: '#e2630d', buttonText: '#101d3e', entryCards: { mall: { background: '#fff7dc', icon: '#795600' } } }, dark: { entryCards: { mall: { background: '#3c3423' } } } } })
    const css = document.getElementById('customer-theme')!.textContent!
    expect(css).toContain('--td-brand-color:#101d3e;')
    expect(css).toContain('--td-button-primary-bg-color:#e2630d;')
    expect(css).toContain('--td-button-primary-color:#101d3e;')
    expect(css).toContain('--app-entry-mall-background:#fff7dc;')
    expect(css.split(':root:root:root.dark{')[1]).toContain('--app-entry-mall-background:#3c3423;')
    expect(customerThemeCss({ ...base, tokens: { light: { entryCards: { mall: { icon: 'red;}body{display:none' } } } } })).not.toContain('display:none')
    applyCustomerTheme(base)
    expect(document.getElementById('customer-theme')!.textContent).not.toContain('--app-entry-')
    applyCustomerTheme(null)
  })
  it('splits a single literal highlight and falls back for older themes', () => {
    expect(brandHeadline({ name: '旧主题' })).toEqual({ before: '旧主题', highlight: '', after: '' })
    expect(brandHeadline({ headline: 'AI创业者的伟大航路\n从OPiece启航', highlight: '伟大航路' })).toEqual({ before: 'AI创业者的', highlight: '伟大航路', after: '\n从OPiece启航' })
    expect(brandHeadline({ headline: 'Hello', highlight: 'missing' }).before).toBe('Hello')
  })
})
