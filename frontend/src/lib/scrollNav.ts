export const NAV_SCROLL_THRESHOLD = 40

export function isNavScrolled(scrollY: number): boolean {
  return scrollY > NAV_SCROLL_THRESHOLD
}
