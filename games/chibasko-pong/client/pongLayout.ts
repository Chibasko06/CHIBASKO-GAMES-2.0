// Presentation only: never changes the canvas's logical dimensions or game state.
export function fitPongCourt(root: HTMLElement) {
  const court = root.querySelector<HTMLElement>('[data-pong-court]')
  if (!court) return () => {}
  const local = root.closest<HTMLElement>('[data-pong-local-session]')
  let pending = 0, disposed = false
  function measure() {
    if (disposed || !court) return
    const bounds = root.getBoundingClientRect()
    if (!bounds.width) return // hidden stage / non-layout test environments
    const viewport = window.visualViewport
    const bottom = (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight)
    const top = Math.max(viewport?.offsetTop ?? 0, bounds.top)
    const surrounding = bounds.height - court.getBoundingClientRect().height
    const actionsBelow = local ? Math.max(0, local.getBoundingClientRect().bottom - bounds.bottom) : 0
    const height = Math.max(96, Math.floor(bottom - top - surrounding - actionsBelow - 12))
    const value = height + 'px'
    if (court.style.getPropertyValue('--pong-court-height') !== value) court.style.setProperty('--pong-court-height', value)
  }
  function schedule() {
    if (disposed || pending) return
    pending = window.requestAnimationFrame(() => { pending = 0; measure() })
  }
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule)
  observer?.observe(root)
  if (local) observer?.observe(local)
  window.addEventListener('resize', schedule)
  window.addEventListener('scroll', schedule, { passive: true })
  window.visualViewport?.addEventListener('resize', schedule)
  window.visualViewport?.addEventListener('scroll', schedule)
  measure()
  return () => {
    disposed = true
    observer?.disconnect()
    window.removeEventListener('resize', schedule)
    window.removeEventListener('scroll', schedule)
    window.visualViewport?.removeEventListener('resize', schedule)
    window.visualViewport?.removeEventListener('scroll', schedule)
    if (pending) window.cancelAnimationFrame(pending)
    court.style.removeProperty('--pong-court-height')
  }
}
