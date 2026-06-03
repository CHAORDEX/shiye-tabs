import { useEffect, useRef, useState } from "react"
import "remixicon/fonts/remixicon.css"
import "../style.css"
import { WEB_FONTS } from "./fonts"

/* ── Types ──────────────────────────────────────────────────── */
type Theme = "light" | "dark" | "auto"

interface TabInfo {
  title: string
  url: string
}

interface Collection {
  id: string
  timestamp: number
  tabs: TabInfo[]
  windowLabel?: string
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
  family: SYSTEM_FAMILY,
}

// 系统默认 + 中文网字计划 80 款免费 web 字体
const ALL_FONTS: SelectableFont[] = [
  SYSTEM_FONT,
  ...WEB_FONTS.map((f) => ({ id: f.id, name: f.name, family: f.family, cssUrls: f.cssUrls })),
]

const FONT_KEY = "shiye-font-id"
const THEME_KEY = "shiye-theme"
const FONT_SCALE_KEY = "shiye-font-scale"

/* 内容字号缩放系数范围 */
const SCALE_MIN = 0.8
const SCALE_MAX = 1.6
const SCALE_STEP = 0.1
const SCALE_DEFAULT = 1

/** 可缩放的内容字号：基准 px × 用户缩放系数 */
const fs = (px: number) => `calc(${px}px * var(--fs))`

function clampScale(v: number): number {
  if (!Number.isFinite(v)) return SCALE_DEFAULT
  return Math.min(SCALE_MAX, Math.max(SCALE_MIN, Math.round(v * 10) / 10))
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
  } catch { return null }
}

function formatDate(ts: number) {
  const d = new Date(ts)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  if (isToday) return "今天 " + d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })
  return d.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
}

/* ── Small icon button ───────────────────────────────────────── */
function IconBtn({
  children, onClick, title, accent,
}: {
  children: React.ReactNode
  onClick: (e: React.MouseEvent) => void
  title?: string
  accent?: boolean
}) {
  const [h, setH] = useState(false)
  return (
    <button
      title={title}
      onClick={(e) => { e.stopPropagation(); onClick(e) }}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        width: 22, height: 22, padding: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        border: "none", borderRadius: 5, cursor: "pointer",
        fontSize: 11, fontWeight: 600, flexShrink: 0,
        background: h ? (accent ? "var(--accent)" : "var(--bg3)") : "transparent",
        color: h ? (accent ? "#fff" : "var(--text2)") : "var(--text3)",
        transition: "all var(--dur) var(--ease)",
        fontFamily: "var(--font)",
      }}>
      {children}
    </button>
  )
}

/* ── TabItem — compact grid cell ────────────────────────────── */
function TabItem({
  tab, onOpen, onDelete,
}: { tab: TabInfo; onOpen: () => void; onDelete: () => void }) {
  const [h, setH] = useState(false)
  const favicon = getFavicon(tab.url)

  return (
    <div
      title={tab.url}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "7px 10px",
        borderRadius: 7,
        background: h ? "var(--bg2)" : "transparent",
        transition: "background var(--dur) var(--ease)",
        cursor: "default", minWidth: 0,
      }}>
      {/* Favicon */}
      <div style={{ width: 16, height: 16, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {favicon ? (
          <img src={favicon} alt="" style={{ width: 15, height: 15, borderRadius: 3, opacity: 0.82 }}
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none" }} />
        ) : (
          <div style={{ width: 9, height: 9, borderRadius: "50%", background: "var(--border2)" }} />
        )}
      </div>

      {/* Title */}
      <span style={{
        flex: 1, minWidth: 0,
        fontSize: fs(14), fontWeight: 500, color: "var(--text)",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        lineHeight: 1.4,
      }}>
        {tab.title}
      </span>

      {/* Actions — visible on row hover */}
      <div style={{
        display: "flex", gap: 2, flexShrink: 0,
        opacity: h ? 1 : 0,
        transition: "opacity var(--dur) var(--ease)",
      }}>
        <IconBtn onClick={onOpen} title="打开标签" accent><i className="ri-external-link-line"></i></IconBtn>
        <IconBtn onClick={onDelete} title="删除"><i className="ri-close-line"></i></IconBtn>
      </div>
    </div>
  )
}

