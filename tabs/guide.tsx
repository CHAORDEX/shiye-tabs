import { useEffect, useState } from "react"
import "remixicon/fonts/remixicon.css"
import "../style.css"

interface Collection {
  id: string
  timestamp: number
  tabs: { title: string; url: string }[]
  windowLabel?: string
}

function GuidePage() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    chrome.storage.local.get("collections").then((r) => {
      const collections = (r.collections || []) as Collection[]
      setCount(collections.length)
    })
  }, [])

  const openCollection = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("tabs/collection.html"), active: true })
  }

  const closeGuide = () => {
    window.close()
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)" }}>
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "48px 24px 64px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: 12,
              background: "var(--accent-bg)",
              border: "1px solid rgba(217,119,86,.2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 20,
              color: "var(--accent)",
            }}>
            <i className="ri-bookmark-3-line"></i>
          </div>
          <div>
            <div style={{ fontSize: 24, fontWeight: 650, letterSpacing: "-.01em" }}>欢迎使用 拾页 Shiye</div>
            <div style={{ fontSize: 13, color: "var(--text2)", marginTop: 4 }}>
              一键收集当前窗口标签页，随时回看与恢复
            </div>
          </div>
        </div>

        <div
          style={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r)",
            boxShadow: "var(--shadow-s)",
            padding: "20px 22px",
            marginBottom: 14,
          }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>如何使用</div>
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "flex", gap: 10 }}>
              <span style={{ color: "var(--accent)", fontWeight: 700 }}>1</span>
              <span style={{ color: "var(--text2)", fontSize: 14 }}>点击浏览器工具栏中的「拾页」图标。</span>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <span style={{ color: "var(--accent)", fontWeight: 700 }}>2</span>
              <span style={{ color: "var(--text2)", fontSize: 14 }}>
                插件会收集当前所有窗口可保存的网页标签，并自动打开收集页。
              </span>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <span style={{ color: "var(--accent)", fontWeight: 700 }}>3</span>
              <span style={{ color: "var(--text2)", fontSize: 14 }}>
                在收集页可以「全部恢复」、打开单个标签，或删除不需要的记录。
              </span>
            </div>
          </div>
        </div>

        <div
          style={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r)",
            boxShadow: "var(--shadow-s)",
            padding: "18px 22px",
            marginBottom: 22,
          }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>当前状态</div>
          <div style={{ fontSize: 13, color: "var(--text2)" }}>已保存收集记录：{count} 条</div>
          <div style={{ fontSize: 13, color: "var(--text3)", marginTop: 6 }}>
            你也可以在插件图标右键菜单中随时打开「查看收集记录」和「查看使用引导」。
          </div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={openCollection}
            style={{
              border: "none",
              borderRadius: "var(--r-s)",
              background: "var(--accent)",
              color: "#fff",
              padding: "9px 14px",
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
              padding: "9px 14px",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
              fontFamily: "var(--font)",
            }}>
            关闭引导
          </button>
        </div>
      </div>
    </div>
  )
}

export default GuidePage
