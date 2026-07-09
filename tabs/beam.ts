/**
 * 光束定位提醒动画
 * ────────────────────────────────────────────────────────────────
 * 用户在收集页点击「打开标签」后，从被点击的链接位置发射一道流光，
 * 飞向页面顶部（浏览器标签栏方向），在落点处闪光，提示「新打开的标签页
 * 来自这里」。
 *
 * 设计约束：
 *  - 自包含的原生 DOM/SVG，挂载到 document.body，与 React 渲染解耦，
 *    因此点击后即便该行卸载（标签被移出收集卡），动画依旧完整播放。
 *  - 永不抛出、永不阻塞打开标签页的行为（全部包裹在 try/catch 中）。
 *  - 尊重 prefers-reduced-motion：仅在起点显示一次短暂高亮脉冲，不飞行。
 *  - 颜色取插件主色 var(--accent)，与设计系统保持一致。
 */

/** 视口坐标系下的一个点 */
export interface Point {
  x: number
  y: number
}

/**
 * 落点输入。可为：
 *  - 一个确定的点；
 *  - 一个 Promise（落点在标签创建后才能确定，先放脉冲、再等结果）；
 *  - 省略（使用基于起点的兜底估算）。
 */
export type BeamTarget = Point | Promise<Point | null>

/* 时序（毫秒）—— 控制在 400~700ms 之间 */
const PULSE_MS = 140 // 起点高亮脉冲
const FLIGHT_MS = 420 // 光束飞行
const FADE_MS = 160 // 整体淡出
const REDUCED_MS = 200 // 减少动态效果下的单次高亮
const TARGET_TIMEOUT_MS = 240 // 等待真实落点的上限，超时则用兜底估算
const MAX_TAB_WIDTH = 240 // Chrome 单个标签的最大宽度（px）
const TOP_LANDING_Y = 8 // 落点距视口顶部的距离（px），留出箭头完整显示的空间
const CURVE_SAMPLES = 18 // 箭头沿曲线飞行的关键帧采样数（越多越贴合曲线）
// 曲线为 cubic 贝塞尔：竖直控制柄让两端竖直（离开 url 朝上、钩入 tab 朝上），
// 横向扫动发生在中段。控制柄长度 = 垂直落差 × 比例，并夹在上下限内。
const CURVE_HANDLE_RATIO = 0.5
const CURVE_HANDLE_MIN = 60
const CURVE_HANDLE_MAX = 300

const OVERLAY_ID = "shiye-beam-overlay"
const SVG_NS = "http://www.w3.org/2000/svg"

/** 读取插件主色；取不到时回退到品牌橙 */
function accentColor(): string {
  try {
    const v = getComputedStyle(document.documentElement)
      .getPropertyValue("--accent")
      .trim()
    return v || "#D97756"
  } catch {
    return "#D97756"
  }
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches
  } catch {
    return false
  }
}

function isValidPoint(p: Point): boolean {
  return Number.isFinite(p.x) && Number.isFinite(p.y)
}

/**
 * 估算落点：页面顶部、略偏中右，模拟「飞向新打开的标签页」。
 * 与起点 x 保持轻微关联，使不同位置发射的光束朝向略有差异，
 * 但整体都汇聚到顶部标签栏区域。
 */
function estimateTarget(origin: Point): Point {
  const w = window.innerWidth || 1100
  const anchorX = w * 0.6 // 顶部锚点：略偏中右
  const x = origin.x + (anchorX - origin.x) * 0.78
  return { x: Math.min(w - 32, Math.max(32, x)), y: TOP_LANDING_Y }
}

/**
 * 根据新标签在标签栏中的序号估算其水平落点（页面顶部）。
 *
 * 标签栏横跨窗口顶部，单个标签宽度 = min(最大宽度, 可用宽度 / 标签数)；
 * 标签较少时左对齐、各自取最大宽度，较多时挤满整条。落点 x 即该标签中心。
 * macOS 下标签栏左侧被红绿灯按钮占据，需额外内缩。
 *
 * 这是近似：页面无法读取原生标签栏的真实几何，但能让不同标签的轨迹有差异、
 * 大致指向其真实位置。
 *
 * @param index    新标签在窗口中的序号（chrome.tabs.create 返回值的 .index）
 * @param tabCount 创建后窗口内的标签总数
 */