/* ── CollectionCard ──────────────────────────────────────────── */
function CollectionCard({
  collection, otherCollections, onOpenAll, onOpenTab, onDeleteTab, onDelete, onGather, onMergeTo
}: {
  collection: Collection
  otherCollections: Collection[]
  onOpenAll: () => void
  onOpenTab: (url: string, index: number) => void
  onDeleteTab: (index: number) => void
  onDelete: () => void
  onGather: () => void
  onMergeTo: (targetId: string) => void
}) {
  const [hCard, setHCard] = useState(false)
  const [showMergeMenu, setShowMergeMenu] = useState(false)
  const mergeMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showMergeMenu) return
    const h = (e: MouseEvent) => {
      if (mergeMenuRef.current && !mergeMenuRef.current.contains(e.target as Node)) setShowMergeMenu(false)
    }
    document.addEventListener("mousedown", h)
    return () => document.removeEventListener("mousedown", h)
  }, [showMergeMenu])

  return (
    <div
      onMouseEnter={() => setHCard(true)}
      onMouseLeave={() => setHCard(false)}
      style={{
        position: "relative",
        zIndex: showMergeMenu ? 100 : 1,
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r)",
        boxShadow: hCard ? "var(--shadow-m)" : "var(--shadow-s)",
        transition: "box-shadow var(--dur) var(--ease)",
      }}>

      {/* ── Header ── */}
      <div style={{
        display: "flex", alignItems: "center",
        padding: "12px 16px",
        borderBottom: "1px solid var(--border)",
        background: "var(--bg2)", gap: 8,
        borderTopLeftRadius: "calc(var(--r) - 1px)",
        borderTopRightRadius: "calc(var(--r) - 1px)",
      }}>
        {/* Date */}
        <span style={{ fontSize: fs(14.5), fontWeight: 700, color: "var(--text)", flexShrink: 0, letterSpacing: "-.01em" }}>
          {formatDate(collection.timestamp)}
        </span>

        {/* Window badge */}
        {collection.windowLabel && (
          <span style={{
            fontSize: fs(11), fontWeight: 600, padding: "2px 7px",
            background: "var(--accent-bg)", color: "var(--accent)",
            borderRadius: 99, border: "1px solid rgba(217,119,86,.15)", flexShrink: 0,
          }}>
            {collection.windowLabel}
          </span>
        )}

        {/* Count */}
        <span style={{ fontSize: fs(12), fontWeight: 500, color: "var(--text3)", flex: 1 }}>
          {collection.tabs.length} 个标签页
        </span>

        {/* Actions */}
        {otherCollections.length > 0 && (
          <div style={{ display: "flex", gap: 4, marginRight: 4 }}>
            <button
              title="归集：将其他所有卡片的标签页合并到当前卡片"
              onClick={onGather}
              style={{
                width: 24, height: 24, padding: 0, background: "transparent", color: "var(--text3)",
                border: "none", borderRadius: "var(--r-s)", fontSize: 13,
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", transition: "all var(--dur) var(--ease)",
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget as HTMLButtonElement
                el.style.background = "var(--bg3)"; el.style.color = "var(--text)"
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLButtonElement
                el.style.background = "transparent"; el.style.color = "var(--text3)"
              }}>
              <i className="ri-game-line"></i>
            </button>
            <div style={{ position: "relative" }} ref={mergeMenuRef}>
              <button
                title="投奔：将当前卡片的标签页合并到其他卡片"
                onClick={() => setShowMergeMenu(!showMergeMenu)}
                style={{
                  width: 24, height: 24, padding: 0, background: showMergeMenu ? "var(--bg3)" : "transparent", color: showMergeMenu ? "var(--text)" : "var(--text3)",
                  border: "none", borderRadius: "var(--r-s)", fontSize: 13,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: "pointer", transition: "all var(--dur) var(--ease)",
                }}
                onMouseEnter={(e) => {
                  const el = e.currentTarget as HTMLButtonElement
                  if (!showMergeMenu) { el.style.background = "var(--bg3)"; el.style.color = "var(--text)" }
                }}
                onMouseLeave={(e) => {
                  const el = e.currentTarget as HTMLButtonElement
                  if (!showMergeMenu) { el.style.background = "transparent"; el.style.color = "var(--text3)" }
                }}>
                <i className="ri-game-2-line"></i>
              </button>
              {showMergeMenu && (
                <div style={{
                  position: "absolute", top: "100%", right: 0, marginTop: 4,
                  background: "var(--bg)", border: "1px solid var(--border)",
                  borderRadius: "var(--r)", boxShadow: "var(--shadow-m)",
                  padding: 4, minWidth: 160, zIndex: 10,
                  maxHeight: 200, overflowY: "auto"
                }}>
                  <div style={{ padding: "4px 8px", fontSize: 11, color: "var(--text3)", fontWeight: 500 }}>合并到...</div>
                  {otherCollections.map(c => (
                    <button
                      key={c.id}
                      onClick={() => { onMergeTo(c.id); setShowMergeMenu(false) }}
                      style={{
                        display: "block", width: "100%", textAlign: "left",
                        padding: "6px 8px", background: "transparent", border: "none",
                        borderRadius: 4, fontSize: 12, color: "var(--text)",
                        cursor: "pointer", transition: "background var(--dur) var(--ease)",
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--bg2)" }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent" }}>
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
            padding: "6px 12px", background: "var(--accent)", color: "#fff",
            border: "none", borderRadius: "var(--r-s)", fontSize: fs(12.5),
            fontWeight: 600, cursor: "pointer", fontFamily: "var(--font)",
            flexShrink: 0, transition: "background var(--dur) var(--ease)",
            display: "flex", alignItems: "center", gap: 5
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--accent2)" }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--accent)" }}>
          <i className="ri-external-link-line"></i> 全部恢复
        </button>
        <button
          onClick={onDelete}
          style={{
            padding: "6px 12px", background: "transparent", color: "var(--text3)",
            border: "1px solid var(--border)", borderRadius: "var(--r-s)",
            fontSize: fs(12.5), fontWeight: 600, cursor: "pointer", fontFamily: "var(--font)",
            flexShrink: 0, transition: "all var(--dur) var(--ease)",
            display: "flex", alignItems: "center", gap: 5
          }}
          onMouseEnter={(e) => {
            const el = e.currentTarget as HTMLButtonElement
            el.style.background = "var(--bg3)"; el.style.borderColor = "var(--border2)"; el.style.color = "var(--text2)"
          }}
          onMouseLeave={(e) => {
            const el = e.currentTarget as HTMLButtonElement
            el.style.background = "transparent"; el.style.borderColor = "var(--border)"; el.style.color = "var(--text3)"
          }}>
          <i className="ri-delete-bin-line"></i> 删除
        </button>
      </div>

      {/* ── Tab list ── */}
      <div style={{
        display: "flex",
        flexDirection: "column",
        padding: "8px 8px",
      }}>
        {collection.tabs.map((tab, index) => (
          <TabItem
            key={`${tab.url}-${index}`}
            tab={tab}
            onOpen={() => onOpenTab(tab.url, index)}
            onDelete={() => onDeleteTab(index)}
          />
        ))}
      </div>
    </div>
  )
}

/* ── Header icon button helper ───────────────────────────────── */
function NavBtn({
  children, onClick, title, active = false,
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
        width: 32, height: 32,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: active ? "var(--accent-bg)" : (h ? "var(--bg2)" : "transparent"),
        color: active ? "var(--accent)" : (h ? "var(--text)" : "var(--text3)"),
        border: `1px solid ${active ? "rgba(217,119,86,.2)" : (h ? "var(--border2)" : "var(--border)")}`,
        borderRadius: "var(--r-s)", cursor: "pointer",
        fontSize: 13, fontWeight: 600, fontFamily: "var(--font)",
        transition: "all var(--dur) var(--ease)",
      }}>
      {children}
    </button>
  )
}

