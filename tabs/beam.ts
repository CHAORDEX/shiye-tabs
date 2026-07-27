/**
 * 打开标签时的箭头动画。
 *
 * 复用 Rows「Enjoy the demo」的节奏：后坐、两段抖动蓄力，再沿曲线飞向
 * 新建标签的估算位置，并留下粒子尾迹。动画与 React 渲染解耦，链接行即使
 * 在点击后被移除也不会中断。
 */

export interface Point {
  x: number
  y: number
}

export type BeamTarget = Point | Promise<Point | null>

const TARGET_TIMEOUT_MS = 240
const CHARGE_MS = 1020
const FLIGHT_MS = 560
const CLEANUP_MS = 1760
const MAX_TAB_WIDTH = 240
const TOP_LANDING_Y = 8
const OVERLAY_ID = "shiye-beam-overlay"

function themeColor(): string {
  try {
    return (
      getComputedStyle(document.documentElement)
        .getPropertyValue("--text")
        .trim() || "#1a191d"
    )
  } catch {
    return "#1a191d"
  }
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches
  } catch {
    return false
  }
}

function isValidPoint(point: Point): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y)
}

function estimateTarget(origin: Point): Point {
  const width = window.innerWidth || 1100
  const anchorX = width * 0.6
  const x = origin.x + (anchorX - origin.x) * 0.78
  return {
    x: Math.min(width - 32, Math.max(32, x)),
    y: TOP_LANDING_Y
  }
}

export function estimateTabTarget(index: number, tabCount: number): Point {
  const width = window.innerWidth || 1100
  const count = Math.max(1, Math.floor(tabCount))
  const safeIndex = Math.min(Math.max(0, Math.floor(index)), count - 1)
  const isMac = /Mac/i.test(
    (typeof navigator !== "undefined" &&
      (navigator.platform || navigator.userAgent)) ||
      ""
  )
  const leftInset = isMac ? 78 : 4
  const tabWidth = Math.min(MAX_TAB_WIDTH, (width - leftInset) / count)
  const x = leftInset + (safeIndex + 0.5) * tabWidth
  return {
    x: Math.min(width - 16, Math.max(16, x)),
    y: TOP_LANDING_Y
  }
}

function createOverlay(): HTMLDivElement {
  document.getElementById(OVERLAY_ID)?.remove()
  const overlay = document.createElement("div")
  overlay.id = OVERLAY_ID
  overlay.style.cssText =
    "position:fixed;inset:0;pointer-events:none;z-index:2147483646;overflow:visible;"
  document.body.appendChild(overlay)
  return overlay
}

function createArrow(overlay: HTMLElement, origin: Point, color: string) {
  const arrow = document.createElement("span")
  arrow.setAttribute("aria-hidden", "true")
  arrow.innerHTML =
    '<svg width="28" height="13" viewBox="0 0 28 13" fill="none"><path d="M1 6.5h24" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M21 3 25 6.5 21 10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  arrow.style.cssText =
    `position:fixed;left:${origin.x - 14}px;top:${origin.y - 6.5}px;` +
    `display:inline-flex;color:${color};will-change:transform;`
  overlay.appendChild(arrow)
  return arrow
}

function createTrail(overlay: HTMLElement): {
  canvas: HTMLCanvasElement
  context: CanvasRenderingContext2D | null
  dpr: number
} {
  const canvas = document.createElement("canvas")
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = Math.ceil(window.innerWidth * dpr)
  canvas.height = Math.ceil(window.innerHeight * dpr)
  canvas.style.cssText =
    `position:fixed;inset:0;width:${window.innerWidth}px;height:${window.innerHeight}px;pointer-events:none;`
  overlay.prepend(canvas)
  const context = canvas.getContext("2d")
  context?.setTransform(dpr, 0, 0, dpr, 0, 0)
  return { canvas, context, dpr }
}

function charge(arrow: HTMLElement): Animation {
  return arrow.animate(
    [
      { transform: "translate3d(0,0,0) rotate(0deg)", offset: 0 },
      { transform: "translate3d(-5px,0,0) rotate(0deg)", offset: 0.27 },
      { transform: "translate3d(-7px,0,0) rotate(-1.6deg)", offset: 0.35 },
      { transform: "translate3d(-3px,0,0) rotate(1.4deg)", offset: 0.43 },
      { transform: "translate3d(-6px,0,0) rotate(-.9deg)", offset: 0.51 },
      { transform: "translate3d(-5px,0,0) rotate(0deg)", offset: 0.61 },
      { transform: "translate3d(-9px,0,0) rotate(-3deg)", offset: 0.68 },
      { transform: "translate3d(-2px,0,0) rotate(2.6deg)", offset: 0.75 },
      { transform: "translate3d(-8px,0,0) rotate(-2.2deg)", offset: 0.82 },
      { transform: "translate3d(-3px,0,0) rotate(1.8deg)", offset: 0.89 },
      { transform: "translate3d(-7px,0,0) rotate(-1.2deg)", offset: 0.95 },
      { transform: "translate3d(-5px,0,0) rotate(0deg)", offset: 1 }
    ],
    { duration: CHARGE_MS, easing: "ease-in-out", fill: "forwards" }
  )
}

