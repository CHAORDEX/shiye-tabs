import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

import {
  GrainGradient,
  MeshGradient,
  SimplexNoise,
  Warp,
  LiquidMetal,
  Water
} from "@paper-design/shaders-react"

import "remixicon/fonts/remixicon.css"
import "../contents/link-hints"
import "../style.css"

import { AvantShaderCanvas, type AvantShaderId } from "./avant-shaders"
import {
  estimateTabTarget,
  initSmoothCursor,
  playTabArrow,
  type Point
} from "./beam"
import { WEB_FONTS } from "./fonts"
import { playScrollGear, playSound } from "./sounds"

/* ── Types ──────────────────────────────────────────────────── */
type Theme = "light" | "dark" | "auto"
type DomainSortOrder = "asc" | "desc"
type CardStyle =
  | "classic"
  | "paper"
  | "editorial"
  | "blueprint"
  | "terminal"
  | "glass"
  | "noir"
  | "botanical"

const LEGACY_CARD_STYLE_MAP: Record<string, CardStyle> = {
  ocean: "blueprint",
  forest: "terminal",
  slate: "editorial",
  aurora: "botanical",
  lavender: "glass",
  sunset: "paper",
  rose: "paper",
  amber: "noir"
}

function normalizeCardStyle(value?: string): CardStyle {
  if (!value) return "classic"
  if (
    value === "classic" ||
    value === "paper" ||
    value === "editorial" ||
    value === "blueprint" ||
    value === "terminal" ||
    value === "glass" ||
    value === "noir" ||
    value === "botanical"
  ) {
    return value
  }
  return LEGACY_CARD_STYLE_MAP[value] ?? "classic"
}
type CardShader =
  | AvantShaderId
  | "mesh"
  | "grain"
  | "warp"
  | "simplex"
  | "water"
  | "liquidMetal"

function isAvantShader(shader: CardShader): shader is AvantShaderId {
  return (
    shader === "inkWash" ||
    shader === "causticPrism" ||
    shader === "topoContour" ||
    shader === "ferrofluid"
  )
}

const LEGACY_CARD_SHADER_MAP: Record<string, CardShader> = {
  godRays: "mesh",
  dithering: "simplex",
  spiral: "warp",
  neuro: "warp",
  waves: "water",
  smoke: "simplex",
  metaballs: "mesh",
  voronoi: "simplex",
  swirl: "warp",
  dotOrbit: "liquidMetal"
}

interface DraggedTab {
  colId: string
  index: number
}

interface TabInfo {
  title: string
  url: string
  locked?: boolean
  maskedTitle?: string
}

interface Collection {
  id: string
  timestamp: number
  tabs: TabInfo[]
  windowLabel?: string
  cardStyle?: CardStyle
  backgroundImage?: string
  cardShader?: CardShader
  locked?: boolean
  lockedAt?: number
}

interface SyncedTab {
  title: string
  url: string
}

interface SyncedDevice {
  deviceName: string
  windows: { tabs: SyncedTab[] }[]
}

function sortCollections(collections: Collection[]): Collection[] {
  return [...collections].sort((a, b) => {
    const aLocked = Boolean(a.locked)
    const bLocked = Boolean(b.locked)

    if (aLocked && !bLocked) return -1
    if (!aLocked && bLocked) return 1

    if (aLocked && bLocked) {
      const aTime = a.lockedAt ?? a.timestamp
      const bTime = b.lockedAt ?? b.timestamp
      return bTime - aTime
    }

    return b.timestamp - a.timestamp
  })
}

interface CardAppearanceUpdate {
  cardStyle?: CardStyle
  backgroundImage?: string
  cardShader?: CardShader | null
}

interface SelectableFont {
  id: string
  name: string
  family: string
  /** 远程 CSS 索引地址（中文网字计划 CDN），系统字体为空 */
  cssUrls?: string[]
}

/* ── Fonts ───────────────────────────────────────────────────── */
const SYSTEM_FAMILY =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Noto Sans SC', sans-serif"

const SYSTEM_FONT: SelectableFont = {
  id: "system",
  name: "系统默认",
  family: SYSTEM_FAMILY
}

// 系统默认 + 中文网字计划 80 款免费 web 字体
const ALL_FONTS: SelectableFont[] = [
  SYSTEM_FONT,
  ...WEB_FONTS.map((f) => ({
    id: f.id,
    name: f.name,
    family: f.family,
    cssUrls: f.cssUrls
  }))
]

const FONT_KEY = "shiye-font-id"
const THEME_KEY = "shiye-theme"
const FONT_SCALE_KEY = "shiye-font-scale"
const FONT_WEIGHT_KEY = "shiye-font-weight"
const CARD_RADIUS_KEY = "shiye-card-radius"
const BEAM_KEY = "shiye-beam-enabled"
const CURSOR_KEY = "shiye-cursor-enabled"
const SOUND_KEY = "shiye-sound-enabled"
const COLLECT_MODE_KEY = "shiye-collect-mode"
const WINDOW_COLUMNS_KEY = "shiye-window-columns"
const COLLECTION_COLUMNS_KEY = "shiye-collection-columns"
const COLLECTION_SPANS_KEY = "shiye-collection-spans"
const SHOW_SYNCED_TABS_KEY = "shiye-show-synced-tabs"
const TAB_DRAG_MIME = "application/x-shiye-tab"
type CollectMode = "all" | "current"

const CARD_STYLES: Array<{
  id: CardStyle
  name: string
  description: string
}> = [
  { id: "classic", name: "素瓷", description: "极简白瓷 · 跟随明暗" },
  { id: "paper", name: "宣纸", description: "暖米纸纹 · 朱砂书签" },
  { id: "editorial", name: "刊物", description: "瑞士墨框 · 印刷硬影" },
  { id: "blueprint", name: "蓝图", description: "普鲁士蓝 · 工程方格" },
  { id: "terminal", name: "终端", description: "哑光炭黑 · 极客翡翠" },
  { id: "glass", name: "冰雾", description: "通透磨砂 · 折射白边" },
  { id: "noir", name: "曜石", description: "纯黑拉丝 · 香槟金线" },
  { id: "botanical", name: "苔原", description: "鼠尾草绿 · 亚麻护眼" }
]

const CARD_SHADERS: Array<{
  id: CardShader
  name: string
  description: string
  tone: "light" | "dark"
  experimental?: boolean
}> = [
  {
    id: "inkWash",
    name: "泼墨宣纸",
    description: "水墨洇染 · 指针笔锋涟漪",
    tone: "light",
    experimental: true
  },
  {
    id: "causticPrism",
    name: "棱镜色散",
    description: "长虹玻璃 · 指针折射光谱",
    tone: "light",
    experimental: true
  },
  {
    id: "topoContour",
    name: "等高地形",
    description: "动态等高线 · 磁力隆起",
    tone: "dark",
    experimental: true
  },
  {
    id: "ferrofluid",
    name: "黑磁流体",
    description: "暗银波峰 · 指针磁铁吸引",
    tone: "dark",
    experimental: true
  },
  { id: "mesh", name: "暮色织网", description: "暖陶与深靛 · 全幅慢涌", tone: "dark" },
  { id: "grain", name: "晨雾宣纸", description: "浅色流光 · 暖米胶片晕", tone: "light" },
  { id: "warp", name: "绛紫丝绸", description: "暗绒幕布 · 丝滑曲面光", tone: "dark" },
  { id: "simplex", name: "深海潮汐", description: "北欧蓝绿 · 静谧低频流", tone: "dark" },
  { id: "water", name: "澄澈水波", description: "深青水纹 · 柔和焦散光", tone: "dark" },
  { id: "liquidMetal", name: "液态银灰", description: "冷感金属 · 极简柔光面", tone: "dark" }
]

function getShaderTone(shader: CardShader): "light" | "dark" {
  return CARD_SHADERS.find((s) => s.id === shader)?.tone ?? "dark"
}

/** 打开标签时的光束动画默认开启 */
const BEAM_DEFAULT = true
const CURSOR_DEFAULT = true
const SOUND_DEFAULT = true

/* 内容字号缩放系数范围 */
const SCALE_MIN = 0.8
const SCALE_MAX = 1.6
const SCALE_STEP = 0.1
const SCALE_DEFAULT = 1
const WEIGHT_OPTIONS = [400, 500, 700] as const
type FontWeightValue = (typeof WEIGHT_OPTIONS)[number]
const WEIGHT_DEFAULT: FontWeightValue = 500
const WINDOW_COLUMNS_MIN = 2
const WINDOW_COLUMNS_MAX = 4
const WINDOW_COLUMNS_DEFAULT = 2
const COLLECTION_COLUMNS_DEFAULT = 1
const SPLIT_THRESHOLD = 15

/* 窗口边缘圆角范围：0px（直角）至 28px（圆角） */
const RADIUS_MIN = 0
const RADIUS_MAX = 28
const RADIUS_STEP = 2
const RADIUS_DEFAULT = 14

/** 可缩放的内容字号：基准 px × 用户缩放系数 */
const fs = (px: number) => `calc(${px}px * var(--fs))`

function clampScale(v: number): number {
  if (!Number.isFinite(v)) return SCALE_DEFAULT
  return Math.min(SCALE_MAX, Math.max(SCALE_MIN, Math.round(v * 10) / 10))
}

function clampFontWeight(v: unknown): FontWeightValue {
  return WEIGHT_OPTIONS.includes(v as FontWeightValue)
    ? (v as FontWeightValue)
    : WEIGHT_DEFAULT
}

function clampCardRadius(v: number): number {
  if (!Number.isFinite(v)) return RADIUS_DEFAULT
  return Math.min(RADIUS_MAX, Math.max(RADIUS_MIN, Math.round(v)))
}

function clampWindowColumns(v: number): number {
  if (!Number.isFinite(v)) return WINDOW_COLUMNS_DEFAULT
  return Math.min(
    WINDOW_COLUMNS_MAX,
    Math.max(WINDOW_COLUMNS_MIN, Math.round(v))
  )
}

function clampCollectionColumns(v: number): number {
  return v === 2 ? 2 : COLLECTION_COLUMNS_DEFAULT
}

function normalizeBackgroundUrl(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return ""
  try {
    const url = new URL(trimmed)
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : null
  } catch {
    return null
  }
}

function backgroundImageValue(url: string): string {
  const escaped = url.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
  return `linear-gradient(rgba(12, 14, 18, .28), rgba(12, 14, 18, .42)), url("${escaped}")`
}

function normalizeCardShader(value: unknown): CardShader | null {
  if (typeof value !== "string" || !value) return null
  if (CARD_SHADERS.some((shader) => shader.id === value)) {
    return value as CardShader
  }
  return LEGACY_CARD_SHADER_MAP[value] ?? null
}

async function compressBackgroundImage(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("请选择图片文件")
  if (file.size > 20 * 1024 * 1024) throw new Error("原图不能超过 20 MB")

  const bitmap = await createImageBitmap(file)
  const maxEdge = 1440
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const context = canvas.getContext("2d")
  if (!context) {
    bitmap.close()
    throw new Error("图片处理失败")
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  const dataUrl = canvas.toDataURL("image/webp", 0.8)
  if (dataUrl.length > 2.5 * 1024 * 1024)
    throw new Error("压缩后图片仍然过大，请换一张图片")
  return dataUrl
}

/** WebGL 可用性检测（只执行一次，缓存结果） */
let _webglSupported: boolean | null = null
function isWebGLSupported(): boolean {
  if (_webglSupported !== null) return _webglSupported
  try {
    const c = document.createElement("canvas")
    _webglSupported = !!(
      c.getContext("webgl2") || c.getContext("webgl")
    )
  } catch {
    _webglSupported = false
  }
  return _webglSupported
}

function CardShaderBackground({ shader }: { shader: CardShader }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [reduceMotion, setReduceMotion] = useState(() =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  )
  const webgl = isWebGLSupported()

  useEffect(() => {
    const element = containerRef.current
    if (!element) return
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { rootMargin: "320px 0px" }
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)")
    const onChange = () => setReduceMotion(media.matches)
    media.addEventListener("change", onChange)
    return () => media.removeEventListener("change", onChange)
  }, [])

  // WebGL 不可用时只显示 CSS 渐变背景
  if (!webgl) {
    return (
      <div className="kt-paper-shader" data-shader={shader} />
    )
  }

  const shaderBg: Record<CardShader, string> = {
    inkWash: "#f5f1e8",
    causticPrism: "#f3f5f8",
    topoContour: "#101113",
    ferrofluid: "#0e0f12",
    mesh: "#0e1522",
    grain: "#f4efe6",
    warp: "#170e1c",
    simplex: "#0b1a24",
    water: "#081722",
    liquidMetal: "#111318"
  }

  const common = {
    className: "kt-paper-shader-canvas",
    style: { background: shaderBg[shader] },
    width: "100%",
    height: "100%",
    fit: "cover" as const,
    minPixelRatio: 1,
    maxPixelCount: 480000,
    webGlContextAttributes: {
      alpha: false,
      antialias: false,
      preserveDrawingBuffer: true,
      powerPreference: "low-power" as WebGLPowerPreference
    }
  }
  const speed = reduceMotion ? 0 : 0.14

  return (
    <div
      ref={containerRef}
      className="kt-paper-shader"
      data-shader={shader}
      data-shader-tone={getShaderTone(shader)}>
      {isAvantShader(shader) && (
        <AvantShaderCanvas
          shader={shader}
          visible={visible}
          reduceMotion={reduceMotion}
        />
      )}
      {visible && shader === "mesh" && (
        <MeshGradient
          {...common}
          colors={["#0f1828", "#1d3a52", "#8f4a3a", "#c9855a"]}
          distortion={0.62}
          swirl={0.28}
          grainMixer={0.14}
          grainOverlay={0.08}
          scale={1.25}
          speed={speed * 0.85}
        />
      )}
      {visible && shader === "grain" && (
        <GrainGradient
          {...common}
          colorBack="#f5f0e7"
          colors={["#e8c8b0", "#c9d9c8", "#ded3e6"]}
          softness={0.86}
          intensity={0.34}
          noise={0.2}
          shape="corners"
          scale={1.45}
          speed={speed * 0.75}
        />
      )}
      {visible && shader === "warp" && (
        <Warp
          {...common}
          colors={["#160e1d", "#2c1738", "#51234a", "#7e3758"]}
          rotation={0.25}
          proportion={0.48}
          softness={0.86}
          shape="checks"
          shapeScale={0.8}
          distortion={0.48}
          swirl={0.55}
          swirlIterations={2}
          scale={1.35}
          speed={speed * 0.65}
        />
      )}
      {visible && shader === "simplex" && (
        <SimplexNoise
          {...common}
          colors={["#0b1822", "#122a3a", "#1c4356", "#2f6b7d"]}
          stepsPerColor={4}
          softness={0.88}
          scale={1.2}
          speed={speed * 0.65}
        />
      )}
      {visible && shader === "water" && (
        <Water
          {...common}
          colorBack="#081722"
          colorHighlight="#58b9cc"
          highlights={0.14}
          layering={0.36}
          caustic={0.16}
          waves={0.28}
          size={1.05}
          scale={1.4}
          speed={speed * 0.7}
        />
      )}
      {visible && shader === "liquidMetal" && (
        <LiquidMetal
          {...common}
          colorBack="#111318"
          colorTint="#9db0c4"
          shape="none"
          repetition={1.4}
          distortion={0.1}
          softness={0.42}
          shiftRed={0.12}
          shiftBlue={-0.12}
          contour={0.22}
          angle={115}
          scale={1.65}
          speed={speed * 0.7}
        />
      )}
    </div>
  )
}

