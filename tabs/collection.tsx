import { useEffect, useRef, useState } from "react"
import "remixicon/fonts/remixicon.css"
import "../style.css"

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

interface FontOption {
  id: string
  name: string
  family: string
  cssUrl?: string
}

/* ── Fonts ───────────────────────────────────────────────────── */
const FONTS: FontOption[] = [
  {
    id: "system",
    name: "系统默认",
    family: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Noto Sans SC', sans-serif",
  },
  {
    id: "noto",
    name: "Noto Sans SC",
    family: "'Noto Sans SC', sans-serif",
    cssUrl: "https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@300;400;500;700&display=swap",
  },
  {
    id: "lxgw",
    name: "霞鹜文楷",
    family: "'LXGW WenKai', cursive",
    cssUrl: "https://cdn.jsdelivr.net/npm/lxgw-wenkai-webfont@1.6.0/style.css",
  },
  {
    id: "source-han",
    name: "思源黑体",
    family: "'Source Han Sans SC', 'Noto Sans CJK SC', sans-serif",
    cssUrl: "https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@300;400;500;700&display=swap",
  },
]

const FONT_KEY = "shiye-font-id"
const THEME_KEY = "shiye-theme"

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

function loadFontCss(cssUrl: string) {
  const id = `kt-font-${btoa(cssUrl).slice(0, 12)}`
  if (document.getElementById(id)) return
  const link = document.createElement("link")
  link.id = id; link.rel = "stylesheet"; link.href = cssUrl
  document.head.appendChild(link)
}

function applyFont(opt: FontOption) {
  if (opt.cssUrl) loadFontCss(opt.cssUrl)
  document.documentElement.style.setProperty("--font", opt.family)
  document.body.style.fontFamily = opt.family
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
        display: "flex", alignItems: "center", gap: 6,
        padding: "5px 8px",
        borderRadius: 6,
        background: h ? "var(--bg2)" : "transparent",
        transition: "background var(--dur) var(--ease)",
        cursor: "default", minWidth: 0,
      }}>
      {/* Favicon */}
      <div style={{ width: 14, height: 14, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {favicon ? (
          <img src={favicon} alt="" style={{ width: 13, height: 13, borderRadius: 2, opacity: 0.72 }}
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none" }} />
        ) : (
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--border2)" }} />
        )}
      </div>

      {/* Title */}
      <span style={{
        flex: 1, minWidth: 0,
        fontSize: 12.5, fontWeight: 450, color: "var(--text)",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        lineHeight: 1.35,
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
        padding: "9px 14px",
        borderBottom: "1px solid var(--border)",
        background: "var(--bg2)", gap: 8,
        borderTopLeftRadius: "calc(var(--r) - 1px)",
        borderTopRightRadius: "calc(var(--r) - 1px)",
      }}>
        {/* Date */}
        <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text)", flexShrink: 0 }}>
          {formatDate(collection.timestamp)}
        </span>

        {/* Window badge */}
        {collection.windowLabel && (
          <span style={{
            fontSize: 10, fontWeight: 500, padding: "1px 6px",
            background: "var(--accent-bg)", color: "var(--accent)",
            borderRadius: 99, border: "1px solid rgba(217,119,86,.15)", flexShrink: 0,
          }}>
            {collection.windowLabel}
          </span>
        )}

        {/* Count */}
        <span style={{ fontSize: 11, color: "var(--text3)", flex: 1 }}>
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
            padding: "4px 10px", background: "var(--accent)", color: "#fff",
            border: "none", borderRadius: "var(--r-s)", fontSize: 11.5,
            fontWeight: 500, cursor: "pointer", fontFamily: "var(--font)",
            flexShrink: 0, transition: "background var(--dur) var(--ease)",
            display: "flex", alignItems: "center", gap: 4
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--accent2)" }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--accent)" }}>
          <i className="ri-external-link-line"></i> 全部恢复
        </button>
        <button
          onClick={onDelete}
          style={{
            padding: "4px 10px", background: "transparent", color: "var(--text3)",
            border: "1px solid var(--border)", borderRadius: "var(--r-s)",
            fontSize: 11.5, fontWeight: 500, cursor: "pointer", fontFamily: "var(--font)",
            flexShrink: 0, transition: "all var(--dur) var(--ease)",
            display: "flex", alignItems: "center", gap: 4
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
        padding: "6px 6px",
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

/* ── Main ────────────────────────────────────────────────────── */
function CollectionPage() {
  const [collections, setCollections] = useState<Collection[]>([])
  const [loading, setLoading] = useState(true)
  const [fontId, setFontId] = useState("system")
  const [showFontPanel, setShowFontPanel] = useState(false)
  const [theme, setTheme] = useState<Theme>("auto")
  const navRef = useRef<HTMLDivElement>(null)

  const totalTabs = collections.reduce((n, c) => n + c.tabs.length, 0)
  const isDark = theme === "dark" || (theme === "auto" && systemIsDark())

  /* ── Boot ── */
  useEffect(() => {
    chrome.storage.local.get(["collections", FONT_KEY, THEME_KEY]).then((r) => {
      if (r.collections && Array.isArray(r.collections)) setCollections(r.collections)
      if (r[FONT_KEY]) {
        const opt = FONTS.find((f) => f.id === r[FONT_KEY]) ?? FONTS[0]
        setFontId(opt.id); applyFont(opt)
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

  const selectFont = async (opt: FontOption) => {
    setFontId(opt.id); applyFont(opt)
    await chrome.storage.local.set({ [FONT_KEY]: opt.id })
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
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 30, height: 30, background: "var(--accent-bg)", borderRadius: 8,
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0,
              border: "1px solid rgba(217,119,86,.15)", color: "var(--accent)"
            }}><i className="ri-bookmark-3-line"></i></div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: "-.01em", color: "var(--text)", lineHeight: 1.2 }}>
                拾页 Shiye
              </div>
              <div style={{ fontSize: 10.5, color: "var(--text3)", marginTop: 1 }}>
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
          <div className="kt-font-panel">
            <span style={{ fontSize: 11, color: "var(--text3)", flexShrink: 0 }}>字体</span>
            {FONTS.map((opt) => (
              <button
                key={opt.id}
                className={`kt-font-chip${fontId === opt.id ? " active" : ""}`}
                style={{ fontFamily: opt.family }}
                onClick={() => selectFont(opt)}>
                {opt.name}
              </button>
            ))}
          </div>
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
            <div style={{ fontSize: 44, marginBottom: 14, color: "var(--border2)" }}>
              <i className="ri-folder-open-line"></i>
            </div>
            <div style={{ fontSize: 15, fontWeight: 500, color: "var(--text2)", marginBottom: 5 }}>
              还没有收集记录
            </div>
            <div style={{ fontSize: 13, color: "var(--text3)", lineHeight: 1.6 }}>
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