export function estimateTabTarget(index: number, tabCount: number): Point {
  const w = window.innerWidth || 1100
  const count = Math.max(1, Math.floor(tabCount))
  const i = Math.min(Math.max(0, Math.floor(index)), count - 1)
  const isMac = /Mac/i.test(
    (typeof navigator !== "undefined" &&
      (navigator.platform || navigator.userAgent)) ||
      ""
  )
  const leftInset = isMac ? 78 : 4 // 标签栏左侧内缩（mac 红绿灯）
  const stripWidth = Math.max(1, w - leftInset)
  const tabWidth = Math.min(MAX_TAB_WIDTH, stripWidth / count)
  const x = leftInset + (i + 0.5) * tabWidth
  return { x: Math.min(w - 16, Math.max(16, x)), y: TOP_LANDING_Y }
}

/** 曲线上的一个采样点，附带该点的切线角（度） */
interface CurveSample {
  x: number
  y: number
  angle: number
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

/** cubic 贝塞尔在参数 t 处的点 */
function cubicAt(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const u = 1 - t
  const a = u * u * u
  const b = 3 * u * u * t
  const c = 3 * u * t * t
  const d = t * t * t
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y
  }
}

/**
 * 在起点与落点之间构造一条 cubic 贝塞尔弧线，返回 SVG 路径串与箭头采样点。
 *
 * 控制柄取竖直方向：P1 在起点正上方、P2 在落点正下方，长度 = 垂直落差 × 比例。
 * 由此：
 *  - 光束离开 url 时朝上、钩入 tab bar 时也朝上（末端切线竖直向上），符合常识；
 *  - 全程 y 落在控制点凸包内，即 [落点, 起点] 区间，绝不越过落点上方 →
 *    彻底避免远距离时「从上往下」扎入的情况；
 *  - 横向扫动集中在中段，距离越远扫得越开（与手绘示意一致）。
 *
 * 光束用 `d`（矢量路径，浏览器抗锯齿，无锯齿）渲染；`samples` 供箭头按关键帧
 * 沿同一条曲线飞行，每点附带相邻点差分得到的切线角用于转向。
 */
function buildCurve(
  origin: Point,
  target: Point,
  segments: number
): { d: string; samples: CurveSample[] } {
  const drop = Math.abs(origin.y - target.y) // 垂直落差
  const handle = Math.min(
    Math.max(drop * CURVE_HANDLE_RATIO, CURVE_HANDLE_MIN),
    CURVE_HANDLE_MAX
  )
  const p0 = origin
  const p1 = { x: origin.x, y: origin.y - handle } // 离开起点：朝上
  const p2 = { x: target.x, y: target.y + handle } // 进入落点：从下方朝上
  const p3 = target

  const d = `M ${p0.x} ${p0.y} C ${p1.x} ${p1.y} ${p2.x} ${p2.y} ${p3.x} ${p3.y}`

  const pts: Point[] = []
  for (let i = 0; i <= segments; i++) {
    pts.push(cubicAt(p0, p1, p2, p3, i / segments))
  }
  const samples = pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)]
    const b = pts[Math.min(segments, i + 1)]
    const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI
    return { x: p.x, y: p.y, angle }
  })

  return { d, samples }
}

/** 取得（或创建）全屏覆盖层；pointer-events:none 不遮挡内容 */
function ensureOverlay(): HTMLDivElement {
  let el = document.getElementById(OVERLAY_ID) as HTMLDivElement | null
  if (!el) {
    el = document.createElement("div")
    el.id = OVERLAY_ID
    el.style.cssText =
      "position:fixed;inset:0;pointer-events:none;z-index:2147483646;overflow:visible;"
    document.body.appendChild(el)
  }
  return el
}

/** 起点高亮脉冲：扩散并淡出的光圈 */
function spawnPulse(
  parent: HTMLElement,
  o: Point,
  color: string,
  ms: number
): Animation {
  const ring = document.createElement("div")
  ring.style.cssText =
    `position:absolute;left:${o.x}px;top:${o.y}px;width:18px;height:18px;` +
    `margin:-9px 0 0 -9px;border-radius:50%;` +
    `background:radial-gradient(circle, ${color} 0%, transparent 70%);` +
    `box-shadow:0 0 12px ${color};will-change:transform,opacity;`
  parent.appendChild(ring)
  return ring.animate(
    [
      { transform: "scale(0.3)", opacity: 0.9 },
      { transform: "scale(2.6)", opacity: 0 }
    ],
    { duration: ms, easing: "cubic-bezier(.25,.46,.45,.94)", fill: "forwards" }
  )
}

