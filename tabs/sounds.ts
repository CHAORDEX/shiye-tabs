export type SoundCue =
  | "tap"
  | "toggle"
  | "open"
  | "delete"
  | "lift"
  | "drop"
  | "merge"
  | "split"
  | "complete"
  | "style"

let context: AudioContext | null = null
let output: GainNode | null = null
let lastPlayedAt = 0
let lastGearAt = 0

function getAudio() {
  context ??= new AudioContext({ latencyHint: "interactive" })
  if (!output) {
    output = context.createGain()
    output.gain.value = 0.72
    output.connect(context.destination)
  }
  if (context.state === "suspended") void context.resume()
  return { context, output }
}

function tone(
  ctx: AudioContext,
  destination: AudioNode,
  options: {
    at?: number
    frequency: number
    endFrequency?: number
    duration: number
    volume: number
    type?: OscillatorType
  }
) {
  const start = ctx.currentTime + (options.at ?? 0)
  const oscillator = ctx.createOscillator()
  const gain = ctx.createGain()
  oscillator.type = options.type ?? "sine"
  oscillator.frequency.setValueAtTime(options.frequency, start)
  if (options.endFrequency)
    oscillator.frequency.exponentialRampToValueAtTime(
      options.endFrequency,
      start + options.duration
    )
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.linearRampToValueAtTime(options.volume, start + 0.006)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + options.duration)
  oscillator.connect(gain)
  gain.connect(destination)
  oscillator.onended = () => {
    oscillator.disconnect()
    gain.disconnect()
  }
  oscillator.start(start)
  oscillator.stop(start + options.duration + 0.02)
}

function noise(
  ctx: AudioContext,
  destination: AudioNode,
  options: {
    at?: number
    duration: number
    volume: number
    frequency: number
    filter?: BiquadFilterType
  }
) {
  const start = ctx.currentTime + (options.at ?? 0)
  const length = Math.max(1, Math.floor(ctx.sampleRate * options.duration))
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i++)
    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (length * 0.18))

  const source = ctx.createBufferSource()
  const filter = ctx.createBiquadFilter()
  const gain = ctx.createGain()
  source.buffer = buffer
  filter.type = options.filter ?? "bandpass"
  filter.frequency.value = options.frequency
  filter.Q.value = 2.2
  gain.gain.value = options.volume
  source.connect(filter)
  filter.connect(gain)
  gain.connect(destination)
  source.onended = () => {
    source.disconnect()
    filter.disconnect()
    gain.disconnect()
  }
  source.start(start)
}

/**
 * 语义化 UI 音效：高频操作保持短促，重要结果才使用和声音型。
 * 仅在用户交互触发时调用，以符合浏览器的自动播放策略。
 */
export function playSound(cue: SoundCue, enabled: boolean) {
  if (!enabled || typeof AudioContext === "undefined") return
  const now = performance.now()
  if (now - lastPlayedAt < 28) return
  lastPlayedAt = now

  try {
    const { context: ctx, output: destination } = getAudio()
    switch (cue) {
      case "tap":
        noise(ctx, destination, {
          duration: 0.008,
          volume: 0.038,
          frequency: 3600,
          filter: "highpass"
        })
        break
      case "toggle":
        noise(ctx, destination, {
          duration: 0.009,
          volume: 0.025,
          frequency: 2800
        })
        tone(ctx, destination, {
          frequency: 680,
          endFrequency: 510,
          duration: 0.07,
          volume: 0.025
        })
        break
      case "open":
        tone(ctx, destination, {
          frequency: 360,
          endFrequency: 580,
          duration: 0.12,
          volume: 0.032,
          type: "triangle"
        })
        tone(ctx, destination, {
          at: 0.045,
          frequency: 720,
          duration: 0.1,
          volume: 0.016
        })
        break
      case "delete":
        tone(ctx, destination, {
          frequency: 310,
          endFrequency: 175,
          duration: 0.1,
          volume: 0.028,
          type: "triangle"
        })
        noise(ctx, destination, {
          duration: 0.016,
          volume: 0.018,
          frequency: 1200
        })
        break
      case "lift":
        tone(ctx, destination, {
          frequency: 440,
          endFrequency: 560,
          duration: 0.075,
          volume: 0.022,
          type: "triangle"
        })
        break
      case "drop":
        tone(ctx, destination, {
          frequency: 300,
          endFrequency: 235,
          duration: 0.085,
          volume: 0.03,
          type: "triangle"
        })
        noise(ctx, destination, {
          duration: 0.01,
          volume: 0.018,
          frequency: 1900
        })
        break
      case "merge": {
        [330, 440, 550].forEach((frequency, index) =>
          tone(ctx, destination, {
            at: index * 0.045,
            frequency,
            duration: 0.17,
            volume: index === 2 ? 0.025 : 0.018,
            type: "triangle"
          })
        )
        break
      }
      case "split":
        tone(ctx, destination, {
          frequency: 340,
          endFrequency: 420,
          duration: 0.1,
          volume: 0.024,
          type: "triangle"
        })
        tone(ctx, destination, {
          at: 0.055,
          frequency: 520,
          endFrequency: 680,
          duration: 0.14,
          volume: 0.022,
          type: "triangle"
        })
        tone(ctx, destination, {
          at: 0.055,
          frequency: 410,
          endFrequency: 320,
          duration: 0.14,
          volume: 0.018,
          type: "triangle"
        })
        break
      case "complete": {
        [523.25, 659.25, 783.99].forEach((frequency, index) =>
          tone(ctx, destination, {
            at: index * 0.07,
            frequency,
            duration: index === 2 ? 0.34 : 0.16,
            volume: index === 2 ? 0.032 : 0.024,
            type: "triangle"
          })
        )
        break
      }
      case "style":
        tone(ctx, destination, {
          frequency: 620,
          endFrequency: 820,
          duration: 0.13,
          volume: 0.022,
          type: "sine"
        })
        tone(ctx, destination, {
          at: 0.025,
          frequency: 1240,
          endFrequency: 1320,
          duration: 0.16,
          volume: 0.009
        })
        break
    }
  } catch {
    // 音频设备不可用时静默降级，不影响核心交互。
  }
}

/** 滚动棘轮：按滚动距离调用，内部限制触发频率，避免触控板产生声音洪泛。 */
export function playScrollGear(delta: number, enabled: boolean) {
  if (!enabled || delta === 0 || typeof AudioContext === "undefined") return
  const now = performance.now()
  if (now - lastGearAt < 30) return
  lastGearAt = now

  try {
    const { context: ctx, output: destination } = getAudio()
    if (ctx.state !== "running") return
    const force = Math.min(1, Math.max(0.25, Math.abs(delta) / 90))
    const upward = delta < 0
    noise(ctx, destination, {
      duration: 0.011,
      volume: 0.012 + force * 0.012,
      frequency: upward ? 3100 : 2600,
      filter: "bandpass"
    })
    tone(ctx, destination, {
      frequency: upward ? 620 : 520,
      endFrequency: upward ? 520 : 420,
      duration: 0.028,
      volume: 0.006 + force * 0.006,
      type: "triangle"
    })
  } catch {
    // 音频设备不可用时静默降级。
  }
}
