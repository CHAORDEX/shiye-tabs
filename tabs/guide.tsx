import { useEffect, useState } from "react"
import "remixicon/fonts/remixicon.css"
import "../style.css"

interface Collection {
  id: string
  timestamp: number
  tabs: { title: string; url: string }[]
  windowLabel?: string
}

type SceneId = 0 | 1 | 2

interface DemoTab {
  title: string
  host: string
  color: string
}

const DEMO_TABS: DemoTab[] = [
  { title: "GitHub · shiye", host: "github.com", color: "#5A5A57" },
  { title: "Figma · 设计稿", host: "figma.com", color: "#D97756" },
  { title: "Notion · 周报", host: "notion.so", color: "#3B82F6" },
  { title: "MDN · Web API", host: "developer.mozilla.org", color: "#10B981" },
]

const SCENES: { id: SceneId; title: string; desc: string }[] = [
  { id: 0, title: "1. 点击拾页图标", desc: "一键收集当前窗口可保存的网页标签" },
  { id: 1, title: "2. 自动归档成卡", desc: "按窗口生成整洁卡片，随时回看检索" },
  { id: 2, title: "3. 一键全部恢复", desc: "需要时整组恢复，或点开单个标签页" },
]

const SCENE_DURATION = 3400

function GuidePage() {
  const [count, setCount] = useState(0)
  const [scene, setScene] = useState<SceneId>(0)
  const [phase, setPhase] = useState<"idle" | "move" | "click" | "done">("idle")
  const [paused, setPaused] = useState(false)
  const [cycleKey, setCycleKey] = useState(0)

  useEffect(() => {
    chrome.storage.local.get(["collections", "shiye-card-radius", "shiye-theme"]).then((r) => {
      const collections = (r.collections || []) as Collection[]
      setCount(collections.length)
      if (typeof r["shiye-card-radius"] === "number") {
        const radius = Math.min(28, Math.max(0, Math.round(r["shiye-card-radius"])))
        document.documentElement.style.setProperty("--r", `${radius}px`)
        const rs = Math.max(0, Math.min(10, Math.round(radius * (8 / 14))))
        document.documentElement.style.setProperty("--r-s", `${rs}px`)
      }
      if (r["shiye-theme"] === "dark" || r["shiye-theme"] === "light") {
        document.documentElement.setAttribute("data-theme", r["shiye-theme"])
      }
    })
  }, [])

  // 控制当前幕内的微交互节奏：移动光标 -> 点击触发 -> 展示结果
  useEffect(() => {
    setPhase("idle")
    const t1 = window.setTimeout(() => setPhase("move"), 220)
    const t2 = window.setTimeout(() => setPhase("click"), 1050)
    const t3 = window.setTimeout(() => setPhase("done"), 1380)
    return () => {
      window.clearTimeout(t1)
      window.clearTimeout(t2)
      window.clearTimeout(t3)
    }
  }, [scene, cycleKey])

  // 自动轮播三幕
  useEffect(() => {
    if (paused) return
    const timer = window.setTimeout(() => {
      setScene((prev) => ((prev + 1) % 3) as SceneId)
    }, SCENE_DURATION)
    return () => window.clearTimeout(timer)
  }, [scene, paused, cycleKey])

  const selectScene = (id: SceneId) => {
    setScene(id)
    setCycleKey((k) => k + 1)
  }

  const openCollection = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("tabs/collection.html"), active: true })
  }

  const closeGuide = () => {
    window.close()
  }

  // 派生每一幕的视觉状态
  const tabsCollapsed = (scene === 0 && phase === "done") || scene === 1 || (scene === 2 && phase !== "done")
  const showCollectionView = scene === 1 || scene === 2
  const extPressed = scene === 0 && phase === "click"
  const restorePressed = scene === 2 && phase === "click"
  const cardRestoring = scene === 2 && (phase === "click" || phase === "done")

  // 光标位置与显隐
  const cursorVisible = scene === 0 || scene === 2
  const cursorPos =
    scene === 0
      ? phase === "idle"
        ? { left: "58%", top: "54%" }
        : { left: "calc(100% - 26px)", top: "56px" }
      : scene === 2
        ? phase === "idle"
          ? { left: "44%", top: "76%" }
          : { left: "calc(100% - 68px)", top: "136px" }
        : { left: "50%", top: "50%" }

  const omniboxText = showCollectionView ? "chrome-extension://shiye/collection.html" : "https://github.com/shiye-tabs"

  return (
    <div className="sy-shell">
      <div style={{ maxWidth: 880, margin: "0 auto", padding: "40px 24px 56px" }}>
        {/* 顶部标题与当前记录徽章 */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
            marginBottom: 20,
          }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              className="sy-brand-mark"
              style={{
                width: 42,
                height: 42,
                borderRadius: 12,
                fontSize: 20,
              }}>
              <i className="ri-bookmark-3-fill"></i>
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 650, letterSpacing: "-.01em", lineHeight: 1.25 }}>
                欢迎使用 拾页 Shiye
              </div>
              <div style={{ fontSize: 13, color: "var(--text2)", marginTop: 3 }}>
                一键收集当前窗口标签页，随时回看与恢复
              </div>
            </div>
          </div>

          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 12px",
              borderRadius: 999,
              background: "var(--card)",
              border: "1px solid var(--border)",
              fontSize: 12,
              color: "var(--text2)",
              boxShadow: "var(--shadow-s)",
            }}>
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: 999,
                background: count > 0 ? "var(--accent)" : "var(--border2)",
              }}
            />
            已保存收集记录：<strong style={{ color: "var(--text)" }}>{count}</strong> 条
          </div>
        </div>

        {/* StageShow 风格动态交互演示舞台 */}
        <div className="sg-stage-card">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 12,
            }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600 }}>
              <i className="ri-play-circle-line" style={{ color: "var(--accent)", fontSize: 16 }} />
              <span>交互演示</span>
              <span style={{ fontSize: 12, fontWeight: 400, color: "var(--text3)" }}>· 点击下方步骤可随时切换</span>
            </div>
            <button
              onClick={() => setPaused((p) => !p)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                border: "1px solid var(--border)",
                borderRadius: 999,
                background: "var(--bg)",
                color: "var(--text2)",
                padding: "4px 10px",
                fontSize: 11.5,
                cursor: "pointer",
                fontFamily: "var(--font)",
              }}>
              <i className={paused ? "ri-play-fill" : "ri-pause-fill"} />
              {paused ? "继续播放" : "暂停"}
            </button>
          </div>

          <div
            className="sg-viewport"
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}>
            <div className="sg-browser">
              {/* 浏览器标签栏 */}
              <div className="sg-browser-top">
                <div className="sg-traffic">
                  <span className="sg-dot" />
                  <span className="sg-dot" />
                  <span className="sg-dot" />
                </div>

                <div className="sg-tabs-strip">
                  {DEMO_TABS.map((t, idx) => (
                    <div
                      key={t.title}
                      className={`sg-tab ${idx === 0 ? "is-active" : ""} ${tabsCollapsed ? "is-collapsed" : ""}`}
                      style={{ transitionDelay: tabsCollapsed ? `${idx * 45}ms` : `${(3 - idx) * 45}ms` }}>
                      <span className="sg-tab-dot" style={{ background: t.color }} />
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{t.title}</span>
                    </div>
                  ))}
                  {showCollectionView && (
                    <div className="sg-tab is-active">
                      <i className="ri-bookmark-3-line" style={{ color: "var(--accent)", fontSize: 12 }} />
                      <span>拾页 · 收集页</span>
                    </div>
                  )}
                </div>
              </div>

              {/* 浏览器地址栏 + 拾页扩展图标 */}
              <div className="sg-browser-bar">
                <div style={{ display: "flex", gap: 6, color: "var(--text3)", fontSize: 12 }}>
                  <i className="ri-arrow-left-line" />
                  <i className="ri-arrow-right-line" />
                  <i className="ri-refresh-line" />
                </div>
                <div className="sg-omnibox">
                  <i className="ri-lock-line" style={{ fontSize: 11 }} />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {omniboxText}
                  </span>
                </div>
                <div className={`sg-ext-btn ${extPressed ? "is-pressed" : ""}`} title="拾页 Shiye">
                  <i className="ri-bookmark-3-line" />
                  {extPressed && <span className="sg-ripple is-active" style={{ left: "50%", top: "50%" }} />}
                </div>
              </div>

              {/* 浏览器内容视口 */}
              <div className="sg-browser-body">
                {/* 网页占位视图（第 1 幕 & 第 3 幕恢复后） */}
                <div className={`sg-mock-page ${showCollectionView && !(scene === 2 && phase === "done") ? "is-hidden" : ""}`}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 22, height: 22, borderRadius: 6, background: "var(--bg3)" }} />
                      <div style={{ width: 110, height: 10, borderRadius: 99, background: "var(--bg3)" }} />
                    </div>
                    <div
                      style={{
                        padding: "3px 9px",
                        borderRadius: 99,
                        background: scene === 2 && phase === "done" ? "var(--accent-bg)" : "var(--bg2)",
                        color: scene === 2 && phase === "done" ? "var(--accent)" : "var(--text3)",
                        fontSize: 11,
                        fontWeight: 500,
                      }}>
                      {scene === 2 && phase === "done" ? "已恢复 4 个标签页" : "当前浏览中 · 4 个标签页"}
                    </div>
                  </div>
                  <div
                    style={{
                      flex: 1,
                      borderRadius: 10,
                      border: "1px solid var(--border)",
                      background: "var(--card)",
                      padding: 14,
                      display: "grid",
                      gap: 10,
                      alignContent: "start",
                    }}>
                    <div style={{ width: "42%", height: 12, borderRadius: 99, background: "var(--bg3)" }} />
                    <div style={{ width: "86%", height: 9, borderRadius: 99, background: "var(--bg2)" }} />
                    <div style={{ width: "74%", height: 9, borderRadius: 99, background: "var(--bg2)" }} />
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 4 }}>
                      <div style={{ height: 56, borderRadius: 8, background: "var(--bg2)" }} />
                      <div style={{ height: 56, borderRadius: 8, background: "var(--bg2)" }} />
                    </div>
                  </div>
                </div>

                {/* 拾页收集页视图（第 2 幕 & 第 3 幕点击前） */}
                <div className={`sg-collection-view ${!showCollectionView || (scene === 2 && phase === "done") ? "is-hidden" : ""}`}>
                  <div className={`sg-demo-card ${cardRestoring ? "is-restoring" : ""}`}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: 10,
                      }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 12.5, fontWeight: 600 }}>工作窗口 · 4 个标签</span>
                        <span style={{ fontSize: 11, color: "var(--text3)" }}>刚刚</span>
                      </div>
                      <button type="button" className={`sg-restore-btn ${restorePressed ? "is-pressed" : ""}`}>
                        <i className="ri-external-link-line" />
                        <span>全部恢复</span>
                      </button>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                      {DEMO_TABS.map((t) => (
                        <div
                          key={t.title}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 7,
                            padding: "6px 8px",
                            borderRadius: 7,
                            background: "var(--bg)",
                            border: "1px solid var(--border)",
                            fontSize: 11.5,
                            minWidth: 0,
                          }}>
                          <span className="sg-tab-dot" style={{ background: t.color }} />
                          <span
                            style={{
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              color: "var(--text)",
                            }}>
                            {t.title}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* 模拟光标 */}
              <div
                className={`sg-cursor ${phase === "click" ? "is-clicking" : ""}`}
                style={{
                  left: cursorPos.left,
                  top: cursorPos.top,
                  opacity: cursorVisible ? 1 : 0,
                }}>
                <svg width="20" height="22" viewBox="0 0 20 22" fill="none">
                  <path
                    d="M2.5 1.8L17.2 11.4L10.3 12.8L7.2 19.3L2.5 1.8Z"
                    fill="#1A1A19"
                    stroke="#FFFFFF"
                    strokeWidth="1.6"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            </div>
          </div>

          {/* 底部三步切换胶囊 */}
          <div className="sg-steps">
            {SCENES.map((item) => {
              const active = scene === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => selectScene(item.id)}
                  className={`sg-step-btn ${active ? "is-active" : ""}`}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: active ? "var(--accent)" : "var(--text)" }}>
                    {item.title}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 3 }}>{item.desc}</div>
                  {active && !paused && (
                    <div
                      key={`${scene}-${cycleKey}`}
                      className="sg-step-progress"
                      style={{ animationDuration: `${SCENE_DURATION}ms` }}
                    />
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* 底部操作与右键菜单提示 */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
          }}>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={openCollection}
              style={{
                border: "none",
                borderRadius: "var(--r-s)",
                background: "var(--accent)",
                color: "#fff",
                padding: "9px 16px",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "var(--font)",
              }}>
              打开收集页
            </button>
            <button
              onClick={closeGuide}
              style={{
                border: "1px solid var(--border)",
                borderRadius: "var(--r-s)",
                background: "transparent",
                color: "var(--text2)",
                padding: "9px 16px",
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
                fontFamily: "var(--font)",
              }}>
              关闭引导
            </button>
          </div>
          <div style={{ fontSize: 12.5, color: "var(--text3)" }}>
            右键插件图标可随时打开「查看收集记录」或「查看使用引导」
          </div>
        </div>
      </div>
    </div>
  )
}

export default GuidePage