/** 命中落点：一次爆闪 + 扩散环（方向性的箭头爆点由 runFlight 中的箭头负责） */
function spawnHit(parent: HTMLElement, t: Point, color: string): void {
  // 爆闪光点
  const flash = document.createElement("div")
  flash.style.cssText =
    `position:absolute;left:${t.x}px;top:${t.y}px;width:14px;height:14px;` +
    `margin:-7px 0 0 -7px;border-radius:50%;background:#fff;` +
    `box-shadow:0 0 16px 4px ${color};will-change:transform,opacity;`
  parent.appendChild(flash)
  flash.animate(
    [
      { transform: "scale(0.4)", opacity: 1 },
      { transform: "scale(1.8)", opacity: 0 }
    ],
    { duration: 260, easing: "ease-out", fill: "forwards" }
  )

  // 扩散环
  const ring = document.createElement("div")
  ring.style.cssText =
    `position:absolute;left:${t.x}px;top:${t.y}px;width:20px;height:20px;` +
    `margin:-10px 0 0 -10px;border-radius:50%;border:2px solid ${color};` +
    `will-change:transform,opacity;`
  parent.appendChild(ring)
  ring.animate(
    [
      { transform: "scale(0.3)", opacity: 0.8 },
      { transform: "scale(2.4)", opacity: 0 }
    ],
    { duration: 320, easing: "ease-out", fill: "forwards" }
  )
}

/**
 * 播放完整光束动画。永不抛出。
 *
 * @param origin 起点（视口坐标，通常为被点击链接的中心）
 */
export function playTabBeam(origin: Point, target?: BeamTarget): void {
  try {
    if (!isValidPoint(origin)) return

    const color = accentColor()
    const overlay = ensureOverlay()

    // 减少动态效果：仅起点高亮，不飞行
    if (prefersReducedMotion()) {
      const a = spawnPulse(overlay, origin, color, REDUCED_MS)
      a.finished.then(() => cleanup(overlay)).catch(() => cleanup(overlay))
      return
    }

    // 立即在起点放脉冲；落点可能要等标签创建后才能确定，故异步解析后再飞行
    spawnPulse(overlay, origin, color, PULSE_MS)
    resolveTarget(origin, target)
      .then((t) => {
        try {
          runFlight(overlay, origin, t, color)
        } catch {
          cleanup(overlay)
        }
      })
      .catch(() => cleanup(overlay))
  } catch {
    // 动画失败绝不影响打开标签页
    cleanup(document.getElementById(OVERLAY_ID))
  }
}

/** 解析落点：确定点直接用；Promise 在超时内等待，超时或失败则用兜底估算 */
async function resolveTarget(
  origin: Point,
  target?: BeamTarget
): Promise<Point> {
  if (!target) return estimateTarget(origin)
  if (!(target instanceof Promise)) {
    return isValidPoint(target) ? target : estimateTarget(origin)
  }
  const timeout = new Promise<null>((res) =>
    window.setTimeout(() => res(null), TARGET_TIMEOUT_MS)
  )
  const resolved = await Promise.race([target.catch(() => null), timeout])
  return resolved && isValidPoint(resolved) ? resolved : estimateTarget(origin)
}

/**
 * 沿弧线从起点向落点发射光束并播放命中、淡出、清理。
 *
 *  - 光束：单条 SVG 矢量曲线（浏览器抗锯齿，无锯齿），仅用 opacity 淡入淡出
 *    （GPU 合成，不触发逐帧重绘）；
 *  - 箭头：沿同一条曲线用 translate3d + 切线 rotate 关键帧前进、顺弧线转向。
 *
 * 即「平滑连线 + 流动光点」模式：既无锯齿，又不卡顿。
 */
