import { useEffect, useRef, useState } from "react"

import {
  GrainGradient,
  MeshGradient,
  NeuroNoise,
  Waves
} from "@paper-design/shaders-react"

import "remixicon/fonts/remixicon.css"
import "../contents/link-hints"
import "../style.css"

import { estimateTabTarget, playTabBeam, type Point } from "./beam"
import { WEB_FONTS } from "./fonts"
import { playScrollGear, playSound } from "./sounds"

/* ── Types ──────────────────────────────────────────────────── */
type Theme = "light" | "dark" | "auto"
type DomainSortOrder = "asc" | "desc"
type CardStyle = "classic" | "paper" | "glass" | "noir" | "aurora"
type CardShader = "mesh" | "neuro" | "grain" | "waves"

interface DraggedTab {
  colId: string
  index: number
}

interface TabInfo {
  title: string
  url: string
}

interface Collection {
  id: string
  timestamp: number
  tabs: TabInfo[]
  windowLabel?: string
  cardStyle?: CardStyle
  backgroundImage?: string
  cardShader?: CardShader
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
const BEAM_KEY = "shiye-beam-enabled"
const SOUND_KEY = "shiye-sound-enabled"
const COLLECT_MODE_KEY = "shiye-collect-mode"
const WINDOW_COLUMNS_KEY = "shiye-window-columns"
const COLLECTION_COLUMNS_KEY = "shiye-collection-columns"
const TAB_DRAG_MIME = "application/x-shiye-tab"
type CollectMode = "all" | "current"

const CARD_STYLES: Array<{
  id: CardStyle
  name: string
  description: string
}> = [
  { id: "classic", name: "清简", description: "干净克制" },
  { id: "paper", name: "纸感", description: "温润自然" },
  { id: "glass", name: "雾玻璃", description: "轻盈通透" },
  { id: "noir", name: "夜幕", description: "深邃沉静" },
  { id: "aurora", name: "流光", description: "柔和灵动" }
]

const CARD_SHADERS: Array<{
  id: CardShader
  name: string
  description: string
}> = [
  { id: "mesh", name: "暮色织网", description: "柔和流动的网格渐变" },
  { id: "neuro", name: "神经微光", description: "有机呼吸的噪声光影" },
  { id: "grain", name: "颗粒潮汐", description: "带纸张颗粒的色彩潮汐" },
  { id: "waves", name: "静谧波纹", description: "克制而有秩序的波浪" }
]

/** 打开标签时的光束动画默认开启 */
const BEAM_DEFAULT = true
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
  return CARD_SHADERS.some((shader) => shader.id === value)
    ? (value as CardShader)
    : null
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

function CardShaderBackground({ shader }: { shader: CardShader }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [reduceMotion, setReduceMotion] = useState(() =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  )

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

  const common = {
    className: "kt-paper-shader-canvas",
    width: "100%",
    height: "100%",
    minPixelRatio: 1,
    maxPixelCount: 480000,
    webGlContextAttributes: {
      alpha: false,
      antialias: false,
      powerPreference: "low-power" as WebGLPowerPreference
    }
  }
  const speed = reduceMotion ? 0 : 0.18

  return (
    <div
      ref={containerRef}
      className="kt-paper-shader"
      data-shader={shader}>
      {visible && shader === "mesh" && (
        <MeshGradient
          {...common}
          colors={["#101827", "#275769", "#b86f55", "#e6b56d"]}
          distortion={0.82}
          swirl={0.42}
          grainMixer={0.22}
          grainOverlay={0.16}
          speed={speed}
        />
      )}
      {visible && shader === "neuro" && (
        <NeuroNoise
          {...common}
          colorFront="#dce7ff"
          colorMid="#776bb4"
          colorBack="#111827"
          brightness={0.08}
          contrast={0.34}
          scale={1.45}
          speed={speed * 0.8}
        />
      )}
      {visible && shader === "grain" && (
        <GrainGradient
          {...common}
          colorBack="#142b2a"
          colors={["#e8b86d", "#3d8b79", "#725f9e"]}
          softness={0.68}
          intensity={0.48}
          noise={0.34}
          shape="blob"
          scale={0.9}
          speed={speed * 0.7}
        />
      )}
      {visible && shader === "waves" && (
        <Waves
          {...common}
          colorFront="#ece5d4"
          colorBack="#17343b"
          shape={2.07}
          frequency={0.44}
          amplitude={0.57}
          spacing={1.05}
          proportion={0.75}
          softness={0.12}
          scale={0.52}
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
  return 92 + Math.ceil(collection.tabs.length / linkColumns) * 32
}

function distributeCollections(
  collections: Collection[],
  columnCount: number,
  collectionColumns: Record<string, number>
) {
  const columns = Array.from({ length: columnCount }, () => [] as Collection[])
  const heights = Array.from({ length: columnCount }, () => 0)

  collections.forEach((collection) => {
    const target = heights.indexOf(Math.min(...heights))
    columns[target].push(collection)
    heights[target] += estimateCollectionHeight(
      collection,
      clampCollectionColumns(collectionColumns[collection.id])
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

/* ── TabItem — compact grid cell ────────────────────────────── */
function TabItem({
  tab,
  beamEnabled,
  dragging,
  onOpen,
  onDelete,
  onDragStart,
  onDragEnd,
  onDrop
}: {
  tab: TabInfo
  /** 是否在打开标签时播放光束动画 */
  beamEnabled: boolean
  dragging: boolean
  /** 触发打开；返回真实落点的 Promise（标签创建后才确定），供光束飞向其位置 */
  onOpen: () => Promise<Point | null> | void
  onDelete: () => void
  onDragStart: (e: React.DragEvent) => void
  onDragEnd: () => void
  onDrop: (e: React.DragEvent) => void
}) {
  const [h, setH] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const rowRef = useRef<HTMLDivElement>(null)
  const favicon = getFavicon(tab.url)

  // 先读取当前行位置作为起点，再触发打开 —— onOpen 会把该标签移出收集卡、
  // 导致此行卸载，故必须在调用前读取坐标。落点由 onOpen 异步返回。
  const handleOpen = () => {
    const el = rowRef.current
    const rect = el ? el.getBoundingClientRect() : null
    const result = onOpen()
    // 关闭动画时仅执行打开逻辑，不发射光束
    if (!beamEnabled || !rect) return
    const origin: Point = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    }
    const target =
      result && typeof (result as { then?: unknown }).then === "function"
        ? (result as Promise<Point | null>)
        : undefined
    playTabBeam(origin, target)
  }

  return (
    <div
      ref={rowRef}
      title={tab.url}
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
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "7px 10px",
        borderRadius: 7,
        background: dragOver ? "var(--accent-bg)" : h ? "var(--bg2)" : "transparent",
        outline: dragOver ? "1px dashed var(--accent)" : "none",
        opacity: dragging ? 0.42 : 1,
        transition: "background var(--dur) var(--ease), opacity var(--dur) var(--ease)",
        cursor: dragging ? "grabbing" : "grab",
        minWidth: 0
      }}>
      {/* Favicon */}
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

      {/* Title */}
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
        {tab.title}
      </span>

      {/* Actions — visible on row hover */}
      <div
        style={{
          display: "flex",
          gap: 2,
          flexShrink: 0,
          opacity: h ? 1 : 0,
          transition: "opacity var(--dur) var(--ease)"
        }}>
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
  splitAnimating,
  draggingTab,
  linkColumns,
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
  onAppearanceChange
}: {
  collection: Collection
  otherCollections: Collection[]
  beamEnabled: boolean
  splitAnimating: boolean
  draggingTab: DraggedTab | null
  linkColumns: number
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
  onGather: () => void
  onMergeTo: (targetId: string) => void
  onAppearanceChange: (appearance: CardAppearanceUpdate) => Promise<void>
}) {
  const [hCard, setHCard] = useState(false)
  const [showMergeMenu, setShowMergeMenu] = useState(false)
  const [showAppearancePanel, setShowAppearancePanel] = useState(false)
  const [backgroundDraft, setBackgroundDraft] = useState(() =>
    collection.backgroundImage?.startsWith("data:")
      ? ""
      : (collection.backgroundImage ?? "")
  )
  const [backgroundError, setBackgroundError] = useState(false)
  const [uploadingBackground, setUploadingBackground] = useState(false)
  const [uploadError, setUploadError] = useState("")
  const mergeMenuRef = useRef<HTMLDivElement>(null)
  const appearanceRef = useRef<HTMLDivElement>(null)

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
    setBackgroundDraft(
      collection.backgroundImage?.startsWith("data:")
        ? ""
        : (collection.backgroundImage ?? "")
    )
  }, [collection.backgroundImage])

  useEffect(() => {
    if (!showAppearancePanel) return
    const h = (e: MouseEvent) => {
      if (
        appearanceRef.current &&
        !appearanceRef.current.contains(e.target as Node)
      )
        setShowAppearancePanel(false)
    }
    document.addEventListener("mousedown", h)
    return () => document.removeEventListener("mousedown", h)
  }, [showAppearancePanel])

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

  const cardStyle = collection.cardStyle ?? "classic"
  const hasCustomBackground = Boolean(collection.backgroundImage)
  const cardShader = normalizeCardShader(collection.cardShader)
  const appearanceMode = cardShader
    ? "shader"
    : hasCustomBackground
      ? "image"
      : "theme"

  return (
    <div
      className={`kt-collection-card${splitAnimating ? " kt-card-split-born" : ""}`}
      data-card-style={appearanceMode === "theme" ? cardStyle : undefined}
      data-card-mode={appearanceMode}
      onMouseEnter={() => setHCard(true)}
      onMouseLeave={() => setHCard(false)}
      style={{
        position: "relative",
        zIndex: showMergeMenu || showAppearancePanel ? 100 : 1,
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r)",
        boxShadow: hCard ? "var(--shadow-m)" : "var(--shadow-s)",
        transition:
          "box-shadow var(--dur) var(--ease), transform var(--dur) var(--ease)",
        transform: hCard ? "translateY(-1px)" : "translateY(0)"
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
          flexWrap: "wrap",
          padding: "12px 16px",
          borderBottom: "1px solid var(--border)",
          gap: 8,
          borderTopLeftRadius: "calc(var(--r) - 1px)",
          borderTopRightRadius: "calc(var(--r) - 1px)"
        }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
            flex: 1,
            minWidth: 150
          }}>
          <span
            style={{
              fontSize: fs(12),
              fontWeight: "var(--fw)",
              color: "var(--text3)"
            }}>
            {collection.tabs.length} 个标签页
          </span>
          <span
            style={{
              fontSize: fs(14.5),
              fontWeight: "var(--fw-strong)",
              color: "var(--text)",
              flexShrink: 0,
              letterSpacing: "-.01em"
            }}>
            {formatDate(collection.timestamp)}
          </span>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 4, marginRight: 4 }}>
          <div style={{ position: "relative" }} ref={appearanceRef}>
            <IconBtn
              onClick={() => setShowAppearancePanel((value) => !value)}
              title="卡片外观">
              <i className="ri-palette-line"></i>
            </IconBtn>
            {showAppearancePanel && (
              <div className="kt-appearance-panel">
                <div className="kt-appearance-title">
                  <span>卡片外观</span>
                  <span>主题与背景互斥</span>
                </div>
                <div className="kt-background-label">主题</div>
                <div className="kt-style-grid">
                  {CARD_STYLES.map((style) => (
                    <button
                      key={style.id}
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

                <div className="kt-appearance-divider" />
                <div className="kt-background-label">Shader 背景</div>
                <div className="kt-shader-grid">
                  {CARD_SHADERS.map((shader) => (
                    <button
                      key={shader.id}
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
                        data-shader-preview={shader.id}
                      />
                      <span>{shader.name}</span>
                    </button>
                  ))}
                </div>
                <a
                  className="kt-paper-credit"
                  href="https://shaders.paper.design"
                  target="_blank"
                  rel="noreferrer">
                  Powered by Paper Shaders
                </a>

                <div className="kt-background-label">图片背景</div>
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
                  <button onClick={applyBackground}>应用</button>
                </div>
                {backgroundError && (
                  <div className="kt-background-error">请输入有效的 http(s) 图片地址</div>
                )}
                {appearanceMode === "image" && (
                  <button
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
                {appearanceMode === "shader" && (
                  <button
                    className="kt-background-clear"
                    onClick={() => onAppearanceChange({ cardShader: null })}>
                    停用 Shader，恢复主题
                  </button>
                )}
              </div>
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
        </div>
        {otherCollections.length > 0 && (
          <div style={{ display: "flex", gap: 4, marginRight: 4 }}>
            <button
              title="归集：将其他所有卡片的标签页合并到当前卡片"
              onClick={onGather}
              style={{
                width: 24,
                height: 24,
                padding: 0,
                background: "transparent",
                color: "var(--text3)",
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
                el.style.background = "var(--bg3)"
                el.style.color = "var(--text)"
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLButtonElement
                el.style.background = "transparent"
                el.style.color = "var(--text3)"
              }}>
              <i className="ri-game-line"></i>
            </button>
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
                <div
                  className="kt-merge-menu"
                  style={{
                    position: "absolute",
                    top: "100%",
                    right: 0,
                    marginTop: 4,
                    border: "1px solid var(--border)",
                    borderRadius: "var(--r)",
                    boxShadow: "var(--shadow-m)",
                    padding: 4,
                    minWidth: 160,
                    zIndex: 10,
                    maxHeight: 200,
                    overflowY: "auto"
                  }}>
                  <div
                    style={{
                      padding: "4px 8px",
                      fontSize: 11,
                      color: "var(--text3)",
                      fontWeight: 500
                    }}>
                    合并到...
                  </div>
                  {otherCollections.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => {
                        onMergeTo(c.id)
                        setShowMergeMenu(false)
                      }}
                      style={{
                        display: "block",
                        width: "100%",
                        textAlign: "left",
                        padding: "6px 8px",
                        background: "transparent",
                        border: "none",
                        borderRadius: 4,
                        fontSize: 12,
                        color: "var(--text)",
                        cursor: "pointer",
                        transition: "background var(--dur) var(--ease)"
                      }}
                      onMouseEnter={(e) => {
                        ;(
                          e.currentTarget as HTMLButtonElement
                        ).style.background = "var(--bg2)"
                      }}
                      onMouseLeave={(e) => {
                        ;(
                          e.currentTarget as HTMLButtonElement
                        ).style.background = "transparent"
                      }}>
                      {formatDate(c.timestamp)} ({c.tabs.length}个)
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
        <button
          onClick={onOpenAll}
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
            justifyContent: "center",
            gap: 0
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
        <button
          onClick={onDelete}
          style={{
            width: 32,
            height: 32,
            padding: 0,
            background: "transparent",
            color: "var(--text3)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r-s)",
            fontSize: fs(12.5),
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "var(--font)",
            flexShrink: 0,
            transition: "all var(--dur) var(--ease)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 0
          }}
          onMouseEnter={(e) => {
            const el = e.currentTarget as HTMLButtonElement
            el.style.background = "var(--bg3)"
            el.style.borderColor = "var(--border2)"
            el.style.color = "var(--text2)"
          }}
          onMouseLeave={(e) => {
            const el = e.currentTarget as HTMLButtonElement
            el.style.background = "transparent"
            el.style.borderColor = "var(--border)"
            el.style.color = "var(--text3)"
          }}>
          <i className="ri-delete-bin-line"></i>
        </button>
      </div>

      {/* ── Tab list ── */}
      <div
        className="kt-card-list"
        onDragOver={(e) => {
          e.preventDefault()
          e.dataTransfer.dropEffect = "move"
        }}
        onDrop={(e) => onTabDrop(collection.id, collection.tabs.length, e)}
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${linkColumns}, minmax(0, 1fr))`,
          gap: 2,
          padding: "8px 8px"
        }}>
        {collection.tabs.map((tab, index) => (
          <TabItem
            key={`${tab.url}-${index}`}
            tab={tab}
            beamEnabled={beamEnabled}
            dragging={
              draggingTab?.colId === collection.id && draggingTab.index === index
            }
            onOpen={() => onOpenTab(tab.url, index)}
            onDelete={() => onDeleteTab(index)}
            onDragStart={(e) => onTabDragStart(collection.id, index, e)}
            onDragEnd={onTabDragEnd}
            onDrop={(e) => onTabDrop(collection.id, index, e)}
          />
        ))}
      </div>
    </div>
  )
}

/* ── Header icon button helper ───────────────────────────────── */
function NavBtn({
  children,
  onClick,
  title,
  active = false
}: {
  children: React.ReactNode
  onClick: () => void
  title?: string
  active?: boolean
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
          : h
            ? "var(--bg2)"
            : "transparent",
        color: active ? "var(--accent)" : h ? "var(--text)" : "var(--text3)",
        border: `1px solid ${active ? "rgba(217,119,86,.2)" : h ? "var(--border2)" : "var(--border)"}`,
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
  onSelectFont,
  onScaleChange,
  onWeightChange
}: {
  activeId: string
  scale: number
  weight: FontWeightValue
  onSelectFont: (font: SelectableFont) => void
  onScaleChange: (next: number) => void
  onWeightChange: (next: FontWeightValue) => void
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
  const [loading, setLoading] = useState(true)
  const [fontId, setFontId] = useState("system")
  const [fontScale, setFontScale] = useState(SCALE_DEFAULT)
  const [fontWeight, setFontWeight] = useState<FontWeightValue>(WEIGHT_DEFAULT)
  const [showFontPanel, setShowFontPanel] = useState(false)
  const [theme, setTheme] = useState<Theme>("auto")
  const [beamEnabled, setBeamEnabled] = useState(BEAM_DEFAULT)
  const [soundEnabled, setSoundEnabled] = useState(SOUND_DEFAULT)
  const [collectMode, setCollectMode] = useState<CollectMode>("all")
  const [windowColumns, setWindowColumns] = useState(WINDOW_COLUMNS_DEFAULT)
  const [collectionColumns, setCollectionColumns] = useState<
    Record<string, number>
  >({})
  const [splitAnimatingIds, setSplitAnimatingIds] = useState<Set<string>>(
    () => new Set()
  )
  const [draggingTab, setDraggingTab] = useState<DraggedTab | null>(null)
  const navRef = useRef<HTMLDivElement>(null)

  const totalTabs = collections.reduce((n, c) => n + c.tabs.length, 0)
  const isDark = theme === "dark" || (theme === "auto" && systemIsDark())
  const pageMaxWidth = windowColumns * 500 + (windowColumns - 1) * 12

  /* ── Boot ── */
  useEffect(() => {
    chrome.storage.local
      .get([
        "collections",
        FONT_KEY,
        THEME_KEY,
        FONT_SCALE_KEY,
        FONT_WEIGHT_KEY,
        BEAM_KEY,
        SOUND_KEY,
        COLLECT_MODE_KEY,
        WINDOW_COLUMNS_KEY,
        COLLECTION_COLUMNS_KEY
      ])
      .then((r) => {
        if (r.collections && Array.isArray(r.collections))
          setCollections(r.collections)
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
        if (r[THEME_KEY]) {
          const t = r[THEME_KEY] as Theme
          setTheme(t)
          applyTheme(t)
        }
        if (typeof r[BEAM_KEY] === "boolean") setBeamEnabled(r[BEAM_KEY])
        if (typeof r[SOUND_KEY] === "boolean") setSoundEnabled(r[SOUND_KEY])
        if (r[COLLECT_MODE_KEY] === "all" || r[COLLECT_MODE_KEY] === "current")
          setCollectMode(r[COLLECT_MODE_KEY])
        if (typeof r[WINDOW_COLUMNS_KEY] === "number")
          setWindowColumns(clampWindowColumns(r[WINDOW_COLUMNS_KEY]))
        if (r[COLLECTION_COLUMNS_KEY] && typeof r[COLLECTION_COLUMNS_KEY] === "object")
          setCollectionColumns(r[COLLECTION_COLUMNS_KEY])
        setLoading(false)
      })
  }, [])

  /* ── Close font panel on outside click ── */
  useEffect(() => {
    if (!showFontPanel) return
    const h = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node))
        setShowFontPanel(false)
    }
    document.addEventListener("mousedown", h)
    return () => document.removeEventListener("mousedown", h)
  }, [showFontPanel])

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
    setCollections(updated)
    await chrome.storage.local.set({ collections: updated })
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

  const getCollectionColumns = (id: string) =>
    clampCollectionColumns(collectionColumns[id])

  const toggleCollectionColumns = async (id: string) => {
    const next = getCollectionColumns(id) === 1 ? 2 : 1
    const updated = { ...collectionColumns, [id]: next }
    playSound("toggle", soundEnabled)
    setCollectionColumns(updated)
    await chrome.storage.local.set({ [COLLECTION_COLUMNS_KEY]: updated })
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
    await persist(collections.filter((c) => c.id !== id))
  }

  const openSingleTab = async (
    colId: string,
    url: string,
    idx: number
  ): Promise<Point | null> => {
    playSound("open", soundEnabled)
    // 立即创建标签并即时从收集卡移除该行（保持原有反馈），随后用真实序号定位落点
    const createPromise = chrome.tabs
      .create({ url, active: false })
      .catch(() => null)
    await persist(
      collections
        .map((c) =>
          c.id !== colId
            ? c
            : { ...c, tabs: c.tabs.filter((_, i) => i !== idx) }
        )
        .filter((c) => c.tabs.length > 0)
    )
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
        .map((c) =>
          c.id !== colId
            ? c
            : { ...c, tabs: c.tabs.filter((_, i) => i !== idx) }
        )
        .filter((c) => c.tabs.length > 0)
    )
  }

  const deleteCollection = async (id: string) => {
    playSound("delete", soundEnabled)
    await persist(collections.filter((c) => c.id !== id))
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

  const gatherToCollection = async (targetId: string) => {
    const target = collections.find((c) => c.id === targetId)
    if (!target) return
    playSound("merge", soundEnabled)
    const others = collections.filter((c) => c.id !== targetId)
    const allOtherTabs = others.flatMap((c) => c.tabs)

    // Create new array with merged tabs
    const newTarget = {
      ...target,
      tabs: [...target.tabs, ...allOtherTabs]
    }

    // Only keep the target collection
    await persist([newTarget])
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
    if (!confirm(`确定要删除全部 ${collections.length} 条收集记录吗？`)) return
    playSound("delete", soundEnabled)
    await persist([])
  }

  /* ── Render ── */
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
        color: "var(--text)"
      }}>
      {/* ── Nav ── */}
      <div
        ref={navRef}
        className="kt-nav"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 100,
          backdropFilter: "blur(16px) saturate(1.4)",
          WebkitBackdropFilter: "blur(16px) saturate(1.4)",
          borderBottom: "1px solid var(--border)"
        }}>
        <div
          style={{
            maxWidth: pageMaxWidth,
            margin: "0 auto",
            height: 56,
            padding: "0 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between"
          }}>
          {/* Logo */}
          <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
            <div>
              <div
                style={{
                  fontSize: 17,
                  fontWeight: "var(--fw-strong)",
                  letterSpacing: "-.02em",
                  color: "var(--text)",
                  lineHeight: 1.15
                }}>
                拾页 Shiye
              </div>
              <div
                style={{
                  fontSize: 11.5,
                  fontWeight: "var(--fw)",
                  color: "var(--text3)",
                  marginTop: 1
                }}>
                {loading
                  ? "加载中…"
                  : `${collections.length} 个记录 · ${totalTabs} 个标签页`}
              </div>
            </div>
          </div>

          {/* Right controls */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <NavBtn
              onClick={toggleTheme}
              title={isDark ? "切换亮色" : "切换深色"}>
              <i className={isDark ? "ri-haze-fill" : "ri-moon-foggy-fill"}></i>
            </NavBtn>
            <NavBtn
              onClick={toggleBeam}
              title={beamEnabled ? "关闭打开动画" : "开启打开动画"}
              active={beamEnabled}>
              <i
                className={
                  beamEnabled ? "ri-flashlight-fill" : "ri-flashlight-line"
                }></i>
            </NavBtn>
            <NavBtn
              onClick={toggleSound}
              title={soundEnabled ? "关闭交互音效" : "开启交互音效"}
              active={soundEnabled}>
              <i
                className={
                  soundEnabled ? "ri-volume-up-fill" : "ri-volume-mute-line"
                }></i>
            </NavBtn>
            <NavBtn
              onClick={cycleWindowColumns}
              title={`窗口列数：${windowColumns} 列，点击切换`}
              active={windowColumns !== WINDOW_COLUMNS_DEFAULT}>
              <span style={{ fontSize: 12, fontWeight: 700 }}>
                {windowColumns}
              </span>
            </NavBtn>
            <NavBtn
              onClick={toggleCollectMode}
              title={
                collectMode === "all"
                  ? "当前：收集所有窗口 — 点击切换为仅当前窗口"
                  : "当前：仅收集当前窗口 — 点击切换为所有窗口"
              }
              active={collectMode === "current"}>
              <i
                className={
                  collectMode === "all"
                    ? "ri-stack-fill"
                    : "ri-window-fill"
                }></i>
            </NavBtn>
            <NavBtn
              onClick={() => setShowFontPanel((v) => !v)}
              title="字体"
              active={showFontPanel}>
              <i className="ri-font-serif"></i>
            </NavBtn>
            {!loading && collections.length > 0 && (
              <NavBtn onClick={clearAll} title="清空全部">
                <i className="ri-skull-line" style={{ fontSize: 14 }}></i>
              </NavBtn>
            )}
          </div>
        </div>

        {/* Font panel */}
        {showFontPanel && (
          <FontPicker
            activeId={fontId}
            scale={fontScale}
            weight={fontWeight}
            onSelectFont={selectFont}
            onScaleChange={changeFontScale}
            onWeightChange={changeFontWeight}
          />
        )}
      </div>

      {/* ── Content ── */}
      <div
        style={{
          maxWidth: pageMaxWidth,
          margin: "0 auto",
          padding: "20px 24px 60px"
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
          <div style={{ textAlign: "center", paddingTop: 100 }}>
            <div
              style={{
                fontSize: 52,
                marginBottom: 16,
                color: "var(--border2)"
              }}>
              <i className="ri-folder-open-line"></i>
            </div>
            <div
              style={{
                fontSize: fs(17),
                fontWeight: "var(--fw-strong)",
                color: "var(--text2)",
                marginBottom: 6
              }}>
              还没有收集记录
            </div>
            <div
              style={{
                fontSize: fs(13.5),
                fontWeight: "var(--fw)",
                color: "var(--text3)",
                lineHeight: 1.6
              }}>
              点击扩展图标，一键收集并关闭当前所有标签页
            </div>
          </div>
        )}

        {!loading && collections.length > 0 && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${windowColumns}, minmax(0, 1fr))`,
              gap: 12,
              alignItems: "start"
            }}>
            {distributeCollections(collections, windowColumns, collectionColumns).map(
              (column, columnIndex) => (
                <div
                  key={columnIndex}
                  style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {column.map((col) => (
                    <CollectionCard
                      key={col.id}
                      collection={col}
                      otherCollections={collections.filter((c) => c.id !== col.id)}
                      beamEnabled={beamEnabled}
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
                      onGather={() => gatherToCollection(col.id)}
                      onMergeTo={(targetId) => mergeCollectionTo(col.id, targetId)}
                      onAppearanceChange={(appearance) =>
                        updateCollectionAppearance(col.id, appearance)
                      }
                    />
                  ))}
                </div>
              )
            )}
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

export default CollectionPage