/* ── Helpers ─────────────────────────────────────────────────── */
function systemIsDark() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
}

function applyTheme(theme: Theme) {
  const html = document.documentElement
  if (theme === "dark") html.setAttribute("data-theme", "dark")
  else if (theme === "light") html.setAttribute("data-theme", "light")
  else html.removeAttribute("data-theme")
}

function applyFontScale(scale: number) {
  document.documentElement.style.setProperty("--fs", String(clampScale(scale)))
}

function applyFontWeight(weight: FontWeightValue) {
  const base = clampFontWeight(weight)
  const strong = base === 400 ? 600 : base === 500 ? 700 : 800
  document.documentElement.style.setProperty("--fw", String(base))
  document.documentElement.style.setProperty("--fw-strong", String(strong))
}

function applyCardRadius(radius: number) {
  const r = clampCardRadius(radius)
  document.documentElement.style.setProperty("--r", `${r}px`)
  const rs = Math.max(0, Math.min(10, Math.round(r * (8 / 14))))
  document.documentElement.style.setProperty("--r-s", `${rs}px`)
}

// 已加载/加载中的字体 CSS，跨预览与应用去重，避免重复请求
const loadedFontCss = new Set<string>()

/**
 * 加载中文网字计划字体的 CSS 索引并注入页面。
 *
 * 遵守服务商规定：该网关明确要求「通过 link 标签或 css 文件加载」，并校验
 * Sec-Fetch-Dest——fetch 的 `empty` 一律 403（响应体提示「此 URL 不支持直接打开」），
 * 唯有 <link rel="stylesheet"> 的 `style` 被放行。该 header 受浏览器保护、无法伪造，
 * 故直接交由浏览器以样式表资源加载，CSS 内相对 woff2 也由浏览器按最终 URL 自动解析。
 */
function injectFontCss(cssUrl: string): void {
  const href = encodeURI(cssUrl)
  if (loadedFontCss.has(href)) return
  loadedFontCss.add(href)
  const link = document.createElement("link")
  link.rel = "stylesheet"
  link.dataset.font = href
  link.href = href
  link.onerror = () => {
    link.remove()
    loadedFontCss.delete(href) // 失败则允许后续重试
    console.warn("[拾页] 字体加载失败：", cssUrl)
  }
  document.head.appendChild(link)
}

/** Web 字体追加系统字体兜底：未覆盖的字符回退系统字体，避免豆腐块或"看似无变化" */
function fontFamilyValue(font: SelectableFont): string {
  return font.cssUrls ? `${font.family}, ${SYSTEM_FAMILY}` : font.family
}

function applyFont(font: SelectableFont) {
  font.cssUrls?.forEach((u) => injectFontCss(u))
  document.documentElement.style.setProperty("--font", fontFamilyValue(font))
}

function getFavicon(url: string) {
  try {
    return `https://www.google.com/s2/favicons?sz=32&domain=${new URL(url).hostname}`
  } catch {
    return null
  }
}

function getDomain(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase()
  } catch {
    return ""
  }
}

function sortTabsByDomain(tabs: TabInfo[], order: DomainSortOrder) {
  const direction = order === "asc" ? 1 : -1
  return [...tabs].sort((a, b) => {
    const byDomain = getDomain(a.url).localeCompare(getDomain(b.url), "en")
    if (byDomain !== 0) return byDomain * direction
    return (a.title || a.url).localeCompare(b.title || b.url, "zh-CN")
  })
}

function estimateCollectionHeight(collection: Collection, linkColumns = 1) {
  const tabCount = collection.tabs?.length || 0
  return 92 + Math.ceil(tabCount / linkColumns) * 32
}

function distributeCollections(
  collections: Collection[],
  columnCount: number,
  collectionColumns: Record<string, number> | null | undefined
) {
  const safeCols = collectionColumns || {}
  const columns = Array.from({ length: columnCount }, () => [] as Collection[])
  const heights = Array.from({ length: columnCount }, () => 0)

  ;(collections || []).forEach((collection) => {
    const target = heights.indexOf(Math.min(...heights))
    columns[target].push(collection)
    heights[target] += estimateCollectionHeight(
      collection,
      clampCollectionColumns(safeCols[collection.id])
    )
  })

  return columns
}

function splitCollectionIntoTwo(collection: Collection): Collection[] {
  const midpoint = Math.ceil(collection.tabs.length / 2)
  const now = Date.now()

  return [
    {
      ...collection,
      id: `${collection.id}-split-a-${now}`,
      timestamp: collection.timestamp,
      tabs: collection.tabs.slice(0, midpoint),
      windowLabel: undefined
    },
    {
      ...collection,
      id: `${collection.id}-split-b-${now}`,
      timestamp: collection.timestamp + 1,
      tabs: collection.tabs.slice(midpoint),
      windowLabel: undefined
    }
  ]
}

function formatDate(ts: number) {
  const d = new Date(ts)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  if (isToday)
    return (
      "今天 " +
      d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })
    )
  return d.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  })
}

/* ── Small icon button ───────────────────────────────────────── */
function IconBtn({
  children,
  onClick,
  title,
  accent,
  hint
}: {
  children: React.ReactNode
  onClick: (e: React.MouseEvent) => void
  title?: string
  accent?: boolean
  hint?: boolean
}) {
  const [h, setH] = useState(false)
  return (
    <button
      title={title}
      data-shiye-link-hint={hint ? "" : undefined}
      onClick={(e) => {
        e.stopPropagation()
        onClick(e)
      }}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        width: 22,
        height: 22,
        padding: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        border: "none",
        borderRadius: 5,
        cursor: "pointer",
        fontSize: 11,
        fontWeight: 600,
        flexShrink: 0,
        background: h
          ? accent
            ? "var(--accent)"
            : "var(--bg3)"
          : "transparent",
        color: h ? (accent ? "#fff" : "var(--text2)") : "var(--text3)",
        transition: "all var(--dur) var(--ease)",
        fontFamily: "var(--font)"
      }}>
      {children}
    </button>
  )
}

const MASKED_TITLES = [
  "Q3季度技术方案重构与性能评估报告",
  "分布式系统高可用架构设计与实践",
  "2024年度核心业务指标与数据看板",
  "前端工程化规范与构建优化指引",
  "团队工作周报与下阶段里程碑规划",
  "微服务鉴权体系与安全合规规范",
  "产品需求规格说明书 (PRD) 终稿",
  "API 接口设计规范与统一错误码清单",
  "DevOps 自动化部署与监控告警指南",
  "关于数据库索引优化与慢查询调优",
  "代码重构与整洁架构实战分享",
  "现代设计系统与组件库规范文档",
  "跨端跨平台架构方案调研分析",
  "项目复盘总结与风险应对预案",
  "网络安全基线检查与加固指南",
  "深入理解并发编程与异步事件模型",
  "每日精选行业技术动态与资讯简报",
  "敏捷研发流程与项目协同最佳实践",
  "云原生容器化集群运维与调优手册",
  "知识库文档：常见问题排查手册"
]

function getRandomMaskedTitle(currentTitle?: string): string {
  const filtered = MASKED_TITLES.filter((t) => t !== currentTitle)
  const pool = filtered.length > 0 ? filtered : MASKED_TITLES
  return pool[Math.floor(Math.random() * pool.length)]
}

/* ── TabItem — compact grid cell ────────────────────────────── */
function TabItem({
  tab,
  beamEnabled,
  soundEnabled,
  dragging,
  onOpen,
  onDelete,
  onToggleLock,
  onToggleMaskTitle,
  onDragStart,
  onDragEnd,
  onDrop
}: {
  tab: TabInfo
  /** 是否在打开标签时播放光束动画 */
  beamEnabled: boolean
  soundEnabled: boolean
  dragging: boolean
  /** 触发打开；返回真实落点的 Promise（标签创建后才确定），供光束飞向其位置 */
  onOpen: () => Promise<Point | null> | void
  onDelete: () => void
  onToggleLock: () => void
  onToggleMaskTitle: () => void
  onDragStart: (e: React.DragEvent) => void
  onDragEnd: () => void
  onDrop: (e: React.DragEvent) => void
}) {
  const [dragOver, setDragOver] = useState(false)
  const rowRef = useRef<HTMLDivElement>(null)
  const favicon = getFavicon(tab.url)
  const host = getDomain(tab.url)
  const isMasked = Boolean(tab.maskedTitle)
  const displayTitle = tab.maskedTitle ?? tab.title

  // 先读取关闭按钮位置，再从其右侧发射箭头。链接行可能随即卸载，
  // 箭头则由 body 覆盖层继续播放；落点由 onOpen 异步返回。
  const handleOpen = (event: React.MouseEvent) => {
    const closeButton = rowRef.current?.querySelector<HTMLButtonElement>(
      "button:last-child"
    )
    const rect = (closeButton ?? event.currentTarget).getBoundingClientRect()
    const result = onOpen()
    // 关闭动画时仅执行打开逻辑，不发射光束
    if (!beamEnabled) return
    const origin: Point = {
      x: rect.right + 13,
      y: rect.top + rect.height / 2
    }
    const target =
      result && typeof (result as { then?: unknown }).then === "function"
        ? (result as Promise<Point | null>)
        : undefined
    playTabArrow(origin, target)
  }

  return (
    <div
      ref={rowRef}
      className={`sy-tab-row${dragOver ? " is-drag-over" : ""}`}
      title={isMasked ? "（真实标题已隐藏）" : tab.url}
      draggable
      onDragStart={onDragStart}
      onDragEnd={() => {
        setDragOver(false)
        onDragEnd()
      }}
      onDragOver={(e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = "move"
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        e.stopPropagation()
        setDragOver(false)
        onDrop(e)
      }}
      onMouseEnter={() => {
        playSound("hover", soundEnabled)
      }}
      style={{
        opacity: dragging ? 0.42 : 1,
        cursor: dragging ? "grabbing" : "grab"
      }}>
      {/* Favicon */}
      <div className="sy-favicon-box">
        {favicon ? (
          <img
            src={favicon}
            alt=""
            style={{ width: 14, height: 14, borderRadius: 3, opacity: 0.9 }}
            onError={(e) => {
              ;(e.currentTarget as HTMLImageElement).style.display = "none"
            }}
          />
        ) : (
          <div
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: "var(--border2)"
            }}
          />
        )}
      </div>

      {/* Title */}
      <span
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: fs(13.5),
          fontWeight: "var(--fw)",
          color: isMasked ? "var(--text2)" : "var(--text)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          lineHeight: 1.4
        }}>
        {displayTitle}
      </span>

      {/* Subtle host label when not masked */}
      {!isMasked && host && (
        <span className="sy-tab-host">{host}</span>
      )}

      {/* Actions — floating capsule on row hover or when locked/masked */}
      <div
        className={`sy-tab-actions${tab.locked || isMasked ? " is-pinned" : ""}`}>
        <IconBtn
          onClick={(e) => {
            e.stopPropagation()
            onToggleMaskTitle()
          }}
          title={isMasked ? "恢复真实标题" : "随机改写标题（隐藏真实标题）"}
          accent={isMasked}>
          <i
            className={isMasked ? "ri-magic-fill" : "ri-magic-line"}
            style={{
              fontSize: 12,
              color: isMasked ? "var(--accent)" : undefined
            }}
          />
        </IconBtn>
        <IconBtn
          onClick={(e) => {
            e.stopPropagation()
            onToggleLock()
          }}
          title={tab.locked ? "取消链接锁定" : "锁定链接（打开时不移除）"}
          accent={tab.locked}>
          <i
            className={tab.locked ? "ri-lock-fill" : "ri-lock-unlock-line"}
            style={{
              fontSize: 12,
              color: tab.locked ? "var(--accent)" : undefined
            }}></i>
        </IconBtn>
        <IconBtn onClick={handleOpen} title="打开标签" accent hint>
          <i className="ri-external-link-line"></i>
        </IconBtn>
        <IconBtn onClick={onDelete} title="删除">
          <i className="ri-close-line"></i>
        </IconBtn>
      </div>
    </div>
  )
}

