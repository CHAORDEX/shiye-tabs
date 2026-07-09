// 中文网字计划 CDN 的 Referer 网关补偿。
//
// 该 CDN（cn-font.claude-code-best.win，307 跳转至 ik.imagekit.io/chinesefonts7）
// 对 result.css 与 woff2 均校验 Referer：无 Referer 一律 403。而 Chrome 出于隐私
// 会剥离 chrome-extension:// 页面发出的 Referer，导致 <link> 与 fetch 都拿不到字体。
//
// 解决：用 declarativeNetRequest 在网络层为该 CDN 的请求补一个 Referer 头——正好补回被
// 浏览器剥离的那个头，符合服务商「需携带 Referer 访问」的规定。用路径正则匹配（不绑定
// 主机名），以兼容入口 301/307 重定向到的轮换网关主机。

const RULE_ID = 1001
const FONT_REFERER = "https://chinese-font.netlify.app/"
// 匹配 /packages/<id>/dist/... 或 /<bucket>/packages/<id>/dist/...
// 前者对应网关主机，后者对应 307 跳转目标 ik.imagekit.io/chinesefonts7/...
const URL_REGEX = "^https://[^/]+(/[^/]+)?/packages/[^/]+/dist/"

/** 注册（幂等）给字体 CDN 请求补 Referer 的动态规则。失败仅告警，不影响其它功能。 */
export async function ensureFontRefererRule(): Promise<void> {
  try {
    const rule: chrome.declarativeNetRequest.Rule = {
      id: RULE_ID,
      priority: 1,
      action: {
        type: "modifyHeaders" as chrome.declarativeNetRequest.RuleActionType,
        requestHeaders: [
          {
            header: "referer",
            operation: "set" as chrome.declarativeNetRequest.HeaderOperation,
            value: FONT_REFERER,
          },
        ],
      },
      condition: {
        regexFilter: URL_REGEX,
        resourceTypes: [
          "stylesheet",
          "font",
          "xmlhttprequest",
          "other",
        ] as chrome.declarativeNetRequest.ResourceType[],
      },
    }

    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [RULE_ID], // 先删后加，保证幂等
      addRules: [rule],
    })
  } catch (err) {
    console.warn("[拾页] 注册字体 Referer 规则失败：", err)
  }
}
