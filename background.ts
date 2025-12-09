export {}

interface TabInfo {
  title: string
  url: string
}

interface Collection {
  id: string
  timestamp: number
  tabs: TabInfo[]
}

// 监听插件图标点击事件
chrome.action.onClicked.addListener(async (tab) => {
  try {
    // 获取当前窗口所有标签页
    const allTabs = await chrome.tabs.query({ currentWindow: true })

    // 过滤并提取标签页信息
    const tabInfos = allTabs
      .filter((tab) => tab.url && tab.id && !tab.url.startsWith("chrome://"))
      .map((tab) => ({
        title: tab.title || "无标题",
        url: tab.url!
      }))

    console.log("收集到的标签页:", tabInfos)

    // 创建新的收集记录
    const newCollection: Collection = {
      id: Date.now().toString(),
      timestamp: Date.now(),
      tabs: tabInfos
    }

    // 获取现有的收集记录
    const result = await chrome.storage.local.get("collections")
    const collections: Collection[] = result.collections || []

    // 添加新的收集记录
    collections.push(newCollection)
    await chrome.storage.local.set({ collections })

    // 创建新的展示标签页
    const collectionUrl = chrome.runtime.getURL("tabs/collection.html")
    const newTab = await chrome.tabs.create({ url: collectionUrl, active: true })

    // 关闭所有其他标签页（除了新创建的展示页）
    const tabsToClose = allTabs
      .filter((tab) => tab.id && tab.id !== newTab.id)
      .map((tab) => tab.id!)

    // 延迟一下确保新标签页已创建
    setTimeout(async () => {
      if (tabsToClose.length > 0) {
        await chrome.tabs.remove(tabsToClose)
      }
    }, 200)
  } catch (error) {
    console.error("收集标签页失败:", error)
  }
})
