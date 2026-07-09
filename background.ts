import { ensureFontRefererRule } from "./font-referer"

export { }

// 给字体 CDN 请求补 Referer（详见 font-referer.ts）。动态规则可持久化，
// 但在 SW 唤醒 / 安装 / 浏览器启动时都确保一次，简单且幂等。
void ensureFontRefererRule()
chrome.runtime.onStartup.addListener(() => void ensureFontRefererRule())

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

const COLLECTION_URL = () => chrome.runtime.getURL("tabs/collection.html")
const GUIDE_URL = () => chrome.runtime.getURL("tabs/guide.html")

const SKIP_PREFIXES = [
  "chrome://",
  "chrome-extension://",
  "about:",
  "devtools://",
  "chrome-search://",
]

function isCollectable(url: string): boolean {
  const lower = url.toLowerCase()
  return !SKIP_PREFIXES.some((p) => lower.startsWith(p))
}

async function collectAllWindows() {
  const collectionUrl = COLLECTION_URL()

  // Load existing collections for global URL dedup
  const result = await chrome.storage.local.get("collections")
  const existing: Collection[] = result.collections || []
  const savedUrls = new Set(existing.flatMap((c) => c.tabs.map((t) => t.url)))

  // All tabs across all windows
  const allTabs = await chrome.tabs.query({})

  // All windows in order
  const allWindows = await chrome.windows.getAll({ populate: false })

  // Group tabs by windowId, preserving window order
  const tabsByWindow = new Map<number, chrome.tabs.Tab[]>()
  for (const win of allWindows) {
    if (win.id !== undefined) tabsByWindow.set(win.id, [])
  }
  for (const tab of allTabs) {
    if (tab.windowId !== undefined && tabsByWindow.has(tab.windowId)) {
      tabsByWindow.get(tab.windowId)!.push(tab)
    }
  }

  const newCollections: Collection[] = []
  const tabIdsToClose: number[] = []
  const now = Date.now()
  let windowIndex = 1

  for (const [, tabs] of tabsByWindow) {
    const validTabs = tabs
      .filter((tab) => {
        if (!tab.url || !isCollectable(tab.url)) return false
        // Skip already-saved URLs (global + cross-window dedup)
        if (savedUrls.has(tab.url)) return false
        return true
      })
      .map((tab) => {
        savedUrls.add(tab.url!) // prevent duplicates across windows
        return { title: tab.title || "无标题", url: tab.url! }
      })

    if (validTabs.length > 0) {
      newCollections.push({
        id: `${now}-w${windowIndex}`,
        timestamp: now + windowIndex,
        tabs: validTabs,
        windowLabel: `窗口 ${windowIndex}`,
      })
    }

    // Collect all tab IDs from this window for closing
    tabs.forEach((tab) => {
      if (tab.id !== undefined) tabIdsToClose.push(tab.id)
    })

    windowIndex++
  }

  // Persist (newest first)
  await chrome.storage.local.set({ collections: [...newCollections, ...existing] })

  // Open collection page
  const newTab = await chrome.tabs.create({ url: collectionUrl, active: true })

  // Close all other tabs after collection page is ready
  setTimeout(async () => {
    const toClose = tabIdsToClose.filter((id) => id !== newTab.id)
    // Remove in batches to stay within API limits
    for (let i = 0; i < toClose.length; i += 50) {
      await chrome.tabs.remove(toClose.slice(i, i + 50)).catch(() => { })
    }
  }, 300)
}

async function collectCurrentWindow() {
  const collectionUrl = COLLECTION_URL()

  // Load existing collections for URL dedup
  const result = await chrome.storage.local.get("collections")
  const existing: Collection[] = result.collections || []
  const savedUrls = new Set(existing.flatMap((c) => c.tabs.map((t) => t.url)))

  // Get current (focused) window
  const currentWindow = await chrome.windows.getCurrent({ populate: true })
  if (!currentWindow.id || !currentWindow.tabs) return

  const now = Date.now()
  const validTabs = currentWindow.tabs
    .filter((tab) => {
      if (!tab.url || !isCollectable(tab.url)) return false
      if (savedUrls.has(tab.url)) return false
      return true
    })
    .map((tab) => {
      savedUrls.add(tab.url!)
      return { title: tab.title || "无标题", url: tab.url! }
    })

  if (validTabs.length > 0) {
    const newCollection: Collection = {
      id: `${now}-w1`,
      timestamp: now,
      tabs: validTabs,
      windowLabel: "当前窗口",
    }
    await chrome.storage.local.set({
      collections: [newCollection, ...existing],
    })
  }

  // Open collection page in the same window
  const newTab = await chrome.tabs.create({ url: collectionUrl, active: true })

  // Close other tabs in this window only
  const tabIdsToClose = currentWindow.tabs
    .filter((tab) => tab.id !== undefined && tab.id !== newTab.id)
    .map((tab) => tab.id!)

  setTimeout(async () => {
    for (let i = 0; i < tabIdsToClose.length; i += 50) {
      await chrome.tabs.remove(tabIdsToClose.slice(i, i + 50)).catch(() => {})
    }
  }, 300)
}

// Click icon → collect based on mode setting
chrome.action.onClicked.addListener(async () => {
  try {
    const result = await chrome.storage.local.get("shiye-collect-mode")
    const mode = result["shiye-collect-mode"] || "all"
    if (mode === "current") {
      await collectCurrentWindow()
    } else {
      await collectAllWindows()
    }
  } catch (err) {
    console.error(err)
  }
})

// Right-click context menu → open collection list without collecting
chrome.runtime.onInstalled.addListener((details) => {
  void ensureFontRefererRule()

  chrome.contextMenus.create({
    id: "open-collection",
    title: "查看收集记录",
    contexts: ["action"],
  })

  chrome.contextMenus.create({
    id: "open-guide",
    title: "查看使用引导",
    contexts: ["action"],
  })

  if (details.reason === "install") {
    chrome.tabs.create({ url: GUIDE_URL(), active: true })
  }
})

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === "open-collection") {
    chrome.tabs.create({ url: COLLECTION_URL(), active: true })
  }
  if (info.menuItemId === "open-guide") {
    chrome.tabs.create({ url: GUIDE_URL(), active: true })
  }
})
