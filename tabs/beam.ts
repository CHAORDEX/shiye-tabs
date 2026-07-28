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
const CHARGE_MS = 520
const FLIGHT_MS = 420
const CLEANUP_MS = 1760
const MAX_TAB_WIDTH = 240
const TOP_LANDING_Y = 8
const OVERLAY_ID = "shiye-beam-overlay"
const CURSOR_ID = "shiye-smooth-cursor"
const CURSOR_STYLE_ID = "shiye-smooth-cursor-style"

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

export function initSmoothCursor(): () => void {
  if (
    window.matchMedia("(pointer: coarse)").matches ||
    document.getElementById(CURSOR_ID)
  )
    return () => {}

  const style = document.createElement("style")
  style.id = CURSOR_STYLE_ID
  style.textContent = `
    html.shiye-has-smooth-cursor,
    html.shiye-has-smooth-cursor * { cursor: none !important; }
    #${CURSOR_ID} {
      position: fixed; z-index: 2147483647; top: 0; left: 0;
      opacity: 0; pointer-events: none; transform-origin: 12.5px 2.5px;
      transition: opacity .25s; will-change: transform;
    }
    #${CURSOR_ID} svg {
      position: absolute; top: 0; left: 0; display: block;
      transform-origin: 12.5px 2.5px;
      transition: opacity .16s, transform .22s cubic-bezier(.22,1,.36,1);
    }
    #${CURSOR_ID} .cursor-hand {
      opacity: 0; transform: scale(.72) rotate(-12deg);
    }
    #${CURSOR_ID}.is-hand .cursor-arrow {
      opacity: 0; transform: scale(.72) rotate(12deg);
    }
    #${CURSOR_ID}.is-hand .cursor-hand {
      opacity: 1; transform: scale(1);
    }
  `

  const cursor = document.createElement("div")
  cursor.id = CURSOR_ID
  cursor.setAttribute("aria-hidden", "true")
  cursor.innerHTML = `
    <svg class="cursor-arrow" width="25" height="27" viewBox="0 0 50 54" fill="none">
      <path d="M42.6817 41.1495 27.5103 6.79925c-.7834-1.77368-3.3021-1.77367-4.1176 0L7.59814 41.1495c-.83981 1.8264.92898 3.7407 2.81436 3.0459l13.9632-5.1458a2.27 2.27 0 0 1 1.5665 0l13.8699 5.1458c1.8728.6948 3.6763-1.2195 2.8696-3.0459Z" fill="var(--bg)" stroke="var(--text)" stroke-width="4.5" stroke-linejoin="round" stroke-linecap="round"/>
    </svg>
    <svg class="cursor-hand" width="27" height="27" viewBox="0 0 54 54" fill="none">
      <path d="M20.5 31V10.5C20.5 6.5 23 4 26 4s5.5 2.5 5.5 6.5V22v-7c0-3.5 2.5-5.5 5.5-5.5s5 2.5 5 6V24v-6c0-3.5 2.5-5.5 5.5-5.5s4 2.5 4 6V33c0 12-8.5 19-19.5 19h-4c-6.5 0-11-3.5-15-8l-8.5-9.5C1.5 31 2 27.5 4.5 25s6-.5 8.5 2l7.5 8Z" fill="var(--bg)" stroke="var(--text)" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `

  let cursorFrame = 0
  let targetX = window.innerWidth / 2
  let targetY = window.innerHeight / 2
  let x = targetX
  let y = targetY
  let velocityX = 0
  let velocityY = 0
  let rotation = 0
  let rotationVelocity = 0
  let targetRotation = 0
  let verticalScale = 1
  let started = false
  let previousTime = performance.now()
  const reducedMotion = prefersReducedMotion()

  const onPointerMove = (event: PointerEvent) => {
    targetX = event.clientX
    targetY = event.clientY
    if (!started) {
      started = true
      x = targetX
      y = targetY
      cursor.style.opacity = "1"
    }
  }

  const updateHand = (target: EventTarget | null) => {
    const element = target instanceof Element ? target : null
    cursor.classList.toggle(
      "is-hand",
      Boolean(element?.closest("a, button, [data-clickable], [role='button']"))
    )
  }
  const onPointerOver = (event: PointerEvent) => updateHand(event.target)
  const onPointerOut = (event: PointerEvent) =>
    updateHand(event.relatedTarget)

  const onPointerLeave = () => {
    cursor.style.opacity = "0"
  }
  const onPointerEnter = () => {
    if (started) cursor.style.opacity = "1"
  }

  const shortestAngleDelta = (from: number, to: number) => {
    let delta = (to - from) % 360
    if (delta > 180) delta -= 360
    if (delta < -180) delta += 360
    return delta
  }

  const animateCursor = (time: number) => {
    const delta = Math.min((time - previousTime) / 1000, 1 / 30)
    previousTime = time
    if (reducedMotion) {
      x = targetX
      y = targetY
    } else {
      const steps = Math.max(1, Math.ceil(delta / (1 / 360)))
      const step = delta / steps
      if (Math.hypot(velocityX, velocityY) > 35) {
        const angle = (Math.atan2(velocityY, velocityX) * 180) / Math.PI + 90
        targetRotation = rotation + shortestAngleDelta(rotation, angle)
      }
      for (let index = 0; index < steps; index += 1) {
        const accelerationX = 2800 * (targetX - x) - 106 * velocityX
        const accelerationY = 2800 * (targetY - y) - 106 * velocityY
        velocityX += accelerationX * step
        velocityY += accelerationY * step
        x += velocityX * step
        y += velocityY * step
        const rotationAcceleration =
          1800 * (targetRotation - rotation) - 85 * rotationVelocity
        rotationVelocity += rotationAcceleration * step
        rotation += rotationVelocity * step
      }
    }
    const deformation = reducedMotion
      ? 0
      : Math.min(Math.hypot(velocityX, velocityY) / 4200, 0.32)
    verticalScale +=
      (1 + deformation - verticalScale) * (1 - Math.exp(-14 * delta))
    const cursorSize = 0.77
    cursor.style.transform =
      `translate3d(${x - 12.5}px,${y - 2.5}px,0) ` +
      `rotate(${rotation}deg) ` +
      `scale(${cursorSize * (1 - 0.42 * deformation)},${cursorSize * verticalScale})`
    cursorFrame = requestAnimationFrame(animateCursor)
  }

  document.head.appendChild(style)
  document.body.appendChild(cursor)
  document.documentElement.classList.add("shiye-has-smooth-cursor")
  window.addEventListener("pointermove", onPointerMove)
  document.addEventListener("pointerover", onPointerOver)
  document.addEventListener("pointerout", onPointerOut)
  document.addEventListener("mouseleave", onPointerLeave)
  document.addEventListener("mouseenter", onPointerEnter)
  cursorFrame = requestAnimationFrame(animateCursor)

  return () => {
    cancelAnimationFrame(cursorFrame)
    window.removeEventListener("pointermove", onPointerMove)
    document.removeEventListener("pointerover", onPointerOver)
    document.removeEventListener("pointerout", onPointerOut)
    document.removeEventListener("mouseleave", onPointerLeave)
    document.removeEventListener("mouseenter", onPointerEnter)
    document.documentElement.classList.remove("shiye-has-smooth-cursor")
    cursor.remove()
    style.remove()
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
    '<svg width="26" height="16" viewBox="0 0 24 18"><path d="M3 6.6h10V3.75c0-1.34 1.57-2.06 2.58-1.18l6.24 5.42c.62.54.62 1.48 0 2.02l-6.24 5.42c-1.01.88-2.58.16-2.58-1.18V11.4H3a2.4 2.4 0 1 1 0-4.8Z" fill="currentColor"/></svg>'
  arrow.style.cssText =
    `position:fixed;left:${origin.x - 13}px;top:${origin.y - 8}px;` +
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
    const tangentAngle = (Math.atan2(tangent.y, tangent.x) * 180) / Math.PI
    const turnProgress = Math.min(1, Math.max(0, (raw - 0.68) / 0.32))
    const smoothTurn = turnProgress * turnProgress * (3 - 2 * turnProgress)
    const angleDelta = ((-90 - tangentAngle + 540) % 360) - 180
    const angle = tangentAngle + angleDelta * smoothTurn
    const fadeProgress = Math.min(1, Math.max(0, (raw - 0.55) / 0.45))
    const smoothFade = fadeProgress * fadeProgress * (3 - 2 * fadeProgress)

    arrow.style.transform =
      `translate3d(${point.x - origin.x}px,${point.y - origin.y}px,0) ` +
      `rotate(${angle}deg)`
    arrow.style.opacity = String(1 - smoothFade)

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