/* ── Font size stepper ───────────────────────────────────────── */
function FontSizeStepper({
  scale, onChange,
}: { scale: number; onChange: (next: number) => void }) {
  const pct = Math.round(scale * 100)
  return (
    <div className="kt-size-row">
      <span className="kt-font-label">字号</span>
      <div className="kt-size-bar">
        <button
          className="kt-size-btn"
          disabled={scale <= SCALE_MIN}
          onClick={() => onChange(scale - SCALE_STEP)}
          title="减小字号">−</button>
        <span className="kt-size-val">{pct}%</span>
        <button
          className="kt-size-btn"
          disabled={scale >= SCALE_MAX}
          onClick={() => onChange(scale + SCALE_STEP)}
          title="增大字号">+</button>
      </div>
    </div>
  )
}

/* ── Font row — lazy-loads its own preview when scrolled into view ── */
function FontRow({
  font, active, scrollRoot, onSelect,
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
  activeId, scale, onSelectFont, onScaleChange,
}: {
  activeId: string
  scale: number
  onSelectFont: (font: SelectableFont) => void
  onScaleChange: (next: number) => void
}) {
  const [query, setQuery] = useState("")
  // 回调 ref 转 state：附加后触发重渲染，让子项拿到真实的滚动容器作为观察根
  const [listEl, setListEl] = useState<HTMLDivElement | null>(null)
  const q = query.trim().toLowerCase()
  const filtered = q
    ? ALL_FONTS.filter(
        (f) => f.name.toLowerCase().includes(q) || f.family.toLowerCase().includes(q)
      )
    : ALL_FONTS

  return (
    <div className="kt-font-panel">
      <FontSizeStepper scale={scale} onChange={onScaleChange} />

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

      <div style={{ fontSize: 11, color: "var(--text3)", textAlign: "center", lineHeight: 1.5 }}>
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
  const [showFontPanel, setShowFontPanel] = useState(false)
  const [theme, setTheme] = useState<Theme>("auto")
  const navRef = useRef<HTMLDivElement>(null)

  const totalTabs = collections.reduce((n, c) => n + c.tabs.length, 0)
  const isDark = theme === "dark" || (theme === "auto" && systemIsDark())

  /* ── Boot ── */
  useEffect(() => {
    chrome.storage.local.get(["collections", FONT_KEY, THEME_KEY, FONT_SCALE_KEY]).then((r) => {
      if (r.collections && Array.isArray(r.collections)) setCollections(r.collections)
      if (r[FONT_KEY]) {
        const opt = ALL_FONTS.find((f) => f.id === r[FONT_KEY]) ?? SYSTEM_FONT
        setFontId(opt.id); applyFont(opt)
      }
      if (typeof r[FONT_SCALE_KEY] === "number") {
        const v = clampScale(r[FONT_SCALE_KEY])
        setFontScale(v); applyFontScale(v)
      }
      if (r[THEME_KEY]) {
        const t = r[THEME_KEY] as Theme
        setTheme(t); applyTheme(t)
      }
      setLoading(false)
    })
  }, [])

  /* ── Close font panel on outside click ── */
  useEffect(() => {
    if (!showFontPanel) return
    const h = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setShowFontPanel(false)
    }
    document.addEventListener("mousedown", h)
    return () => document.removeEventListener("mousedown", h)
  }, [showFontPanel])

  /* ── Persist ── */
  const persist = async (updated: Collection[]) => {
    setCollections(updated)
    await chrome.storage.local.set({ collections: updated })
  }

  const toggleTheme = async () => {
    const next: Theme = isDark ? "light" : "dark"
    setTheme(next); applyTheme(next)
    await chrome.storage.local.set({ [THEME_KEY]: next })
  }

  const selectFont = async (opt: SelectableFont) => {
    setFontId(opt.id); applyFont(opt)
    await chrome.storage.local.set({ [FONT_KEY]: opt.id })
  }

  const changeFontScale = async (next: number) => {
    const v = clampScale(next)
    setFontScale(v); applyFontScale(v)
    await chrome.storage.local.set({ [FONT_SCALE_KEY]: v })
  }

  /* ── Tab ops ── */
  const openAllTabs = async (id: string) => {
    const col = collections.find((c) => c.id === id)
    if (!col) return
    for (const tab of col.tabs) {
      try { await chrome.tabs.create({ url: tab.url, active: false }) } catch { }
    }
    await persist(collections.filter((c) => c.id !== id))
  }

  const openSingleTab = async (colId: string, url: string, idx: number) => {
    chrome.tabs.create({ url, active: false })
    await persist(
      collections
        .map((c) => c.id !== colId ? c : { ...c, tabs: c.tabs.filter((_, i) => i !== idx) })
        .filter((c) => c.tabs.length > 0)
    )
  }

  const deleteTab = async (colId: string, idx: number) => {
    await persist(
      collections
        .map((c) => c.id !== colId ? c : { ...c, tabs: c.tabs.filter((_, i) => i !== idx) })
        .filter((c) => c.tabs.length > 0)
    )
  }

  const deleteCollection = async (id: string) => persist(collections.filter((c) => c.id !== id))

  const gatherToCollection = async (targetId: string) => {
    const target = collections.find(c => c.id === targetId)
    if (!target) return
    const others = collections.filter(c => c.id !== targetId)
    const allOtherTabs = others.flatMap(c => c.tabs)

    // Create new array with merged tabs
    const newTarget = {
      ...target,
      tabs: [...target.tabs, ...allOtherTabs]
    }

    // Only keep the target collection
    await persist([newTarget])
  }

  const mergeCollectionTo = async (sourceId: string, targetId: string) => {
    const source = collections.find(c => c.id === sourceId)
    const target = collections.find(c => c.id === targetId)
    if (!source || !target) return

    const newTarget = {
      ...target,
      tabs: [...target.tabs, ...source.tabs]
    }

    await persist(collections.map(c => {
      if (c.id === targetId) return newTarget
      return c
    }).filter(c => c.id !== sourceId))
  }

  const clearAll = async () => {
    if (!confirm(`确定要删除全部 ${collections.length} 条收集记录吗？`)) return
    await persist([])
  }

  /* ── Render ── */
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)" }}>

      {/* ── Nav ── */}
      <div
        ref={navRef}
        className="kt-nav"
        style={{
          position: "sticky", top: 0, zIndex: 100,
          backdropFilter: "blur(16px) saturate(1.4)",
          WebkitBackdropFilter: "blur(16px) saturate(1.4)",
          borderBottom: "1px solid var(--border)",
        }}>

        <div style={{
          maxWidth: 1100, margin: "0 auto",
          height: 56, padding: "0 24px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          {/* Logo */}
          <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
            <div>
              <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-.02em", color: "var(--text)", lineHeight: 1.15 }}>
                拾页 Shiye
              </div>
              <div style={{ fontSize: 11.5, fontWeight: 500, color: "var(--text3)", marginTop: 1 }}>
                {loading ? "加载中…" : `${collections.length} 个记录 · ${totalTabs} 个标签页`}
              </div>
            </div>
          </div>

          {/* Right controls */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <NavBtn onClick={toggleTheme} title={isDark ? "切换亮色" : "切换深色"}>
              <i className={isDark ? "ri-haze-fill" : "ri-moon-foggy-fill"}></i>
            </NavBtn>
            <NavBtn onClick={() => setShowFontPanel((v) => !v)} title="字体" active={showFontPanel}>
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
            onSelectFont={selectFont}
            onScaleChange={changeFontScale}
          />
        )}
      </div>

      {/* ── Content ── */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "20px 24px 60px" }}>

        {loading && (
          <div style={{ display: "flex", justifyContent: "center", paddingTop: 80 }}>
            <div style={{
              width: 20, height: 20, borderRadius: "50%",
              border: "2px solid var(--border2)", borderTopColor: "var(--accent)",
              animation: "spin .8s linear infinite",
            }} />
          </div>
        )}

        {!loading && collections.length === 0 && (
          <div style={{ textAlign: "center", paddingTop: 100 }}>
            <div style={{ fontSize: 52, marginBottom: 16, color: "var(--border2)" }}>
              <i className="ri-folder-open-line"></i>
            </div>
            <div style={{ fontSize: fs(17), fontWeight: 600, color: "var(--text2)", marginBottom: 6 }}>
              还没有收集记录
            </div>
            <div style={{ fontSize: fs(13.5), fontWeight: 500, color: "var(--text3)", lineHeight: 1.6 }}>
              点击扩展图标，一键收集并关闭当前所有标签页
            </div>
          </div>
        )}

        {!loading && collections.length > 0 && (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))",
            gap: 12,
            alignItems: "start",
          }}>
            {collections.map((col) => (
              <CollectionCard
                key={col.id}
                collection={col}
                otherCollections={collections.filter(c => c.id !== col.id)}
                onOpenAll={() => openAllTabs(col.id)}
                onOpenTab={(url, idx) => openSingleTab(col.id, url, idx)}
                onDeleteTab={(idx) => deleteTab(col.id, idx)}
                onDelete={() => deleteCollection(col.id)}
                onGather={() => gatherToCollection(col.id)}
                onMergeTo={(targetId) => mergeCollectionTo(col.id, targetId)}
              />
            ))}
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

export default CollectionPage
