import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: ["http://*/*", "https://*/*"],
  all_frames: false
}

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"

interface Hint {
  element: HTMLElement
  label: string
  badge: HTMLSpanElement
}

let active = false
let host: HTMLDivElement | null = null
let hints: Hint[] = []
let input = ""
let labelLength = 1
let frame = 0

function isVisible(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect()
  if (
    rect.width < 2 ||
    rect.height < 2 ||
    rect.bottom < 0 ||
    rect.right < 0 ||
    rect.top > window.innerHeight ||
    rect.left > window.innerWidth
  )
    return false

  const style = getComputedStyle(element)
  return (
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    Number(style.opacity) > 0 &&
    style.pointerEvents !== "none"
  )
}

function createLabel(index: number, length: number): string {
  let value = index
  let label = ""
  for (let i = 0; i < length; i++) {
    label = ALPHABET[value % ALPHABET.length] + label
    value = Math.floor(value / ALPHABET.length)
  }
  return label
}

function collectLinks(): HTMLElement[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>(
      "a[href], [data-shiye-link-hint]"
    )
  )
    .filter(isVisible)
    .sort((a, b) => {
      const ar = a.getBoundingClientRect()
      const br = b.getBoundingClientRect()
      return Math.abs(ar.top - br.top) > 8 ? ar.top - br.top : ar.left - br.left
    })
}

function updatePositions() {
  cancelAnimationFrame(frame)
  frame = requestAnimationFrame(() => {
    hints.forEach(({ element, badge }) => {
      const rect = element.getBoundingClientRect()
      badge.style.transform = `translate(${Math.max(2, rect.left)}px, ${Math.max(2, rect.top)}px)`
      badge.hidden = !isVisible(element)
    })
  })
}

function updateMatches() {
  let hasMatch = false
  hints.forEach(({ label, badge }) => {
    const matches = label.startsWith(input)
    badge.hidden = !matches
    badge.dataset.match = matches && input ? "true" : "false"
    hasMatch ||= matches
  })

  if (!hasMatch) {
    input = ""
    hints.forEach(({ badge }) => {
      badge.hidden = false
      badge.dataset.match = "false"
    })
  }
}

function deactivate() {
  if (!active) return
  active = false
  cancelAnimationFrame(frame)
  window.removeEventListener("keydown", onKeyDown, true)
  window.removeEventListener("resize", updatePositions, true)
  window.removeEventListener("scroll", updatePositions, true)
  window.removeEventListener("mousedown", deactivate, true)
  host?.remove()
  host = null
  hints = []
  input = ""
}

function onKeyDown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    event.preventDefault()
    event.stopImmediatePropagation()
    deactivate()
    return
  }

  if (event.key === "Backspace") {
    event.preventDefault()
    event.stopImmediatePropagation()
    input = input.slice(0, -1)
    updateMatches()
    return
  }

  const letter = /^Key([A-Z])$/.exec(event.code)?.[1]
  if (!letter) return
  event.preventDefault()
  event.stopImmediatePropagation()
  input += letter
  updateMatches()

  if (input.length !== labelLength) return
  const target = hints.find(({ label }) => label === input)?.element
  if (!target) return
  deactivate()
  target.click()
}

function activate() {
  if (active) {
    deactivate()
    return
  }

  const links = collectLinks()
  if (links.length === 0) return
  active = true
  input = ""
  labelLength = Math.max(
    1,
    Math.ceil(Math.log(links.length) / Math.log(ALPHABET.length))
  )

  host = document.createElement("div")
  host.dataset.shiyeLinkHints = ""
  const shadow = host.attachShadow({ mode: "closed" })
  const style = document.createElement("style")
  style.textContent = `
    :host { all: initial; }
    .layer { position: fixed; inset: 0; z-index: 2147483647; pointer-events: none; }
    .hint {
      position: fixed;
      min-width: 18px;
      height: 18px;
      padding: 0 4px;
      box-sizing: border-box;
      border: 1px solid rgba(76, 47, 20, .65);
      border-radius: 4px;
      background: #f4c66d;
      color: #2b2118;
      box-shadow: 0 2px 7px rgba(0, 0, 0, .25);
      font: 700 11px/16px ui-monospace, SFMono-Regular, Menlo, monospace;
      text-align: center;
      letter-spacing: .02em;
      transform-origin: top left;
    }
    .hint[data-match="true"] { background: #fff1c9; color: #b34f2e; }
  `
  const layer = document.createElement("div")
  layer.className = "layer"
  hints = links.map((element, index) => {
    const label = createLabel(index, labelLength)
    const badge = document.createElement("span")
    badge.className = "hint"
    badge.textContent = label
    badge.dataset.match = "false"
    layer.appendChild(badge)
    return { element, label, badge }
  })
  shadow.append(style, layer)
  document.documentElement.appendChild(host)
  updatePositions()

  window.addEventListener("keydown", onKeyDown, true)
  window.addEventListener("resize", updatePositions, true)
  window.addEventListener("scroll", updatePositions, true)
  window.addEventListener("mousedown", deactivate, true)
}

function onActivationKeyDown(event: KeyboardEvent) {
  if (
    event.code !== "KeyK" ||
    (!event.metaKey && !event.ctrlKey) ||
    event.altKey ||
    event.shiftKey ||
    event.repeat
  )
    return

  event.preventDefault()
  event.stopImmediatePropagation()
  activate()
}

window.addEventListener("keydown", onActivationKeyDown, true)
window.addEventListener("pagehide", deactivate)
