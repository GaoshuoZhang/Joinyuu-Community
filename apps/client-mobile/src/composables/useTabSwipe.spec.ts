import { describe, expect, it, vi } from 'vitest'
import { useTabSwipe } from './useTabSwipe'

function touchEvent(target: Element, x: number, y = 0) {
  return {
    target,
    touches: [{ identifier: 1, clientX: x, clientY: y }],
    cancelable: true,
    preventDefault: vi.fn(),
  } as unknown as TouchEvent
}

describe('useTabSwipe', () => {
  it('leaves horizontal gestures inside service category filters to the scroller', () => {
    const content = document.createElement('div')
    content.className = 't-tabs__content'
    const categories = document.createElement('div')
    categories.className = 'service-categories'
    const chip = document.createElement('span')
    categories.append(chip)
    content.append(categories)

    let active = 'service'
    const setActive = vi.fn((value: string) => { active = value })
    const swipe = useTabSwipe(() => ['service', 'talent'], () => active, setActive)
    swipe.startSwipe(touchEvent(chip, 100))
    swipe.moveSwipe(touchEvent(chip, 40))

    expect(setActive).not.toHaveBeenCalled()
  })

  it('still changes tabs for horizontal gestures in tab content', () => {
    const content = document.createElement('div')
    content.className = 't-tabs__content'
    const item = document.createElement('div')
    content.append(item)

    let active = 'service'
    const setActive = vi.fn((value: string) => { active = value })
    const swipe = useTabSwipe(() => ['service', 'talent'], () => active, setActive)
    swipe.startSwipe(touchEvent(item, 100))
    swipe.moveSwipe(touchEvent(item, 40))

    expect(setActive).toHaveBeenCalledWith('talent')
  })
})