function quadraticPoint(
  start: Point,
  control: Point,
  end: Point,
  progress: number
): Point {
  const rest = 1 - progress
  return {
    x:
      rest * rest * start.x +
      2 * rest * progress * control.x +
      progress * progress * end.x,
    y:
      rest * rest * start.y +
      2 * rest * progress * control.y +
      progress * progress * end.y
  }
}

function quadraticTangent(
  start: Point,
  control: Point,
  end: Point,
  progress: number
): Point {
  return {
    x:
      2 * (1 - progress) * (control.x - start.x) +
      2 * progress * (end.x - control.x),
    y:
      2 * (1 - progress) * (control.y - start.y) +
      2 * progress * (end.y - control.y)
  }
}

function curveControl(start: Point, end: Point): Point {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const distance = Math.max(1, Math.hypot(dx, dy))
  const bend = Math.min(180, Math.max(44, distance * 0.22))
  return {
    x: (start.x + end.x) / 2 + (-dy / distance) * bend,
    y: (start.y + end.y) / 2 + (dx / distance) * bend
  }
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  size: number
}

function fire(
  overlay: HTMLElement,
  arrow: HTMLElement,
  origin: Point,
  target: Point,
  color: string
): void {
  const { context, dpr } = createTrail(overlay)
  const control = curveControl(origin, target)
  const particles: Particle[] = []
  const started = performance.now()
  let previous = started
  let emission = 0

  const draw = (now: number) => {
    if (!overlay.isConnected) return
    const delta = Math.min(0.04, (now - previous) / 1000)
    previous = now
    const raw = Math.min(1, (now - started) / FLIGHT_MS)
    const progress = 1 - Math.pow(1 - raw, 2.4)
    const point = quadraticPoint(origin, control, target, progress)
    const tangent = quadraticTangent(origin, control, target, progress)
    const length = Math.max(1, Math.hypot(tangent.x, tangent.y))
    const directionX = tangent.x / length
    const directionY = tangent.y / length
    const angle = (Math.atan2(tangent.y, tangent.x) * 180) / Math.PI

    arrow.style.transform =
      `translate3d(${point.x - origin.x}px,${point.y - origin.y}px,0) ` +
      `rotate(${angle}deg)`

    if (raw < 0.9) {
      emission += 420 * delta
      while (emission >= 1) {
        emission -= 1
        const count = 2 + Math.floor(Math.random() * 3)
        for (let index = 0; index < count; index += 1) {
          const spread = (Math.random() - 0.5) * 90
          particles.push({
            x: point.x - directionX * Math.random() * 14,
            y: point.y - directionY * Math.random() * 14,
            vx: -directionX * (20 + Math.random() * 160) - directionY * spread,
            vy: -directionY * (20 + Math.random() * 160) + directionX * spread,
            life: 0.55 + Math.random() * 0.7,
            size: 0.45 + Math.random() * 0.85
          })
        }
      }
    }

    particles.forEach((particle) => {
      particle.vy += 1100 * delta
      particle.vx *= 1 - 1.4 * delta
      particle.x += particle.vx * delta
      particle.y += particle.vy * delta
      particle.life -= 1.05 * delta
    })
    for (let index = particles.length - 1; index >= 0; index -= 1) {
      if (particles[index].life <= 0) particles.splice(index, 1)
    }

    if (context) {
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
      context.clearRect(0, 0, window.innerWidth, window.innerHeight)
      context.fillStyle = color
      particles.forEach((particle) => {
        context.globalAlpha = 0.5 * Math.max(0, Math.min(1, particle.life))
        context.fillRect(particle.x, particle.y, particle.size, particle.size)
      })
      context.globalAlpha = 1
    }

    if (raw < 1 || particles.length) requestAnimationFrame(draw)
  }

  requestAnimationFrame(draw)
  window.setTimeout(() => overlay.remove(), CLEANUP_MS)
}

async function resolveTarget(
  origin: Point,
  target?: BeamTarget
): Promise<Point> {
  if (!target) return estimateTarget(origin)
  if (!(target instanceof Promise)) {
    return isValidPoint(target) ? target : estimateTarget(origin)
  }
  const timeout = new Promise<null>((resolve) =>
    window.setTimeout(() => resolve(null), TARGET_TIMEOUT_MS)
  )
  const resolved = await Promise.race([target.catch(() => null), timeout])
  return resolved && isValidPoint(resolved) ? resolved : estimateTarget(origin)
}

export function playTabArrow(origin: Point, target?: BeamTarget): void {
  try {
    if (!isValidPoint(origin) || prefersReducedMotion()) return
    const overlay = createOverlay()
    const color = themeColor()
    const arrow = createArrow(overlay, origin, color)
    const targetPromise = resolveTarget(origin, target)
    const chargeAnimation = charge(arrow)
    window.setTimeout(() => {
      targetPromise
        .then((resolved) => {
          if (!overlay.isConnected) return
          chargeAnimation.cancel()
          fire(overlay, arrow, origin, resolved, color)
        })
        .catch(() => overlay.remove())
    }, CHARGE_MS)
  } catch {
    document.getElementById(OVERLAY_ID)?.remove()
  }
}