/* ── CollectionCard ──────────────────────────────────────────── */
function CollectionCard({
  collection,
  otherCollections,
  beamEnabled,
  soundEnabled,
  splitAnimating,
  draggingTab,
  linkColumns,
  currentSpan,
  maxSpan,
  onResizeSpan,
  onResetSpan,
  onOpenAll,
  onOpenTab,
  onDeleteTab,
  onDelete,
  onSortByDomain,
  onToggleLinkColumns,
  onSplit,
  onTabDragStart,
  onTabDragEnd,
  onTabDrop,
  onGather,
  onMergeTo,
  onAppearanceChange,
  onToggleLock,
  onToggleTabLock,
  onToggleTabMaskTitle,
  searchQuery = ""
}: {
  collection: Collection
  otherCollections: Collection[]
  beamEnabled: boolean
  soundEnabled: boolean
  splitAnimating: boolean
  draggingTab: DraggedTab | null
  linkColumns: number
  currentSpan: number
  maxSpan: number
  onResizeSpan: (newSpan: number) => void
  onResetSpan: () => void
  onOpenAll: () => void
  onOpenTab: (url: string, index: number) => Promise<Point | null> | void
  onDeleteTab: (index: number) => void
  onDelete: () => void
  onSortByDomain: (order: DomainSortOrder) => void
  onToggleLinkColumns: () => void
  onSplit: () => void
  onTabDragStart: (
    colId: string,
    index: number,
    e: React.DragEvent
  ) => void
  onTabDragEnd: () => void
  onTabDrop: (targetColId: string, targetIndex: number, e: React.DragEvent) => void
  onGather: (sourceId?: string) => void
  onMergeTo: (targetId: string) => void
  onAppearanceChange: (appearance: CardAppearanceUpdate) => Promise<void>
  onToggleLock: () => void
  onToggleTabLock: (tabIndex: number) => void
  onToggleTabMaskTitle: (tabIndex: number) => void
  searchQuery?: string
}) {
  const [hCard, setHCard] = useState(false)
  const [isBlurred, setIsBlurred] = useState(false)
  const [showMergeMenu, setShowMergeMenu] = useState(false)
  const [showGatherMenu, setShowGatherMenu] = useState(false)
  const [showAppearancePanel, setShowAppearancePanel] = useState(false)
  const [appearanceTab, setAppearanceTab] = useState<"theme" | "shader" | "image">(
    "theme"
  )
  const cardRef = useRef<HTMLDivElement>(null)
  const [backgroundDraft, setBackgroundDraft] = useState(() =>
    collection.backgroundImage?.startsWith("data:")
      ? ""
      : (collection.backgroundImage ?? "")
  )
  const [backgroundError, setBackgroundError] = useState(false)
  const [uploadingBackground, setUploadingBackground] = useState(false)
  const [uploadError, setUploadError] = useState("")
  const mergeMenuRef = useRef<HTMLDivElement>(null)
  const gatherMenuRef = useRef<HTMLDivElement>(null)
  const appearanceRef = useRef<HTMLDivElement>(null)
  const appearancePanelRef = useRef<HTMLDivElement>(null)
  const [appearancePos, setAppearancePos] = useState<{
    top: number
    left: number
  } | null>(null)

  useEffect(() => {
    if (!showMergeMenu) return
    const h = (e: MouseEvent) => {
      if (
        mergeMenuRef.current &&
        !mergeMenuRef.current.contains(e.target as Node)
      )
        setShowMergeMenu(false)
    }
    document.addEventListener("mousedown", h)
    return () => document.removeEventListener("mousedown", h)
  }, [showMergeMenu])

  useEffect(() => {
    if (!showGatherMenu) return
    const h = (e: MouseEvent) => {
      if (
        gatherMenuRef.current &&
        !gatherMenuRef.current.contains(e.target as Node)
      )
        setShowGatherMenu(false)
    }
    document.addEventListener("mousedown", h)
    return () => document.removeEventListener("mousedown", h)
  }, [showGatherMenu])

  useEffect(() => {
    setBackgroundDraft(
      collection.backgroundImage?.startsWith("data:")
        ? ""
        : (collection.backgroundImage ?? "")
    )
  }, [collection.backgroundImage])

  useEffect(() => {
    if (!showAppearancePanel) return
    const updatePosition = () => {
      const anchor = appearanceRef.current
      if (!anchor) return
      const rect = anchor.getBoundingClientRect()
      const panelWidth = Math.min(348, window.innerWidth - 24)
      const panelHeight = appearancePanelRef.current?.offsetHeight || 420
      const margin = 12
      let left = rect.right - panelWidth
      left = Math.max(margin, Math.min(window.innerWidth - panelWidth - margin, left))
      let top = rect.bottom + 8
      if (top + panelHeight > window.innerHeight - margin) {
        const above = rect.top - panelHeight - 8
        top = above >= margin ? above : Math.max(margin, window.innerHeight - panelHeight - margin)
      }
      setAppearancePos({ top, left })
    }
    updatePosition()
    const raf = requestAnimationFrame(updatePosition)
    const h = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        appearanceRef.current?.contains(target) ||
        appearancePanelRef.current?.contains(target)
      ) {
        return
      }
      setShowAppearancePanel(false)
    }
    document.addEventListener("mousedown", h)
    window.addEventListener("resize", updatePosition)
    window.addEventListener("scroll", updatePosition, true)
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener("mousedown", h)
      window.removeEventListener("resize", updatePosition)
      window.removeEventListener("scroll", updatePosition, true)
    }
  }, [showAppearancePanel, appearanceTab])

  const applyBackground = () => {
    const normalized = normalizeBackgroundUrl(backgroundDraft)
    if (normalized === null) {
      setBackgroundError(true)
      return
    }
    setBackgroundError(false)
    setBackgroundDraft(normalized)
    onAppearanceChange({ backgroundImage: normalized, cardShader: null })
  }

  const uploadBackground = async (file: File | undefined) => {
    if (!file) return
    setUploadingBackground(true)
    setUploadError("")
    setBackgroundError(false)
    try {
      const dataUrl = await compressBackgroundImage(file)
      await onAppearanceChange({ backgroundImage: dataUrl, cardShader: null })
      setBackgroundDraft("")
    } catch (error) {
      setUploadError(
        error instanceof Error ? error.message : "图片保存失败，请重试"
      )
    } finally {
      setUploadingBackground(false)
    }
  }

  const [isResizing, setIsResizing] = useState(false)
  const [liveSpan, setLiveSpan] = useState<number | null>(null)
  const [hoveredCorner, setHoveredCorner] = useState<
    "tl" | "tr" | "bl" | "br" | null
  >(null)
  const [activeCorner, setActiveCorner] = useState<
    "tl" | "tr" | "bl" | "br" | null
  >(null)
  const cardStyle = normalizeCardStyle(collection.cardStyle)
  const hasCustomBackground = Boolean(collection.backgroundImage)
  const cardShader = normalizeCardShader(collection.cardShader)
  const appearanceMode = cardShader
    ? "shader"
    : hasCustomBackground
      ? "image"
      : "theme"

  const handleCornerMouseDown = (
    e: React.MouseEvent,
    corner: "tl" | "tr" | "bl" | "br"
  ) => {
    if (maxSpan <= 1) return
    e.preventDefault()
    e.stopPropagation()

    const startX = e.clientX
    const startY = e.clientY
    const cardEl = cardRef.current
    if (!cardEl) return
    const cardRect = cardEl.getBoundingClientRect()
    const gridEl = cardEl.closest(".sy-collections-grid")
    const parentWidth =
      gridEl?.getBoundingClientRect().width ||
      cardEl.parentElement?.parentElement?.getBoundingClientRect().width ||
      cardRect.width
    const calculatedColWidth = (parentWidth - (maxSpan - 1) * 14) / maxSpan
    const colWidth =
      calculatedColWidth > 60
        ? calculatedColWidth
        : cardRect.width / Math.max(1, currentSpan)
    const initialWidth = cardRect.width
    const initialSpan = currentSpan
    let lastAppliedSpan = initialSpan

    setIsResizing(true)
    setActiveCorner(corner)
    setLiveSpan(initialSpan)
    const cursorStyle =
      corner === "tl" || corner === "br" ? "nwse-resize" : "nesw-resize"
    const prevCursor = document.body.style.cursor
    const prevUserSelect = document.body.style.userSelect
    document.body.style.cursor = cursorStyle
    document.body.style.userSelect = "none"

    const handleMouseMove = (moveEvt: MouseEvent) => {
      const deltaX =
        corner === "tr" || corner === "br"
          ? moveEvt.clientX - startX
          : startX - moveEvt.clientX

      const deltaY =
        corner === "bl" || corner === "br"
          ? moveEvt.clientY - startY
          : startY - moveEvt.clientY

      const delta = Math.abs(deltaX) >= Math.abs(deltaY) ? deltaX : deltaY
      const targetWidth = initialWidth + delta
      const rawSpan = Math.round((targetWidth + 14) / (colWidth + 14))
      // 范围：最小1列，最大总列数 maxSpan
      const targetSpan = Math.max(1, Math.min(maxSpan, rawSpan))

      if (targetSpan !== lastAppliedSpan) {
        lastAppliedSpan = targetSpan
        setLiveSpan(targetSpan)
        onResizeSpan(targetSpan)
      }
    }

    const handleMouseUp = () => {
      setIsResizing(false)
      setActiveCorner(null)
      setLiveSpan(null)
      document.body.style.cursor = prevCursor
      document.body.style.userSelect = prevUserSelect
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseup", handleMouseUp)
    }

    window.addEventListener("mousemove", handleMouseMove)
    window.addEventListener("mouseup", handleMouseUp)
  }

  const handleCornerDoubleClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onResetSpan()
  }

  const normalizedQuery = searchQuery.trim().toLowerCase()
  const allIndexedTabs = (collection.tabs || []).map((tab, index) => ({
    tab,
    index
  }))
  const visibleTabs = normalizedQuery
    ? allIndexedTabs.filter(({ tab }) => {
        const hay = `${tab.title} ${tab.maskedTitle ?? ""} ${tab.url}`.toLowerCase()
        return hay.includes(normalizedQuery)
      })
    : allIndexedTabs
  const hasOpenMenu = showMergeMenu || showGatherMenu || showAppearancePanel

  return (
    <div
      ref={cardRef}
      className={`kt-collection-card${splitAnimating ? " kt-card-split-born" : ""}${isBlurred ? " is-blurred" : ""}${isResizing ? " is-resizing" : ""}`}
      data-card-style={appearanceMode === "theme" ? cardStyle : undefined}
      data-card-mode={appearanceMode}
      data-shader-tone={
        appearanceMode === "shader" && cardShader
          ? getShaderTone(cardShader)
          : undefined
      }
      onMouseEnter={() => setHCard(true)}
      onMouseLeave={() => setHCard(false)}
      style={{
        position: "relative",
        zIndex: hasOpenMenu ? 100 : isResizing ? 60 : 1,
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r)",
        boxShadow: hCard ? "var(--shadow-m)" : "var(--shadow-s)",
        transition:
          "box-shadow var(--dur) var(--ease), transform var(--dur) var(--ease)",
        transform: hCard && !isResizing ? "translateY(-1px)" : "translateY(0)"
      }}>
      <div
        className="kt-card-visual"
        aria-hidden="true"
        style={
          appearanceMode === "image" && collection.backgroundImage
            ? { backgroundImage: backgroundImageValue(collection.backgroundImage) }
            : undefined
        }>
        {appearanceMode === "shader" && cardShader && (
          <CardShaderBackground shader={cardShader} />
        )}
      </div>
      {/* ── Header ── */}
      <div
        className="kt-card-header"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "nowrap",
          padding: "10px 14px",
          borderBottom: "1px solid var(--border)",
          gap: 8,
          borderTopLeftRadius: "max(0px, calc(var(--r) - 1px))",
          borderTopRightRadius: "max(0px, calc(var(--r) - 1px))"
        }}>
        <div className="sy-card-meta">
          <span
            className={`kt-card-badge-btn${isBlurred ? " active" : ""}`}
            onClick={() => setIsBlurred((v) => !v)}
            title={isBlurred ? "点击恢复显示（退出隐私模式）" : "点击模糊卡片（隐私保护）"}
            style={{
              fontSize: fs(12.5),
              fontWeight: 600,
              color: isBlurred ? "var(--accent)" : "var(--text)"
            }}>
            {isBlurred ? (
              <i className="ri-eye-off-line" style={{ fontSize: fs(13) }} />
            ) : collection.locked ? (
              <i className="ri-lock-fill" style={{ fontSize: fs(12), color: "var(--accent)" }} />
            ) : null}
            {normalizedQuery
              ? `${visibleTabs.length}/${collection.tabs?.length || 0} 页`
              : `${collection.tabs?.length || 0} 页`}
          </span>
          <span className="sy-card-time" title={new Date(collection.timestamp).toLocaleString()}>
            {formatDate(collection.timestamp)}
          </span>
        </div>

        {/* Actions */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            flexShrink: 0,
            flexWrap: "nowrap"
          }}>
          <div className={`sy-card-secondary-tools${hasOpenMenu ? " is-open" : ""}`}>
          <IconBtn
            onClick={onToggleLock}
            title={
              collection.locked
                ? "窗口已锁定：打开全部时不自动删除此窗口"
                : "锁定窗口"
            }
            accent={collection.locked}>
            <i
              className={collection.locked ? "ri-lock-fill" : "ri-lock-unlock-line"}
              style={{
                color: collection.locked ? "var(--accent)" : undefined
              }}></i>
          </IconBtn>
          <div style={{ position: "relative" }} ref={appearanceRef}>
            <IconBtn
              onClick={() => {
                setShowAppearancePanel((value) => {
                  const next = !value
                  if (next) setAppearanceTab(appearanceMode)
                  return next
                })
              }}
              title="卡片外观">
              <i className="ri-palette-line"></i>
            </IconBtn>
            {showAppearancePanel &&
              appearancePos &&
              createPortal(
                <div
                  ref={appearancePanelRef}
                  className="kt-appearance-panel"
                  style={{
                    top: appearancePos.top,
                    left: appearancePos.left
                  }}>
                <div className="kt-appearance-title">
                  <span>卡片外观</span>
                  <span>
                    {appearanceMode === "theme"
                      ? CARD_STYLES.find((s) => s.id === cardStyle)?.name ?? "素瓷"
                      : appearanceMode === "shader"
                        ? CARD_SHADERS.find((s) => s.id === cardShader)?.name ?? "动态流光"
                        : "自定义图片"}
                  </span>
                </div>

                <div className="sy-ap-tabs" role="tablist">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={appearanceTab === "theme"}
                    className={`sy-ap-tab${appearanceTab === "theme" ? " active" : ""}`}
                    onClick={() => setAppearanceTab("theme")}>
                    风格主题
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={appearanceTab === "shader"}
                    className={`sy-ap-tab${appearanceTab === "shader" ? " active" : ""}`}
                    onClick={() => setAppearanceTab("shader")}>
                    动态流光
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={appearanceTab === "image"}
                    className={`sy-ap-tab${appearanceTab === "image" ? " active" : ""}`}
                    onClick={() => setAppearanceTab("image")}>
                    图片背景
                  </button>
                </div>

                {appearanceTab === "theme" && (
                  <div className="kt-style-grid">
                    {CARD_STYLES.map((style) => (
                      <button
                        key={style.id}
                        type="button"
                        title={`${style.name} · ${style.description}`}
                        className={`kt-style-option${appearanceMode === "theme" && cardStyle === style.id ? " active" : ""}`}
                        onClick={() =>
                          onAppearanceChange({
                            cardStyle: style.id,
                            backgroundImage: "",
                            cardShader: null
                          })
                        }>
                        <span
                          className="kt-style-preview"
                          data-preview-style={style.id}>
                          <span />
                        </span>
                        <span className="kt-style-name">{style.name}</span>
                        <span className="kt-style-description">
                          {style.description}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {appearanceTab === "shader" && (
                  <div className="sy-ap-scroll">
                    <div className="sy-ap-section-head">
                      <span>先锋实验 · 指针交互</span>
                      <span className="sy-lab-tag">LAB</span>
                    </div>
                    <div className="kt-shader-grid">
                      {CARD_SHADERS.filter((s) => s.experimental).map((shader) => (
                        <button
                          key={shader.id}
                          type="button"
                          title={`${shader.name} · ${shader.description}`}
                          className={`kt-shader-option${cardShader === shader.id ? " active" : ""}`}
                          onClick={() =>
                            onAppearanceChange({
                              backgroundImage: "",
                              cardShader: shader.id
                            })
                          }>
                          <span
                            className="kt-shader-preview"
                            data-shader-preview={shader.id}>
                            <span />
                          </span>
                          <span className="kt-style-name">{shader.name}</span>
                          <span className="kt-style-description">
                            {shader.description}
                          </span>
                        </button>
                      ))}
                    </div>

                    <div className="sy-ap-section-head" style={{ marginTop: 12 }}>
                      <span>经典流光</span>
                    </div>
                    <div className="kt-shader-grid">
                      {CARD_SHADERS.filter((s) => !s.experimental).map((shader) => (
                        <button
                          key={shader.id}
                          type="button"
                          title={`${shader.name} · ${shader.description}`}
                          className={`kt-shader-option${cardShader === shader.id ? " active" : ""}`}
                          onClick={() =>
                            onAppearanceChange({
                              backgroundImage: "",
                              cardShader: shader.id
                            })
                          }>
                          <span
                            className="kt-shader-preview"
                            data-shader-preview={shader.id}>
                            <span />
                          </span>
                          <span className="kt-style-name">{shader.name}</span>
                          <span className="kt-style-description">
                            {shader.description}
                          </span>
                        </button>
                      ))}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginTop: 10
                      }}>
                      <a
                        className="kt-paper-credit"
                        style={{ marginTop: 0 }}
                        href="https://shaders.paper.design"
                        target="_blank"
                        rel="noreferrer">
                        GLSL Lab + Paper Shaders
                      </a>
                      {appearanceMode === "shader" && (
                        <button
                          type="button"
                          className="kt-background-clear"
                          style={{ marginTop: 0 }}
                          onClick={() =>
                            onAppearanceChange({ cardShader: null })
                          }>
                          停用流光
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {appearanceTab === "image" && (
                  <div>
                    <div className="kt-background-source">
                      <label
                        className={`kt-background-upload${uploadingBackground ? " disabled" : ""}`}>
                        <i className="ri-image-add-line"></i>
                        {uploadingBackground ? "正在处理…" : "选择本地图片"}
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/avif"
                          disabled={uploadingBackground}
                          onChange={(e) => {
                            const file = e.currentTarget.files?.[0]
                            e.currentTarget.value = ""
                            void uploadBackground(file)
                          }}
                        />
                      </label>
                      <span>自动压缩，最大边长 1440px</span>
                    </div>
                    {uploadError && (
                      <div className="kt-background-error">{uploadError}</div>
                    )}
                    <div className="kt-background-or">或使用在线图片</div>
                    <div className="kt-background-row">
                      <input
                        id={`bg-${collection.id}`}
                        value={backgroundDraft}
                        onChange={(e) => {
                          setBackgroundDraft(e.target.value)
                          setBackgroundError(false)
                          setUploadError("")
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") applyBackground()
                        }}
                        placeholder="粘贴图片 URL"
                        aria-invalid={backgroundError}
                      />
                      <button type="button" onClick={applyBackground}>
                        应用
                      </button>
                    </div>
                    {backgroundError && (
                      <div className="kt-background-error">
                        请输入有效的 http(s) 图片地址
                      </div>
                    )}
                    {appearanceMode === "image" && (
                      <button
                        type="button"
                        className="kt-background-clear"
                        onClick={() => {
                          setBackgroundDraft("")
                          setBackgroundError(false)
                          setUploadError("")
                          onAppearanceChange({ backgroundImage: "" })
                        }}>
                        移除背景图
                      </button>
                    )}
                  </div>
                )}
                </div>,
                document.body
              )}
          </div>
          <IconBtn
            onClick={onToggleLinkColumns}
            title={`链接列数：${linkColumns} 列，点击切换`}>
            <span style={{ fontSize: 11, fontWeight: 700 }}>
              {linkColumns}
            </span>
          </IconBtn>
          <IconBtn
            onClick={() => onSortByDomain("asc")}
            title="按域名 A-Z 排序">
            <i className="ri-sort-alphabet-asc"></i>
          </IconBtn>
          <IconBtn
            onClick={() => onSortByDomain("desc")}
            title="按域名 Z-A 排序">
            <i className="ri-sort-alphabet-desc"></i>
          </IconBtn>
          {collection.tabs.length > SPLIT_THRESHOLD && (
            <IconBtn onClick={onSplit} title="拆分为两个窗口">
              <i className="ri-scissors-cut-line"></i>
            </IconBtn>
          )}

          {otherCollections.length > 0 && (
            <>
              <div style={{ position: "relative" }} ref={gatherMenuRef}>
                <button
                  title="归集：将其他卡片的标签页合并到当前卡片"
                  onClick={() => setShowGatherMenu(!showGatherMenu)}
                  style={{
                    width: 24,
                    height: 24,
                    padding: 0,
                    background: showGatherMenu ? "var(--bg3)" : "transparent",
                    color: showGatherMenu ? "var(--text)" : "var(--text3)",
                    border: "none",
                    borderRadius: "var(--r-s)",
                    fontSize: 13,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    transition: "all var(--dur) var(--ease)"
                  }}
                  onMouseEnter={(e) => {
                    const el = e.currentTarget as HTMLButtonElement
                    if (!showGatherMenu) {
                      el.style.background = "var(--bg3)"
                      el.style.color = "var(--text)"
                    }
                  }}
                  onMouseLeave={(e) => {
                    const el = e.currentTarget as HTMLButtonElement
                    if (!showGatherMenu) {
                      el.style.background = "transparent"
                      el.style.color = "var(--text3)"
                    }
                  }}>
                  <i className="ri-game-line"></i>
                </button>
                {showGatherMenu && (
                  <div className="sy-transfer-menu">
                    <div className="sy-transfer-head">
                      <span>归集来源窗口</span>
                      <span>{otherCollections.length} 个可选</span>
                    </div>
                    <button
                      type="button"
                      className="sy-transfer-all"
                      onClick={() => {
                        onGather()
                        setShowGatherMenu(false)
                      }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <i className="ri-stack-line" />
                        <span>归集全部其他窗口</span>
                      </span>
                      <span>
                        {otherCollections.reduce((n, c) => n + (c.tabs?.length || 0), 0)} 页
                      </span>
                    </button>
                    {otherCollections.map((c) => {
                      const firstTab = c.tabs?.[0]
                      const title =
                        firstTab?.maskedTitle ||
                        firstTab?.title?.trim() ||
                        (firstTab?.url ? getDomain(firstTab.url) : "未命名窗口")
                      const favicon = firstTab?.url ? getFavicon(firstTab.url) : ""
                      const host =
                        !firstTab?.maskedTitle && firstTab?.url
                          ? getDomain(firstTab.url)
                          : ""
                      const tabCount = c.tabs?.length || 0
                      return (
                        <button
                          key={c.id}
                          type="button"
                          className="sy-transfer-item"
                          title={firstTab?.maskedTitle ? title : firstTab?.title || title}
                          onClick={() => {
                            onGather(c.id)
                            setShowGatherMenu(false)
                          }}>
                          <span className="sy-transfer-icon">
                            {favicon ? (
                              <img
                                src={favicon}
                                alt=""
                                style={{ width: 14, height: 14, borderRadius: 3 }}
                                onError={(e) => {
                                  ;(e.currentTarget as HTMLImageElement).style.display = "none"
                                }}
                              />
                            ) : (
                              <i className="ri-window-line" style={{ fontSize: 12, color: "var(--text3)" }} />
                            )}
                          </span>
                          <span className="sy-transfer-body">
                            <span className="sy-transfer-title">{title}</span>
                            <span className="sy-transfer-sub">
                              {formatDate(c.timestamp)}
                              {host ? ` · ${host}` : ""}
                            </span>
                          </span>
                          <span className="sy-transfer-count">{tabCount} 页</span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
              <div style={{ position: "relative" }} ref={mergeMenuRef}>
                <button
                  title="投奔：将当前卡片的标签页合并到其他卡片"
                  onClick={() => setShowMergeMenu(!showMergeMenu)}
                  style={{
                    width: 24,
                    height: 24,
                    padding: 0,
                    background: showMergeMenu ? "var(--bg3)" : "transparent",
                    color: showMergeMenu ? "var(--text)" : "var(--text3)",
                    border: "none",
                    borderRadius: "var(--r-s)",
                    fontSize: 13,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    transition: "all var(--dur) var(--ease)"
                  }}
                  onMouseEnter={(e) => {
                    const el = e.currentTarget as HTMLButtonElement
                    if (!showMergeMenu) {
                      el.style.background = "var(--bg3)"
                      el.style.color = "var(--text)"
                    }
                  }}
                  onMouseLeave={(e) => {
                    const el = e.currentTarget as HTMLButtonElement
                    if (!showMergeMenu) {
                      el.style.background = "transparent"
                      el.style.color = "var(--text3)"
                    }
                  }}>
                  <i className="ri-game-2-line"></i>
                </button>
                {showMergeMenu && (
                  <div className="sy-transfer-menu">
                    <div className="sy-transfer-head">
                      <span>投奔到目标窗口</span>
                      <span>{otherCollections.length} 个可选</span>
                    </div>
                    {otherCollections.map((c) => {
                      const firstTab = c.tabs?.[0]
                      const title =
                        firstTab?.maskedTitle ||
                        firstTab?.title?.trim() ||
                        (firstTab?.url ? getDomain(firstTab.url) : "未命名窗口")
                      const favicon = firstTab?.url ? getFavicon(firstTab.url) : ""
                      const host =
                        !firstTab?.maskedTitle && firstTab?.url
                          ? getDomain(firstTab.url)
                          : ""
                      const tabCount = c.tabs?.length || 0
                      return (
                        <button
                          key={c.id}
                          type="button"
                          className="sy-transfer-item"
                          title={firstTab?.maskedTitle ? title : firstTab?.title || title}
                          onClick={() => {
                            onMergeTo(c.id)
                            setShowMergeMenu(false)
                          }}>
                          <span className="sy-transfer-icon">
                            {favicon ? (
                              <img
                                src={favicon}
                                alt=""
                                style={{ width: 14, height: 14, borderRadius: 3 }}
                                onError={(e) => {
                                  ;(e.currentTarget as HTMLImageElement).style.display = "none"
                                }}
                              />
                            ) : (
                              <i className="ri-window-line" style={{ fontSize: 12, color: "var(--text3)" }} />
                            )}
                          </span>
                          <span className="sy-transfer-body">
                            <span className="sy-transfer-title">{title}</span>
                            <span className="sy-transfer-sub">
                              {formatDate(c.timestamp)}
                              {host ? ` · ${host}` : ""}
                            </span>
                          </span>
                          <span className="sy-transfer-count">{tabCount} 页</span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            </>
          )}
          <IconBtn onClick={onDelete} title="删除此窗口">
            <i className="ri-delete-bin-line"></i>
          </IconBtn>
          </div>
          <button
            onClick={onOpenAll}
            title="全部恢复"
            className="sy-restore-pill">
            <i className="ri-external-link-line" style={{ fontSize: 12 }}></i>
            <span>恢复</span>
          </button>
        </div>
      </div>

      {/* ── Tab list ── */}
      <div style={{ position: "relative" }}>
        <div
          className="kt-card-list"
          onDragOver={(e) => {
            if (isBlurred) return
            e.preventDefault()
            e.dataTransfer.dropEffect = "move"
          }}
          onDrop={(e) => {
            if (isBlurred) return
            onTabDrop(collection.id, (collection.tabs?.length || 0), e)
          }}
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${linkColumns}, minmax(0, 1fr))`,
            gap: 2,
            padding: "8px 8px"
          }}>
          {visibleTabs.map(({ tab, index }) => (
            <TabItem
              key={`${tab.url}-${index}`}
              tab={tab}
              beamEnabled={beamEnabled}
              soundEnabled={soundEnabled}
              dragging={
                draggingTab?.colId === collection.id && draggingTab.index === index
              }
              onOpen={() => onOpenTab(tab.url, index)}
              onDelete={() => onDeleteTab(index)}
              onToggleLock={() => onToggleTabLock(index)}
              onToggleMaskTitle={() => onToggleTabMaskTitle(index)}
              onDragStart={(e) => onTabDragStart(collection.id, index, e)}
              onDragEnd={onTabDragEnd}
              onDrop={(e) => onTabDrop(collection.id, index, e)}
            />
          ))}
        </div>
        {isBlurred && (
          <div
            className="kt-card-blur-overlay"
            onClick={() => setIsBlurred(false)}
            title="点击恢复显示">
            <div className="kt-card-blur-chip" style={{ fontSize: fs(12) }}>
              <i
                className="ri-eye-off-line"
                style={{ fontSize: fs(14), color: "var(--accent)" }}
              />
              <span>已开启隐私模糊 · 点击恢复</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Corner resize handles (aligned with window corner curves) ── */}
      {maxSpan > 1 && (
        <>
          {(["tl", "tr", "bl", "br"] as const).map((corner) => (
            <div
              key={corner}
              className={`kt-card-corner-handle kt-card-corner-${corner}${activeCorner === corner || hoveredCorner === corner ? " is-active" : ""}`}
              title="拖拽调整卡片宽度（1列至最大列数，双击重置为1列）"
              onMouseEnter={() => setHoveredCorner(corner)}
              onMouseLeave={() =>
                setHoveredCorner((prev) => (prev === corner ? null : prev))
              }
              onMouseDown={(e) => handleCornerMouseDown(e, corner)}
              onDoubleClick={handleCornerDoubleClick}
            />
          ))}
        </>
      )}

      {/* ── Resize HUD indicator ── */}
      {isResizing && (
        <div className="kt-card-resize-hud" aria-live="polite">
          <div className="kt-hud-slots">
            {Array.from({ length: maxSpan }).map((_, i) => (
              <div
                key={i}
                className={`kt-hud-slot${i < (liveSpan ?? currentSpan) ? " active" : ""}`}
              />
            ))}
          </div>
          <div className="kt-hud-text">
            <span className="kt-hud-val">{liveSpan ?? currentSpan} 列</span>
            {(liveSpan ?? currentSpan) === maxSpan && (
              <span className="kt-hud-tag max">最大</span>
            )}
            {(liveSpan ?? currentSpan) === 1 && (
              <span className="kt-hud-tag min">最小</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Synced tabs card (read-only) ────────────────────────────── */
function SyncedTabsCard({
  device,
  windowIndex,
  tabs,
  beamEnabled,
  soundEnabled
}: {
  device: string
  windowIndex: number
  tabs: SyncedTab[]
  beamEnabled: boolean
  soundEnabled: boolean
}) {
  const [hCard, setHCard] = useState(false)

  const openAll = async () => {
    playSound("complete", soundEnabled)
    for (const tab of tabs) {
      try {
        await chrome.tabs.create({ url: tab.url, active: false })
      } catch {}
    }
  }

  const openTab = (url: string, event: React.MouseEvent) => {
    playSound("open", soundEnabled)
    chrome.tabs.create({ url, active: false }).catch(() => {})
    if (beamEnabled) {
      const rect = event.currentTarget.getBoundingClientRect()
      const origin: Point = {
        x: rect.right + 13,
        y: rect.top + rect.height / 2
      }
      playTabArrow(origin)
    }
  }

  return (
    <div
      className="kt-collection-card"
      data-card-style="classic"
      data-card-mode="theme"
      onMouseEnter={() => setHCard(true)}
      onMouseLeave={() => setHCard(false)}
      style={{
        position: "relative",
        zIndex: 1,
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r)",
        boxShadow: hCard ? "var(--shadow-m)" : "var(--shadow-s)",
        transition:
          "box-shadow var(--dur) var(--ease), transform var(--dur) var(--ease)",
        transform: hCard ? "translateY(-1px)" : "translateY(0)"
      }}>
      <div className="kt-card-visual" aria-hidden="true" />
      {/* Header */}
      <div
        className="kt-card-header"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "nowrap",
          padding: "10px 14px",
          borderBottom: "1px solid var(--border)",
          gap: 8,
          borderTopLeftRadius: "max(0px, calc(var(--r) - 1px))",
          borderTopRightRadius: "max(0px, calc(var(--r) - 1px))"
        }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            flex: "1 1 auto",
            minWidth: 0,
            overflow: "hidden",
            gap: 6
          }}>
          <i
            className="ri-computer-line"
            style={{ fontSize: fs(13), color: "var(--text3)", flexShrink: 0 }}
          />
          <span
            style={{
              fontSize: fs(13),
              fontWeight: "var(--fw-medium, 500)",
              color: "var(--text2)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap"
            }}>
            {device}{windowIndex > 0 ? ` · 窗口 ${windowIndex + 1}` : ""}
          </span>
          <span
            style={{
              fontSize: fs(12),
              color: "var(--text3)",
              flexShrink: 0
            }}>
            {tabs.length} 个标签
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
          <button
            onClick={openAll}
            style={{
              width: 32,
              height: 32,
              padding: 0,
              background: "var(--accent)",
              color: "#fff",
              border: "none",
              borderRadius: "var(--r-s)",
              fontSize: fs(12.5),
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "var(--font)",
              flexShrink: 0,
              transition: "background var(--dur) var(--ease)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}
            onMouseEnter={(e) => {
              ;(e.currentTarget as HTMLButtonElement).style.background =
                "var(--accent2)"
            }}
            onMouseLeave={(e) => {
              ;(e.currentTarget as HTMLButtonElement).style.background =
                "var(--accent)"
            }}>
            <i className="ri-external-link-line"></i>
          </button>
        </div>
      </div>
      {/* Tab list */}
      <div
        className="kt-card-list"
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr)",
          gap: 2,
          padding: "8px 8px"
        }}>
        {tabs.map((tab, i) => {
          const favicon = getFavicon(tab.url)
          return <SyncedTabRow key={`${tab.url}-${i}`} tab={tab} favicon={favicon} onOpen={openTab} soundEnabled={soundEnabled} />
        })}
      </div>
    </div>
  )
}

function SyncedTabRow({
  tab,
  favicon,
  onOpen,
  soundEnabled
}: {
  tab: SyncedTab
  favicon: string | null
  onOpen: (url: string, e: React.MouseEvent) => void
  soundEnabled: boolean
}) {
  const [h, setH] = useState(false)
  return (
    <div
      title={tab.url}
      onClick={(e) => onOpen(tab.url, e)}
      onMouseEnter={() => {
        setH(true)
        playSound("hover", soundEnabled)
      }}
      onMouseLeave={() => setH(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "7px 10px",
        borderRadius: 7,
        background: h ? "var(--bg2)" : "transparent",
        cursor: "pointer",
        transition: "background var(--dur) var(--ease)",
        minWidth: 0
      }}>
      <div
        style={{
          width: 16,
          height: 16,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center"
        }}>
        {favicon ? (
          <img
            src={favicon}
            alt=""
            style={{ width: 15, height: 15, borderRadius: 3, opacity: 0.82 }}
            onError={(e) => {
              ;(e.currentTarget as HTMLImageElement).style.display = "none"
            }}
          />
        ) : (
          <div
            style={{
              width: 9,
              height: 9,
              borderRadius: "50%",
              background: "var(--border2)"
            }}
          />
        )}
      </div>
      <span
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: fs(14),
          fontWeight: "var(--fw)",
          color: "var(--text)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          lineHeight: 1.4
        }}>
        {tab.title || tab.url}
      </span>
      <div
        style={{
          display: "flex",
          gap: 2,
          flexShrink: 0,
          opacity: h ? 1 : 0,
          transition: "opacity var(--dur) var(--ease)"
        }}>
        <IconBtn onClick={(e) => { e.stopPropagation(); onOpen(tab.url, e) }} title="打开标签" accent hint>
          <i className="ri-external-link-line"></i>
        </IconBtn>
      </div>
    </div>
  )
}

/* ── Header icon button helper ───────────────────────────────── */
function NavBtn({
  children,
  onClick,
  title,
  active = false,
  danger = false
}: {
  children: React.ReactNode
  onClick: () => void
  title?: string
  active?: boolean
  danger?: boolean
}) {
  const [h, setH] = useState(false)
  return (
    <button
      onClick={onClick}
      title={title}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        width: 32,
        height: 32,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: active
          ? "var(--accent-bg)"
          : danger && h
            ? "rgba(220,38,38,.12)"
            : h
              ? "var(--bg2)"
              : "transparent",
        color: danger
          ? h ? "#dc2626" : "#b45050"
          : active ? "var(--accent)" : h ? "var(--text)" : "var(--text3)",
        border: `1px solid ${active ? "rgba(217,119,86,.2)" : danger && h ? "rgba(220,38,38,.25)" : h ? "var(--border2)" : "var(--border)"}`,
        borderRadius: "var(--r-s)",
        cursor: "pointer",
        fontSize: 13,
        fontWeight: 600,
        fontFamily: "var(--font)",
        transition: "all var(--dur) var(--ease)"
      }}>
      {children}
    </button>
  )
}

/* ── Font size stepper ───────────────────────────────────────── */
function FontSizeStepper({
  scale,
  onChange
}: {
  scale: number
  onChange: (next: number) => void
}) {
  const pct = Math.round(scale * 100)
  return (
    <div className="kt-size-row">
      <span className="kt-font-label">字号</span>
      <div className="kt-size-bar">
        <button
          className="kt-size-btn"
          disabled={scale <= SCALE_MIN}
          onClick={() => onChange(scale - SCALE_STEP)}
          title="减小字号">
          −
        </button>
        <span className="kt-size-val">{pct}%</span>
        <button
          className="kt-size-btn"
          disabled={scale >= SCALE_MAX}
          onClick={() => onChange(scale + SCALE_STEP)}
          title="增大字号">
          +
        </button>
      </div>
    </div>
  )
}

/* ── Font weight segmented control ───────────────────────────── */
function FontWeightControl({
  weight,
  onChange
}: {
  weight: FontWeightValue
  onChange: (next: FontWeightValue) => void
}) {
  const options: Array<{ label: string; value: FontWeightValue }> = [
    { label: "轻", value: 400 },
    { label: "常规", value: 500 },
    { label: "粗", value: 700 }
  ]

  return (
    <div className="kt-size-row">
      <span className="kt-font-label">粗细</span>
      <div className="kt-size-bar">
        {options.map((opt) => (
          <button
            key={opt.value}
            className={`kt-weight-btn${weight === opt.value ? " active" : ""}`}
            onClick={() => onChange(opt.value)}
            title={`字体粗细：${opt.label}`}>
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}

/* ── Window radius control ───────────────────────────────────── */
function WindowRadiusControl({
  radius,
  onChange
}: {
  radius: number
  onChange: (next: number) => void
}) {
  const presets: Array<{ label: string; value: number; hint: string }> = [
    { label: "直角", value: 0, hint: "直角 0px" },
    { label: "微圆", value: 6, hint: "微圆 6px" },
    { label: "默认", value: 14, hint: "默认 14px" },
    { label: "圆角", value: 24, hint: "圆角 24px" }
  ]

  return (
    <div className="kt-size-row">
      <span className="kt-font-label">圆角</span>
      <div className="kt-size-bar">
        <button
          className="kt-size-btn"
          disabled={radius <= RADIUS_MIN}
          onClick={() => onChange(radius - RADIUS_STEP)}
          title="减小圆角（步进 2px）">
          −
        </button>
        <span className="kt-size-val">
          {radius}px
          {radius === 0 ? " (直角)" : radius >= 24 ? " (圆角)" : ""}
        </span>
        <button
          className="kt-size-btn"
          disabled={radius >= RADIUS_MAX}
          onClick={() => onChange(radius + RADIUS_STEP)}
          title="增大圆角（步进 2px）">
          +
        </button>
      </div>
      <div className="kt-size-bar" style={{ flex: "0 0 auto", gap: 3 }}>
        {presets.map((p) => (
          <button
            key={p.value}
            className={`kt-weight-btn${radius === p.value ? " active" : ""}`}
            style={{ padding: "0 7px", width: "auto" }}
            onClick={() => onChange(p.value)}
            title={p.hint}>
            {p.label}
          </button>
        ))}
      </div>
    </div>
  )
}

/* ── Font row — lazy-loads its own preview when scrolled into view ── */
function FontRow({
  font,
  active,
  scrollRoot,
  onSelect
}: {
  font: SelectableFont
  active: boolean
  scrollRoot: Element | null
  onSelect: () => void
}) {
  const ref = useRef<HTMLButtonElement>(null)
  const [previewable, setPreviewable] = useState(!font.cssUrls)

  useEffect(() => {
    if (previewable || !ref.current) return
    const el = ref.current
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            font.cssUrls?.forEach((u) => injectFontCss(u))
            setPreviewable(true)
            io.disconnect()
            break
          }
        }
      },
      { root: scrollRoot, rootMargin: "200px" }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [font, previewable, scrollRoot])

  return (
    <button
      ref={ref}
      className={`kt-font-chip${active ? " active" : ""}`}
      style={previewable ? { fontFamily: fontFamilyValue(font) } : undefined}
      onClick={onSelect}
      title={font.name}>
      {font.name}
    </button>
  )
}

/* ── Font picker — search + size + lazy preview grid ─────────── */
function FontPicker({
  activeId,
  scale,
  weight,
  radius,
  onSelectFont,
  onScaleChange,
  onWeightChange,
  onRadiusChange
}: {
  activeId: string
  scale: number
  weight: FontWeightValue
  radius: number
  onSelectFont: (font: SelectableFont) => void
  onScaleChange: (next: number) => void
  onWeightChange: (next: FontWeightValue) => void
  onRadiusChange: (next: number) => void
}) {
  const [query, setQuery] = useState("")
  // 回调 ref 转 state：附加后触发重渲染，让子项拿到真实的滚动容器作为观察根
  const [listEl, setListEl] = useState<HTMLDivElement | null>(null)
  const q = query.trim().toLowerCase()
  const filtered = q
    ? ALL_FONTS.filter(
        (f) =>
          f.name.toLowerCase().includes(q) || f.family.toLowerCase().includes(q)
      )
    : ALL_FONTS

  return (
    <div className="kt-font-panel">
      <FontSizeStepper scale={scale} onChange={onScaleChange} />
      <FontWeightControl weight={weight} onChange={onWeightChange} />
      <WindowRadiusControl radius={radius} onChange={onRadiusChange} />

      <input
        className="kt-font-search"
        placeholder={`搜索字体（共 ${ALL_FONTS.length} 款）`}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
      />

      <div className="kt-font-list" ref={setListEl}>
        {filtered.length === 0 ? (
          <div className="kt-font-empty">没有匹配的字体</div>
        ) : (
          filtered.map((f) => (
            <FontRow
              key={f.id}
              font={f}
              active={f.id === activeId}
              scrollRoot={listEl}
              onSelect={() => onSelectFont(f)}
            />
          ))
        )}
      </div>

      <div
        style={{
          fontSize: 11,
          color: "var(--text3)",
          textAlign: "center",
          lineHeight: 1.5
        }}>
        字体由{" "}
        <a
          href="https://chinese-font.netlify.app"
          target="_blank"
          rel="noreferrer"
          style={{ color: "var(--accent)", textDecoration: "none" }}>
          中文网字计划
        </a>{" "}
        免费提供
      </div>
    </div>
  )
}

/* ── Main ────────────────────────────────────────────────────── */
function CollectionPage() {
  const [collections, setCollections] = useState<Collection[]>([])
  const [syncedDevices, setSyncedDevices] = useState<SyncedDevice[]>([])
  const [showSyncedTabs, setShowSyncedTabs] = useState(true)
  const [loading, setLoading] = useState(true)
  const [fontId, setFontId] = useState("system")
  const [fontScale, setFontScale] = useState(SCALE_DEFAULT)
  const [fontWeight, setFontWeight] = useState<FontWeightValue>(WEIGHT_DEFAULT)
  const [cardRadius, setCardRadius] = useState(RADIUS_DEFAULT)
  const [showFontPanel, setShowFontPanel] = useState(false)
  const [showPrefsPanel, setShowPrefsPanel] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [theme, setTheme] = useState<Theme>("auto")
  const [beamEnabled, setBeamEnabled] = useState(BEAM_DEFAULT)
  const [cursorEnabled, setCursorEnabled] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(SOUND_DEFAULT)
  const [collectMode, setCollectMode] = useState<CollectMode>("all")
  const [windowColumns, setWindowColumns] = useState(WINDOW_COLUMNS_DEFAULT)
  const [collectionColumns, setCollectionColumns] = useState<
    Record<string, number>
  >({})
  const [collectionSpans, setCollectionSpans] = useState<
    Record<string, number>
  >({})
  const [splitAnimatingIds, setSplitAnimatingIds] = useState<Set<string>>(
    () => new Set()
  )
  const [draggingTab, setDraggingTab] = useState<DraggedTab | null>(null)
  const navRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const totalTabs = collections.reduce((n, c) => n + (c.tabs?.length || 0), 0)
  const normalizedSearch = searchQuery.trim().toLowerCase()
  const filteredCollections = normalizedSearch
    ? collections.filter((c) =>
        (c.tabs || []).some((t) =>
          `${t.title} ${t.maskedTitle ?? ""} ${t.url}`
            .toLowerCase()
            .includes(normalizedSearch)
        )
      )
    : collections
  const matchedTabsCount = normalizedSearch
    ? filteredCollections.reduce(
        (n, c) =>
          n +
          (c.tabs || []).filter((t) =>
            `${t.title} ${t.maskedTitle ?? ""} ${t.url}`
              .toLowerCase()
              .includes(normalizedSearch)
          ).length,
        0
      )
    : totalTabs
  const isDark = theme === "dark" || (theme === "auto" && systemIsDark())
  const pageMaxWidth = windowColumns * 500 + (windowColumns - 1) * 12

  useEffect(() => {
    if (!cursorEnabled) return
    return initSmoothCursor()
  }, [cursorEnabled])

  /* ── Boot ── */
  useEffect(() => {
    chrome.storage.local
      .get([
        "collections",
        FONT_KEY,
        THEME_KEY,
        FONT_SCALE_KEY,
        FONT_WEIGHT_KEY,
        CARD_RADIUS_KEY,
        BEAM_KEY,
        CURSOR_KEY,
        SOUND_KEY,
        COLLECT_MODE_KEY,
        WINDOW_COLUMNS_KEY,
        COLLECTION_COLUMNS_KEY,
        COLLECTION_SPANS_KEY,
        SHOW_SYNCED_TABS_KEY
      ])
      .then((r) => {
        if (r.collections && Array.isArray(r.collections)) {
          const sanitized = r.collections
            .filter((c: any) => c && typeof c === "object")
            .map((c: any) => ({
              ...c,
              tabs: Array.isArray(c.tabs)
                ? c.tabs.filter((t: any) => t && typeof t === "object")
                : []
            }))
          setCollections(sortCollections(sanitized))
        }
        if (r[FONT_KEY]) {
          const opt = ALL_FONTS.find((f) => f.id === r[FONT_KEY]) ?? SYSTEM_FONT
          setFontId(opt.id)
          applyFont(opt)
        }
        if (typeof r[FONT_SCALE_KEY] === "number") {
          const v = clampScale(r[FONT_SCALE_KEY])
          setFontScale(v)
          applyFontScale(v)
        }
        if (typeof r[FONT_WEIGHT_KEY] === "number") {
          const v = clampFontWeight(r[FONT_WEIGHT_KEY])
          setFontWeight(v)
          applyFontWeight(v)
        }
        if (typeof r[CARD_RADIUS_KEY] === "number") {
          const v = clampCardRadius(r[CARD_RADIUS_KEY])
          setCardRadius(v)
          applyCardRadius(v)
        }
        if (r[THEME_KEY]) {
          const t = r[THEME_KEY] as Theme
          setTheme(t)
          applyTheme(t)
        }
        if (typeof r[BEAM_KEY] === "boolean") setBeamEnabled(r[BEAM_KEY])
        setCursorEnabled(
          typeof r[CURSOR_KEY] === "boolean"
            ? r[CURSOR_KEY]
            : CURSOR_DEFAULT
        )
        if (typeof r[SOUND_KEY] === "boolean") setSoundEnabled(r[SOUND_KEY])
        if (r[COLLECT_MODE_KEY] === "all" || r[COLLECT_MODE_KEY] === "current")
          setCollectMode(r[COLLECT_MODE_KEY])
        if (typeof r[WINDOW_COLUMNS_KEY] === "number")
          setWindowColumns(clampWindowColumns(r[WINDOW_COLUMNS_KEY]))
        if (
          r[COLLECTION_COLUMNS_KEY] &&
          typeof r[COLLECTION_COLUMNS_KEY] === "object" &&
          r[COLLECTION_COLUMNS_KEY] !== null
        )
          setCollectionColumns(r[COLLECTION_COLUMNS_KEY])
        if (
          r[COLLECTION_SPANS_KEY] &&
          typeof r[COLLECTION_SPANS_KEY] === "object" &&
          r[COLLECTION_SPANS_KEY] !== null
        )
          setCollectionSpans(r[COLLECTION_SPANS_KEY])
        if (typeof r[SHOW_SYNCED_TABS_KEY] === "boolean")
          setShowSyncedTabs(r[SHOW_SYNCED_TABS_KEY])
      })
      .catch((err) => {
        console.error("[拾页] 异步数据解包异常:", err)
        setCursorEnabled(CURSOR_DEFAULT)
      })
      .finally(() => {
        setLoading(false)
      })

    // 获取同步标签页
    chrome.sessions?.getDevices?.()?.then((devices) => {
      const result: SyncedDevice[] = (devices || [])
        .map((d) => {
          const windows: { tabs: SyncedTab[] }[] = []
          for (const session of d.sessions || []) {
            if (session.window?.tabs) {
              const tabs = session.window.tabs
                .filter((t) => t.url && t.title)
                .map((t) => ({ title: t.title!, url: t.url! }))
              if (tabs.length > 0) windows.push({ tabs })
            } else if (session.tab?.url && session.tab?.title) {
              windows.push({
                tabs: [{ title: session.tab.title, url: session.tab.url }]
              })
            }
          }
          return { deviceName: d.deviceName, windows }
        })
        .filter((d) => d.windows.length > 0)
      setSyncedDevices(result)
    }).catch(() => {})
  }, [])

  /* ── Close top panels on outside click ── */
  useEffect(() => {
    if (!showFontPanel && !showPrefsPanel) return
    const h = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setShowFontPanel(false)
        setShowPrefsPanel(false)
      }
    }
    document.addEventListener("mousedown", h)
    return () => document.removeEventListener("mousedown", h)
  }, [showFontPanel, showPrefsPanel])

  /* ── Quick search shortcut: `/` to focus, `Esc` to clear/close ── */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const inEditable =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)

      if (e.key === "/" && !inEditable && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        searchInputRef.current?.focus()
        return
      }
      if (e.key === "Escape") {
        if (showFontPanel) setShowFontPanel(false)
        if (showPrefsPanel) setShowPrefsPanel(false)
        if (document.activeElement === searchInputRef.current) {
          if (searchQuery) {
            setSearchQuery("")
          } else {
            searchInputRef.current?.blur()
          }
        }
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [showFontPanel, showPrefsPanel, searchQuery])

  useEffect(() => {
    if (!soundEnabled) return
    let lastY = window.scrollY
    let distance = 0
    let direction = 0

    const onScroll = () => {
      const nextY = window.scrollY
      const delta = nextY - lastY
      lastY = nextY
      if (delta === 0) return

      const nextDirection = Math.sign(delta)
      if (direction !== 0 && direction !== nextDirection) distance = 0
      direction = nextDirection
      distance += Math.abs(delta)
      if (distance < 10) return

      distance %= 10
      playScrollGear(delta, true)
    }

    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [soundEnabled])

  /* ── Persist ── */
  const persist = async (updated: Collection[]) => {
    const sorted = sortCollections(updated)
    setCollections(sorted)
    await chrome.storage.local.set({ collections: sorted })
  }

  const toggleTheme = async () => {
    const next: Theme = isDark ? "light" : "dark"
    playSound("toggle", soundEnabled)
    setTheme(next)
    applyTheme(next)
    await chrome.storage.local.set({ [THEME_KEY]: next })
  }

  const toggleBeam = async () => {
    const next = !beamEnabled
    playSound("toggle", soundEnabled)
    setBeamEnabled(next)
    await chrome.storage.local.set({ [BEAM_KEY]: next })
  }

  const toggleCursor = async () => {
    const next = !cursorEnabled
    playSound("toggle", soundEnabled)
    setCursorEnabled(next)
    await chrome.storage.local.set({ [CURSOR_KEY]: next })
  }

  const toggleSound = async () => {
    const next = !soundEnabled
    playSound("toggle", true)
    setSoundEnabled(next)
    await chrome.storage.local.set({ [SOUND_KEY]: next })
  }

  const toggleCollectMode = async () => {
    const next: CollectMode = collectMode === "all" ? "current" : "all"
    playSound("toggle", soundEnabled)
    setCollectMode(next)
    await chrome.storage.local.set({ [COLLECT_MODE_KEY]: next })
  }

  const cycleWindowColumns = async () => {
    const next =
      windowColumns >= WINDOW_COLUMNS_MAX
        ? WINDOW_COLUMNS_MIN
        : windowColumns + 1
    playSound("toggle", soundEnabled)
    setWindowColumns(next)
    await chrome.storage.local.set({ [WINDOW_COLUMNS_KEY]: next })
  }

  const toggleShowSyncedTabs = async () => {
    const next = !showSyncedTabs
    playSound("toggle", soundEnabled)
    setShowSyncedTabs(next)
    await chrome.storage.local.set({ [SHOW_SYNCED_TABS_KEY]: next })
  }

  const getCollectionColumns = (id: string) =>
    clampCollectionColumns(collectionColumns?.[id])

  const toggleCollectionColumns = async (id: string) => {
    const safeCols = collectionColumns || {}
    const next = getCollectionColumns(id) === 1 ? 2 : 1
    const updated = { ...safeCols, [id]: next }
    playSound("toggle", soundEnabled)
    setCollectionColumns(updated)
    await chrome.storage.local.set({ [COLLECTION_COLUMNS_KEY]: updated })
  }

  const getCollectionSpan = (id: string) => {
    return Math.max(1, collectionSpans?.[id] || 1)
  }

  const updateCollectionSpan = async (id: string, span: number) => {
    const safeSpans = { ...(collectionSpans || {}) }
    if (span <= 1) {
      delete safeSpans[id]
    } else {
      safeSpans[id] = span
    }
    playSound("toggle", soundEnabled)
    setCollectionSpans(safeSpans)
    await chrome.storage.local.set({ [COLLECTION_SPANS_KEY]: safeSpans })
  }

  const updateCollectionAppearance = async (
    id: string,
    appearance: CardAppearanceUpdate
  ) => {
    playSound("style", soundEnabled)
    await persist(
      collections.map((collection) => {
        if (collection.id !== id) return collection
        const updated = { ...collection }
        if (appearance.cardStyle) updated.cardStyle = appearance.cardStyle
        if ("backgroundImage" in appearance) {
          if (appearance.backgroundImage)
            updated.backgroundImage = appearance.backgroundImage
          else delete updated.backgroundImage
        }
        if ("cardShader" in appearance) {
          if (appearance.cardShader) updated.cardShader = appearance.cardShader
          else delete updated.cardShader
        }
        return updated
      })
    )
  }

  const selectFont = async (opt: SelectableFont) => {
    playSound("toggle", soundEnabled)
    setFontId(opt.id)
    applyFont(opt)
    await chrome.storage.local.set({ [FONT_KEY]: opt.id })
  }

  const changeFontScale = async (next: number) => {
    const v = clampScale(next)
    playSound("tap", soundEnabled)
    setFontScale(v)
    applyFontScale(v)
    await chrome.storage.local.set({ [FONT_SCALE_KEY]: v })
  }

  const changeFontWeight = async (next: FontWeightValue) => {
    const v = clampFontWeight(next)
    playSound("toggle", soundEnabled)
    setFontWeight(v)
    applyFontWeight(v)
    await chrome.storage.local.set({ [FONT_WEIGHT_KEY]: v })
  }

  const changeCardRadius = async (next: number) => {
    const v = clampCardRadius(next)
    playSound("tap", soundEnabled)
    setCardRadius(v)
    applyCardRadius(v)
    await chrome.storage.local.set({ [CARD_RADIUS_KEY]: v })
  }

  /* ── Tab ops ── */
  const openAllTabs = async (id: string) => {
    const col = collections.find((c) => c.id === id)
    if (!col) return
    playSound("complete", soundEnabled)
    for (const tab of col.tabs) {
      try {
        await chrome.tabs.create({ url: tab.url, active: false })
      } catch {}
    }
    // 窗口加锁：保留卡片及全部链接
    if (col.locked) return

    // 窗口未加锁：保留锁定链接；若全未锁定则删除窗口
    const remainingTabs = col.tabs.filter((t) => t.locked)
    if (remainingTabs.length === 0) {
      await persist(collections.filter((c) => c.id !== id))
    } else {
      await persist(
        collections.map((c) => (c.id === id ? { ...c, tabs: remainingTabs } : c))
      )
    }
  }

  const openSingleTab = async (
    colId: string,
    url: string,
    idx: number
  ): Promise<Point | null> => {
    playSound("open", soundEnabled)
    const col = collections.find((c) => c.id === colId)
    const targetTab = col?.tabs[idx]

    const createPromise = chrome.tabs
      .create({ url, active: false })
      .catch(() => null)

    // 如果链接未锁定，将其从卡片中移除
    if (!targetTab?.locked) {
      await persist(
        collections
          .map((c) => {
            if (c.id !== colId) return c
            return { ...c, tabs: c.tabs.filter((_, i) => i !== idx) }
          })
          .filter((c) => c.locked || c.tabs.length > 0)
      )
    }

    try {
      const created = await createPromise
      if (!created || typeof created.index !== "number") return null
      const tabs = await chrome.tabs.query({ windowId: created.windowId })
      return estimateTabTarget(created.index, tabs.length)
    } catch {
      return null
    }
  }

  const deleteTab = async (colId: string, idx: number) => {
    playSound("delete", soundEnabled)
    await persist(
      collections
        .map((c) => {
          if (c.id !== colId) return c
          return { ...c, tabs: c.tabs.filter((_, i) => i !== idx) }
        })
        .filter((c) => c.locked || c.tabs.length > 0)
    )
  }

  const deleteCollection = async (id: string) => {
    playSound("delete", soundEnabled)
    if (collectionSpans[id]) {
      const safeSpans = { ...collectionSpans }
      delete safeSpans[id]
      setCollectionSpans(safeSpans)
      void chrome.storage.local.set({ [COLLECTION_SPANS_KEY]: safeSpans })
    }
    await persist(collections.filter((c) => c.id !== id))
  }

  const toggleCollectionLock = async (id: string) => {
    playSound("toggle", soundEnabled)
    const now = Date.now()
    await persist(
      collections.map((c) => {
        if (c.id !== id) return c
        const nextLocked = !c.locked
        return {
          ...c,
          locked: nextLocked,
          lockedAt: nextLocked ? now : undefined
        }
      })
    )
  }

  const toggleTabLock = async (colId: string, idx: number) => {
    playSound("toggle", soundEnabled)
    await persist(
      collections.map((c) => {
        if (c.id !== colId) return c
        const newTabs = c.tabs.map((t, i) =>
          i === idx ? { ...t, locked: !t.locked } : t
        )
        return { ...c, tabs: newTabs }
      })
    )
  }

  const toggleTabMaskTitle = async (colId: string, idx: number) => {
    playSound("toggle", soundEnabled)
    await persist(
      collections.map((c) => {
        if (c.id !== colId) return c
        const newTabs = c.tabs.map((t, i) => {
          if (i !== idx) return t
          const nextMasked = t.maskedTitle
            ? undefined
            : getRandomMaskedTitle(t.title)
          return { ...t, maskedTitle: nextMasked }
        })
        return { ...c, tabs: newTabs }
      })
    )
  }

  const sortCollectionByDomain = async (
    id: string,
    order: DomainSortOrder
  ) => {
    playSound("tap", soundEnabled)
    await persist(
      collections.map((c) =>
        c.id === id ? { ...c, tabs: sortTabsByDomain(c.tabs, order) } : c
      )
    )
  }

  const moveTab = async (
    sourceColId: string,
    sourceIndex: number,
    targetColId: string,
    targetIndex: number
  ) => {
    const source = collections.find((c) => c.id === sourceColId)
    const target = collections.find((c) => c.id === targetColId)
    const tab = source?.tabs[sourceIndex]
    if (!source || !target || !tab) return

    if (sourceColId === targetColId) {
      const tabs = [...source.tabs]
      tabs.splice(sourceIndex, 1)
      const insertIndex =
        sourceIndex < targetIndex
          ? Math.max(0, targetIndex - 1)
          : Math.max(0, targetIndex)
      tabs.splice(Math.min(insertIndex, tabs.length), 0, tab)

      await persist(
        collections.map((c) => (c.id === sourceColId ? { ...c, tabs } : c))
      )
      playSound("drop", soundEnabled)
      return
    }

    const updated = collections
      .map((c) => {
        if (c.id === sourceColId) {
          return { ...c, tabs: c.tabs.filter((_, i) => i !== sourceIndex) }
        }
        if (c.id === targetColId) {
          const tabs = [...c.tabs]
          tabs.splice(Math.min(targetIndex, tabs.length), 0, tab)
          return { ...c, tabs }
        }
        return c
      })
      .filter((c) => c.tabs.length > 0)

    await persist(updated)
    playSound("drop", soundEnabled)
  }

  const startTabDrag = (
    colId: string,
    index: number,
    e: React.DragEvent
  ) => {
    const payload = { colId, index }
    playSound("lift", soundEnabled)
    setDraggingTab(payload)
    e.dataTransfer.effectAllowed = "move"
    e.dataTransfer.setData(TAB_DRAG_MIME, JSON.stringify(payload))
    e.dataTransfer.setData("text/plain", "tab")
  }

  const endTabDrag = () => setDraggingTab(null)

  const dropTab = async (
    targetColId: string,
    targetIndex: number,
    e: React.DragEvent
  ) => {
    e.preventDefault()
    const payload =
      draggingTab ??
      (() => {
        try {
          return JSON.parse(e.dataTransfer.getData(TAB_DRAG_MIME)) as DraggedTab
        } catch {
          return null
        }
      })()
    setDraggingTab(null)
    if (!payload) return
    await moveTab(payload.colId, payload.index, targetColId, targetIndex)
  }

  const splitCollection = async (id: string) => {
    const source = collections.find((c) => c.id === id)
    if (!source || source.tabs.length <= SPLIT_THRESHOLD) return
    playSound("split", soundEnabled)

    const split = splitCollectionIntoTwo(source)
    const splitIds = split.map((c) => c.id)
    setSplitAnimatingIds((prev) => new Set([...prev, ...splitIds]))

    await persist(
      collections.flatMap((c) => (c.id === id ? split : [c]))
    )

    window.setTimeout(() => {
      setSplitAnimatingIds((prev) => {
        const next = new Set(prev)
        splitIds.forEach((splitId) => next.delete(splitId))
        return next
      })
    }, 720)
  }

  const gatherToCollection = async (targetId: string, sourceId?: string) => {
    const target = collections.find((c) => c.id === targetId)
    if (!target) return
    playSound("merge", soundEnabled)

    if (sourceId) {
      // Gather from a single source
      const source = collections.find((c) => c.id === sourceId)
      if (!source) return
      const newTarget = {
        ...target,
        tabs: [...target.tabs, ...source.tabs]
      }
      await persist(
        collections
          .map((c) => (c.id === targetId ? newTarget : c))
          .filter((c) => c.id !== sourceId)
      )
    } else {
      // Gather all others
      const others = collections.filter((c) => c.id !== targetId)
      const allOtherTabs = others.flatMap((c) => c.tabs)
      const newTarget = {
        ...target,
        tabs: [...target.tabs, ...allOtherTabs]
      }
      await persist([newTarget])
    }
  }

  const mergeCollectionTo = async (sourceId: string, targetId: string) => {
    const source = collections.find((c) => c.id === sourceId)
    const target = collections.find((c) => c.id === targetId)
    if (!source || !target) return
    playSound("merge", soundEnabled)

    const newTarget = {
      ...target,
      tabs: [...target.tabs, ...source.tabs]
    }

    await persist(
      collections
        .map((c) => {
          if (c.id === targetId) return newTarget
          return c
        })
        .filter((c) => c.id !== sourceId)
    )
  }

  const clearAll = async () => {
    const hasLocked = collections.some(
      (c) => c.locked || c.tabs.some((t) => t.locked)
    )
    if (
      !confirm(
        `确定要删除 ${hasLocked ? "所有未锁定" : "全部"} ${collections.length} 条收集记录吗？`
      )
    )
      return
    if (!confirm(`二次确认：确认清空？`)) return
    playSound("delete", soundEnabled)
    const remaining = collections
      .filter((c) => c.locked || c.tabs.some((t) => t.locked))
      .map((c) => (c.locked ? c : { ...c, tabs: c.tabs.filter((t) => t.locked) }))
    await persist(remaining)
  }

  /* ── Export / Import ── */
  const importFileRef = useRef<HTMLInputElement>(null)

  const exportData = () => {
    const data = collections.map((c) => ({
      locked: c.locked,
      tabs: c.tabs.map((t) => ({
        title: t.title,
        url: t.url,
        locked: t.locked,
        maskedTitle: t.maskedTitle
      }))
    }))
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json"
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `shiye-tabs-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const importData = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      if (!Array.isArray(data)) throw new Error("invalid")
      const newCollections: Collection[] = data.map((item: any) => {
        const isGroupArray = Array.isArray(item)
        const tabsData = isGroupArray ? item : item.tabs || []
        return {
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          locked: isGroupArray ? false : Boolean(item.locked),
          tabs: (Array.isArray(tabsData) ? tabsData : []).map((t: any) => ({
            title: String(t.title || ""),
            url: String(t.url || ""),
            locked: Boolean(t.locked),
            maskedTitle:
              typeof t.maskedTitle === "string" && t.maskedTitle
                ? t.maskedTitle
                : undefined
          }))
        }
      })
      await persist([
        ...collections,
        ...newCollections.filter((c) => c.tabs.length > 0)
      ])
      playSound("merge", soundEnabled)
    } catch {
      alert("导入失败：文件格式不正确")
    }
    // reset so same file can be re-imported
    e.target.value = ""
  }

  const openGuidePage = () => {
    chrome.tabs.create({
      url: chrome.runtime.getURL("tabs/guide.html"),
      active: true
    })
  }

  /* ── Render ── */
  return (
    <div className="sy-shell">
      {/* ── Floating Island Nav ── */}
      <div className="sy-nav-wrap">
        <div
          ref={navRef}
          className="sy-nav-island"
          style={{ maxWidth: pageMaxWidth }}>
          {/* Left: Brand + live stats */}
          <div className="sy-brand">
            <div className="sy-brand-mark" aria-hidden="true">
              <i className="ri-bookmark-3-fill"></i>
            </div>
            <div>
              <div className="sy-brand-title">拾页</div>
              <div className="sy-brand-meta">
                {normalizedSearch
                  ? `匹配 ${filteredCollections.length} 组 · ${matchedTabsCount} 页`
                  : `${collections.length} 组 · ${totalTabs} 页`}
              </div>
            </div>
          </div>

          {/* Center: Instant search */}
          <div className="sy-search-box">
            <i className="ri-search-line sy-search-icon" />
            <input
              ref={searchInputRef}
              type="text"
              className="sy-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索标签标题或域名…"
              aria-label="搜索标签"
            />
            {searchQuery ? (
              <button
                type="button"
                className="sy-search-clear"
                onClick={() => setSearchQuery("")}
                title="清空搜索 (Esc)">
                <i className="ri-close-line" />
              </button>
            ) : (
              <span className="sy-search-kbd" title="按 / 快速搜索">
                /
              </span>
            )}
          </div>

          {/* Right: Grouped controls */}
          <div className="sy-toolbar">
            <NavBtn
              onClick={cycleWindowColumns}
              title={`窗口列数：${windowColumns} 列，点击切换`}
              active={windowColumns !== WINDOW_COLUMNS_DEFAULT}>
              <span style={{ fontSize: 12, fontWeight: 700 }}>
                {windowColumns}
              </span>
            </NavBtn>
            <NavBtn
              onClick={toggleShowSyncedTabs}
              title={showSyncedTabs ? "隐藏其他设备同步标签" : "显示其他设备同步标签"}
              active={showSyncedTabs}>
              <i
                className={
                  showSyncedTabs ? "ri-device-fill" : "ri-device-line"
                }></i>
            </NavBtn>

            <span className="sy-nav-sep" />

            <NavBtn
              onClick={toggleTheme}
              title={isDark ? "切换亮色" : "切换深色"}>
              <i className={isDark ? "ri-haze-fill" : "ri-moon-foggy-fill"}></i>
            </NavBtn>
            <NavBtn
              onClick={() => {
                setShowPrefsPanel(false)
                setShowFontPanel((v) => !v)
              }}
              title="外观与字体"
              active={showFontPanel}>
              <i className="ri-font-serif"></i>
            </NavBtn>
            <NavBtn
              onClick={() => {
                setShowFontPanel(false)
                setShowPrefsPanel((v) => !v)
              }}
              title="交互与收集偏好"
              active={showPrefsPanel}>
              <i className="ri-equalizer-line"></i>
            </NavBtn>

            <span className="sy-nav-sep" />

            {!loading && collections.length > 0 && (
              <NavBtn onClick={exportData} title="导出全部">
                <i className="ri-download-2-line" style={{ fontSize: 14 }}></i>
              </NavBtn>
            )}
            <NavBtn onClick={() => importFileRef.current?.click()} title="导入">
              <i className="ri-upload-2-line" style={{ fontSize: 14 }}></i>
            </NavBtn>
            <input
              ref={importFileRef}
              type="file"
              accept=".json"
              style={{ display: "none" }}
              onChange={importData}
            />
            {!loading && collections.length > 0 && (
              <NavBtn onClick={clearAll} title="清空全部" danger>
                <i className="ri-delete-bin-6-line" style={{ fontSize: 14 }}></i>
              </NavBtn>
            )}
          </div>

          {/* Font panel */}
          {showFontPanel && (
            <FontPicker
              activeId={fontId}
              scale={fontScale}
              weight={fontWeight}
              radius={cardRadius}
              onSelectFont={selectFont}
              onScaleChange={changeFontScale}
              onWeightChange={changeFontWeight}
              onRadiusChange={changeCardRadius}
            />
          )}

          {/* Preferences popover */}
          {showPrefsPanel && (
            <div className="sy-prefs-panel">
              <div className="sy-prefs-header">
                <span style={{ fontSize: 12.5, fontWeight: 600 }}>偏好设置</span>
                <span style={{ fontSize: 11, color: "var(--text3)" }}>即时生效</span>
              </div>

              <button type="button" className="sy-prefs-row" onClick={toggleBeam}>
                <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
                  <i className={beamEnabled ? "ri-flashlight-fill" : "ri-flashlight-line"} style={{ color: beamEnabled ? "var(--accent)" : "var(--text3)" }} />
                  <span>打开标签光束动画</span>
                </span>
                <span className={`sy-switch${beamEnabled ? " is-on" : ""}`} />
              </button>

              <button type="button" className="sy-prefs-row" onClick={toggleCursor}>
                <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
                  <i className={cursorEnabled ? "ri-cursor-fill" : "ri-cursor-line"} style={{ color: cursorEnabled ? "var(--accent)" : "var(--text3)" }} />
                  <span>自定义丝滑光标</span>
                </span>
                <span className={`sy-switch${cursorEnabled ? " is-on" : ""}`} />
              </button>

              <button type="button" className="sy-prefs-row" onClick={toggleSound}>
                <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
                  <i className={soundEnabled ? "ri-volume-up-fill" : "ri-volume-mute-line"} style={{ color: soundEnabled ? "var(--accent)" : "var(--text3)" }} />
                  <span>交互与滚动音效</span>
                </span>
                <span className={`sy-switch${soundEnabled ? " is-on" : ""}`} />
              </button>

              <button type="button" className="sy-prefs-row" onClick={toggleCollectMode}>
                <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
                  <i className={collectMode === "all" ? "ri-stack-fill" : "ri-window-fill"} style={{ color: "var(--accent)" }} />
                  <span>收集范围</span>
                </span>
                <span style={{ fontSize: 11.5, color: "var(--text2)", fontWeight: 600 }}>
                  {collectMode === "all" ? "所有窗口" : "仅当前窗口"}
                </span>
              </button>

              <div style={{ height: 1, background: "var(--border)", margin: "2px 0" }} />

              <button type="button" className="sy-prefs-row" onClick={openGuidePage}>
                <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--text2)" }}>
                  <i className="ri-compass-3-line" />
                  <span>查看动态使用引导</span>
                </span>
                <i className="ri-arrow-right-up-line" style={{ fontSize: 13, color: "var(--text3)" }} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Content ── */}
      <div
        style={{
          maxWidth: pageMaxWidth,
          margin: "0 auto",
          padding: "14px 24px 64px"
        }}>
        {loading && (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              paddingTop: 80
            }}>
            <div
              style={{
                width: 20,
                height: 20,
                borderRadius: "50%",
                border: "2px solid var(--border2)",
                borderTopColor: "var(--accent)",
                animation: "spin .8s linear infinite"
              }}
            />
          </div>
        )}

        {!loading && collections.length === 0 && (
          <div className="sy-empty-card">
            <div className="sy-empty-icon">
              <i className="ri-bookmark-3-line"></i>
            </div>
            <div
              style={{
                fontSize: fs(17),
                fontWeight: "var(--fw-strong)",
                color: "var(--text)",
                marginBottom: 8
              }}>
              书案暂空，静候拾页
            </div>
            <div
              style={{
                fontSize: fs(13),
                fontWeight: "var(--fw)",
                color: "var(--text2)",
                lineHeight: 1.65,
                marginBottom: 20
              }}>
              点击浏览器工具栏中的「拾页」图标，即可将当前打开的标签页一键归档成整洁卡片。
            </div>
            <div style={{ display: "flex", justifyContent: "center", gap: 10 }}>
              <button
                type="button"
                className="sy-restore-pill"
                style={{ height: 34, padding: "0 14px", fontSize: 12.5 }}
                onClick={openGuidePage}>
                <i className="ri-play-circle-line" style={{ fontSize: 14 }} />
                <span>查看动态引导</span>
              </button>
              <button
                type="button"
                onClick={() => importFileRef.current?.click()}
                style={{
                  height: 34,
                  padding: "0 14px",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--bg)",
                  color: "var(--text2)",
                  fontSize: 12.5,
                  fontWeight: 500,
                  cursor: "pointer",
                  fontFamily: "var(--font)"
                }}>
                导入备份
              </button>
            </div>
          </div>
        )}

        {!loading && collections.length > 0 && filteredCollections.length === 0 && (
          <div className="sy-empty-card">
            <div className="sy-empty-icon">
              <i className="ri-search-line"></i>
            </div>
            <div
              style={{
                fontSize: fs(16),
                fontWeight: "var(--fw-strong)",
                color: "var(--text)",
                marginBottom: 6
              }}>
              未找到匹配「{searchQuery}」的标签
            </div>
            <div style={{ fontSize: fs(13), color: "var(--text3)", marginBottom: 18 }}>
              试试更换关键词，或清空搜索查看全部 {totalTabs} 个标签页
            </div>
            <button
              type="button"
              className="sy-restore-pill"
              style={{ height: 34, padding: "0 16px", fontSize: 12.5 }}
              onClick={() => setSearchQuery("")}>
              清空搜索
            </button>
          </div>
        )}

        {!loading && filteredCollections.length > 0 && (
          <div
            className="sy-collections-grid"
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${windowColumns}, minmax(0, 1fr))`,
              gap: 14,
              alignItems: "start"
            }}>
            {filteredCollections.map((col) => {
              const currentSpan = Math.min(
                getCollectionSpan(col.id),
                windowColumns
              )
              return (
                <div
                  key={col.id}
                  style={{
                    gridColumn:
                      currentSpan > 1 ? `span ${currentSpan}` : undefined,
                    minWidth: 0,
                    transition: "grid-column var(--dur) var(--ease)"
                  }}>
                  <CollectionCard
                    collection={col}
                    searchQuery={searchQuery}
                    currentSpan={currentSpan}
                    maxSpan={windowColumns}
                    onResizeSpan={(newSpan) =>
                      updateCollectionSpan(col.id, newSpan)
                    }
                    onResetSpan={() => updateCollectionSpan(col.id, 1)}
                    otherCollections={collections.filter((c) => c.id !== col.id)}
                    beamEnabled={beamEnabled}
                    soundEnabled={soundEnabled}
                    splitAnimating={splitAnimatingIds.has(col.id)}
                    draggingTab={draggingTab}
                    linkColumns={getCollectionColumns(col.id)}
                    onOpenAll={() => openAllTabs(col.id)}
                    onOpenTab={(url, idx) => openSingleTab(col.id, url, idx)}
                    onDeleteTab={(idx) => deleteTab(col.id, idx)}
                    onDelete={() => deleteCollection(col.id)}
                    onSortByDomain={(order) =>
                      sortCollectionByDomain(col.id, order)
                    }
                    onToggleLinkColumns={() => toggleCollectionColumns(col.id)}
                    onSplit={() => splitCollection(col.id)}
                    onTabDragStart={startTabDrag}
                    onTabDragEnd={endTabDrag}
                    onTabDrop={dropTab}
                    onGather={(sourceId) =>
                      gatherToCollection(col.id, sourceId)
                    }
                    onMergeTo={(targetId) =>
                      mergeCollectionTo(col.id, targetId)
                    }
                    onToggleLock={() => toggleCollectionLock(col.id)}
                    onToggleTabLock={(idx) => toggleTabLock(col.id, idx)}
                    onToggleTabMaskTitle={(idx) =>
                      toggleTabMaskTitle(col.id, idx)
                    }
                    onAppearanceChange={(appearance) =>
                      updateCollectionAppearance(col.id, appearance)
                    }
                  />
                </div>
              )
            })}
          </div>
        )}

        {/* ── Synced Tabs ── */}
        {!loading && showSyncedTabs && syncedDevices.length > 0 && (
          <>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                margin: collections.length > 0 ? "32px 0 16px" : "0 0 16px",
              }}>
              <i
                className="ri-device-line"
                style={{ fontSize: 16, color: "var(--text3)" }}
              />
              <span
                style={{
                  fontSize: fs(14),
                  fontWeight: "var(--fw-strong)",
                  color: "var(--text2)"
                }}>
                其他设备
              </span>
              <div
                style={{
                  flex: 1,
                  height: 1,
                  background: "var(--border)"
                }}
              />
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${windowColumns}, minmax(0, 1fr))`,
                gap: 12,
                alignItems: "start"
              }}>
              {syncedDevices.flatMap((device) =>
                device.windows.map((win, wi) => (
                  <div key={`${device.deviceName}-${wi}`} style={{ minWidth: 0 }}>
                    <SyncedTabsCard
                      device={device.deviceName}
                      windowIndex={device.windows.length > 1 ? wi : 0}
                      tabs={win.tabs}
                      beamEnabled={beamEnabled}
                      soundEnabled={soundEnabled}
                    />
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

export default CollectionPage
