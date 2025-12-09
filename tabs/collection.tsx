import { useState, useEffect } from "react"

interface TabInfo {
  title: string
  url: string
}

interface Collection {
  id: string
  timestamp: number
  tabs: TabInfo[]
}

function CollectionPage() {
  const [collections, setCollections] = useState<Collection[]>([])
  const [loading, setLoading] = useState(true)

  const loadCollections = async () => {
    try {
      const result = await chrome.storage.local.get("collections")
      console.log("从 storage 获取的数据:", result)

      if (result.collections && Array.isArray(result.collections)) {
        console.log("设置收集记录:", result.collections)
        setCollections(result.collections)
      } else {
        console.log("没有找到收集记录")
      }
    } catch (e) {
      console.error("加载数据失败", e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCollections()
  }, [])

  const openAllTabs = async (collectionId: string) => {
    const collection = collections.find((c) => c.id === collectionId)
    if (!collection) return

    collection.tabs.forEach((tab) => {
      chrome.tabs.create({ url: tab.url, active: false })
    })

    // 打开后删除该收集记录
    await deleteCollection(collectionId)
  }

  const openSingleTab = (url: string) => {
    chrome.tabs.create({ url, active: false })
  }

  const deleteCollection = async (collectionId: string) => {
    const updatedCollections = collections.filter((c) => c.id !== collectionId)
    await chrome.storage.local.set({ collections: updatedCollections })
    setCollections(updatedCollections)
  }

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp)
    return date.toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    })
  }

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: 24 }}>
      <h1 style={{ margin: "0 0 24px 0" }}>收集的标签页</h1>

      {loading ? (
        <p style={{ color: "#999", textAlign: "center", marginTop: 64 }}>
          加载中...
        </p>
      ) : collections.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {collections.map((collection) => (
            <div
              key={collection.id}
              style={{
                border: "2px solid #ddd",
                borderRadius: 12,
                padding: 20,
                backgroundColor: "white"
              }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 16,
                  paddingBottom: 12,
                  borderBottom: "1px solid #eee"
                }}>
                <div>
                  <h2 style={{ margin: "0 0 4px 0", fontSize: 18 }}>
                    收集时间: {formatDate(collection.timestamp)}
                  </h2>
                  <p style={{ margin: 0, color: "#666", fontSize: 14 }}>
                    共 {collection.tabs.length} 个标签页
                  </p>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => openAllTabs(collection.id)}
                    style={{
                      padding: "10px 20px",
                      backgroundColor: "#4CAF50",
                      color: "white",
                      border: "none",
                      borderRadius: 6,
                      cursor: "pointer",
                      fontSize: 14,
                      fontWeight: 500
                    }}>
                    打开全部
                  </button>
                  <button
                    onClick={() => deleteCollection(collection.id)}
                    style={{
                      padding: "10px 20px",
                      backgroundColor: "#f44336",
                      color: "white",
                      border: "none",
                      borderRadius: 6,
                      cursor: "pointer",
                      fontSize: 14,
                      fontWeight: 500
                    }}>
                    删除
                  </button>
                </div>
              </div>

              <div style={{ display: "grid", gap: 8 }}>
                {collection.tabs.map((tab, index) => (
                  <div
                    key={index}
                    style={{
                      padding: 12,
                      border: "1px solid #e0e0e0",
                      borderRadius: 6,
                      cursor: "pointer",
                      transition: "all 0.2s",
                      backgroundColor: "#fafafa"
                    }}
                    onClick={() => openSingleTab(tab.url)}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = "#f0f0f0"
                      e.currentTarget.style.borderColor = "#2196F3"
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "#fafafa"
                      e.currentTarget.style.borderColor = "#e0e0e0"
                    }}>
                    <div
                      style={{
                        fontWeight: 500,
                        marginBottom: 4,
                        fontSize: 14
                      }}>
                      {tab.title}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "#666",
                        wordBreak: "break-all"
                      }}>
                      {tab.url}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p style={{ color: "#999", textAlign: "center", marginTop: 64 }}>
          还没有收集记录
        </p>
      )}
    </div>
  )
}

export default CollectionPage