function runFlight(
  overlay: HTMLElement,
  origin: Point,
  target: Point,
  color: string
): void {
  const { d, samples } = buildCurve(origin, target, CURVE_SAMPLES)
  const last = samples[CURVE_SAMPLES]

  // 弧形光束：单条矢量路径，尾淡头亮的描边渐变；只做淡入淡出
  const svg = document.createElementNS(SVG_NS, "svg")
  svg.setAttribute("width", "100%")
  svg.setAttribute("height", "100%")
  svg.setAttribute("viewBox", `0 0 ${window.innerWidth} ${window.innerHeight}`)
  svg.style.cssText =
    "position:absolute;inset:0;overflow:visible;will-change:opacity;"

  const gradId = `shiye-beam-grad-${Date.now()}`
  const grad = document.createElementNS(SVG_NS, "linearGradient")
  grad.id = gradId
  grad.setAttribute("gradientUnits", "userSpaceOnUse")
  grad.setAttribute("x1", String(origin.x))
  grad.setAttribute("y1", String(origin.y))
  grad.setAttribute("x2", String(target.x))
  grad.setAttribute("y2", String(target.y))
  for (const [offset, op] of [
    ["0%", "0.12"],
    ["55%", "0.5"],
    ["100%", "1"]
  ] as const) {
    const s = document.createElementNS(SVG_NS, "stop")
    s.setAttribute("offset", offset)
    s.setAttribute("stop-color", color)
    s.setAttribute("stop-opacity", op)
    grad.appendChild(s)
  }
  const defs = document.createElementNS(SVG_NS, "defs")
  defs.appendChild(grad)
  svg.appendChild(defs)

  const beam = document.createElementNS(SVG_NS, "path")
  beam.setAttribute("d", d)
  beam.setAttribute("fill", "none")
  beam.setAttribute("stroke", `url(#${gradId})`)
  beam.setAttribute("stroke-width", "3")
  beam.setAttribute("stroke-linecap", "round")
  svg.appendChild(beam)
  overlay.appendChild(svg)

  // 光束随箭头起飞而点亮、落地后淡出（纯 opacity，合成层）
  svg.animate([{ opacity: 0 }, { opacity: 1 }], {
    duration: FLIGHT_MS * 0.32,
    easing: "ease-out",
    fill: "forwards"
  })

  // 箭头头部：白核 + 主色辉光，沿曲线飞行并随切线转向
  const head = document.createElement("div")
  head.style.cssText =
    `position:fixed;left:${origin.x}px;top:${origin.y}px;` +
    `width:17px;height:14px;margin:-7px 0 0 -8.5px;background:#fff;` +
    `clip-path:polygon(0% 0%, 100% 50%, 0% 100%, 30% 50%);` +
    `filter:drop-shadow(0 0 5px ${color});will-change:transform,opacity;`
  overlay.appendChild(head)

  // 关键帧：位置取曲线采样点（translate3d），时间按 ease-out 分布；纯合成属性，丝滑
  const headKeys = samples.map((s, i) => {
    const scale = i === 0 ? 0.6 : 1
    return {
      transform: `translate3d(${s.x - origin.x}px,${s.y - origin.y}px,0) rotate(${s.angle}deg) scale(${scale})`,
      opacity: i === 0 ? 0.3 : 1,
      offset: easeOutCubic(i / CURVE_SAMPLES)
    }
  })
  const headAnim = head.animate(headKeys, {
    duration: FLIGHT_MS,
    fill: "forwards"
  })

  const landed = `translate3d(${last.x - origin.x}px,${last.y - origin.y}px,0) rotate(${last.angle}deg)`
  headAnim.finished
    .then(() => {
      spawnHit(overlay, target, color)
      // 光束整体淡出
      svg.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: FADE_MS,
        easing: "ease-out",
        fill: "forwards"
      })
      // 箭头命中爆点：放大并淡出，作为方向性的落点提示
      const pop = head.animate(
        [
          { transform: `${landed} scale(1)`, opacity: 1 },
          { transform: `${landed} scale(1.7)`, opacity: 0 }
        ],
        { duration: FADE_MS, easing: "ease-out", fill: "forwards" }
      )
      return pop.finished
    })
    .then(() => cleanup(overlay))
    .catch(() => cleanup(overlay))

  // 兜底清理：无论动画事件是否触发，超时后强制移除
  window.setTimeout(
    () => cleanup(overlay),
    PULSE_MS + FLIGHT_MS + FADE_MS + 400
  )
}

/** 移除覆盖层（容错） */
function cleanup(overlay: Element | null): void {
  try {
    overlay?.remove()
  } catch {
    /* noop */
  }
}
