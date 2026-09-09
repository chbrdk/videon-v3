/** Pure inertia step for horizontal timeline pan. */

export function nextInertiaVelocity(velocity: number, friction = 0.92, stopBelow = 0.2): number {
  if (Math.abs(velocity) < stopBelow) return 0
  return velocity * friction
}

export function applyInertiaScrollLeft(scrollLeft: number, velocity: number): number {
  return Math.max(0, scrollLeft + velocity)
}
