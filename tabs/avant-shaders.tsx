import { useEffect, useRef } from "react"

export type AvantShaderId =
  | "inkWash"
  | "causticPrism"
  | "topoContour"
  | "ferrofluid"

const VERT_SRC = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`

const COMMON_NOISE = `
precision highp float;
varying vec2 v_uv;
uniform vec2 u_res;
uniform float u_time;
uniform vec2 u_mouse;
uniform float u_hover;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = rot * p * 2.02;
    a *= 0.5;
  }
  return v;
}
`

const FRAG_SHADERS: Record<AvantShaderId, string> = {
  /* 1. 泼墨宣纸 · 浅色东方水墨域扭曲 + 鼠标笔锋晕染 */
  inkWash: `
${COMMON_NOISE}
void main() {
  vec2 aspect = vec2(u_res.x / max(u_res.y, 1.0), 1.0);
  vec2 uv = v_uv * aspect;
  vec2 m = u_mouse * aspect;

  float t = u_time * 0.16;
  vec2 q = vec2(fbm(uv * 1.6 + vec2(t, -t * 0.6)), fbm(uv * 1.6 + vec2(-t * 0.5, t * 0.8) + 4.2));
  vec2 r = vec2(fbm(uv * 2.1 + 1.8 * q + vec2(1.7, 9.2) + t * 0.35), fbm(uv * 2.1 + 1.8 * q + vec2(8.3, 2.8) - t * 0.3));
  float f = fbm(uv * 1.9 + 1.5 * r);

  // 鼠标像蘸水毛笔一样在墨晕中荡开一圈淡墨涟漪
  float dist = length(uv - m);
  float brush = exp(-dist * 3.8) * u_hover;
  float ripple = sin(dist * 16.0 - u_time * 2.6) * 0.5 + 0.5;
  f = clamp(f + brush * (0.22 + 0.12 * ripple), 0.0, 1.0);

  // 宣纸底色 + 苍灰水墨 + 极淡朱砂茶韵
  vec3 paper = vec3(0.961, 0.945, 0.910);
  vec3 paleInk = vec3(0.835, 0.824, 0.800);
  vec3 deepInk = vec3(0.675, 0.682, 0.675);
  vec3 cinnabar = vec3(0.875, 0.725, 0.665);

  vec3 col = mix(paper, paleInk, smoothstep(0.32, 0.74, f));
  col = mix(col, deepInk, smoothstep(0.66, 0.96, f) * 0.55);
  col = mix(col, cinnabar, smoothstep(0.55, 0.85, q.x) * 0.18);

  // 宣纸微纤维颗粒
  float grain = (hash(gl_FragCoord.xy * 0.5) - 0.5) * 0.022;
  col += grain;

  gl_FragColor = vec4(col, 1.0);
}
`,

  /* 2. 棱镜色散 · 浅色长虹玻璃折射 + 鼠标光源角度交互 */
  causticPrism: `
${COMMON_NOISE}
void main() {
  vec2 uv = v_uv;
  float t = u_time * 0.22;

  // 纵向长虹玻璃柱面折射
  float flutes = 26.0;
  float cell = fract(uv.x * flutes);
  float lens = (cell - 0.5) * 2.0;
  float refractOffset = sin(lens * 1.5707) * 0.028;

  // 鼠标实时改变光源入射方向
  vec2 lightCenter = mix(vec2(0.5 + 0.25 * sin(t), 0.45 + 0.2 * cos(t * 0.8)), u_mouse, 0.65 * u_hover + 0.15);

  // RGB 物理微量色差分离
  vec2 uvR = vec2(uv.x + refractOffset * 1.18, uv.y);
  vec2 uvG = vec2(uv.x + refractOffset * 1.00, uv.y);
  vec2 uvB = vec2(uv.x + refractOffset * 0.82, uv.y);

  float bandR = exp(-length((uvR - lightCenter) * vec2(1.2, 1.6)) * 2.1);
  float bandG = exp(-length((uvG - lightCenter) * vec2(1.2, 1.6)) * 2.15);
  float bandB = exp(-length((uvB - lightCenter) * vec2(1.2, 1.6)) * 2.2);

  float wave = fbm(vec2(uv.x * 2.4 + refractOffset * 6.0, uv.y * 2.0 - t * 0.4));
  vec3 base = vec3(0.955, 0.963, 0.974);
  vec3 tint = vec3(
    0.96 - 0.06 * wave + 0.09 * bandR,
    0.96 - 0.05 * wave + 0.07 * bandG,
    0.98 - 0.03 * wave + 0.10 * bandB
  );

  // 长虹玻璃柱面柔和边缘高光与暗影
  float fluteShade = cos(lens * 3.14159) * 0.022;
  float rim = pow(1.0 - abs(lens), 4.0) * 0.025;
  vec3 col = mix(base, tint, 0.78) + fluteShade + rim;

  // 极细棱镜彩虹边缘微芒
  vec3 prism = vec3(bandR - bandG, (bandG - bandB) * 0.5, bandB - bandR) * 0.65;
  col += prism * (0.28 + 0.35 * abs(lens));

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`,

  /* 3. 等高地形 · 深色动态瑞士等高线 + 鼠标磁力隆起 */
  topoContour: `
${COMMON_NOISE}
void main() {
  vec2 aspect = vec2(u_res.x / max(u_res.y, 1.0), 1.0);
  vec2 uv = v_uv * aspect;
  vec2 m = u_mouse * aspect;

  float t = u_time * 0.14;
  float h = fbm(uv * 2.2 + vec2(t * 0.5, -t * 0.35));
  h += 0.35 * fbm(uv * 4.2 - vec2(t * 0.4, t * 0.25));

  // 鼠标像地形引力源，靠近时局部地形微微隆起
  float dist = length(uv - m);
  float mound = exp(-dist * 3.2) * 0.32 * u_hover;
  h += mound;

  // 多层级等高线切割
  float levels = 11.0;
  float scaled = h * levels;
  float fracL = abs(fract(scaled - 0.5) - 0.5);
  float line = 1.0 - smoothstep(0.015, 0.065, fracL);

  // 每隔 4 条加粗一条主等高线（暖朱砂点缀）
  float majorFrac = abs(fract(scaled * 0.25 - 0.5) - 0.5);
  float majorLine = 1.0 - smoothstep(0.008, 0.028, majorFrac);

  vec3 bg = mix(vec3(0.062, 0.066, 0.072), vec3(0.095, 0.102, 0.112), clamp(h, 0.0, 1.0));
  vec3 minorCol = vec3(0.28, 0.32, 0.36);
  vec3 majorCol = vec3(0.85, 0.47, 0.34);

  vec3 col = mix(bg, minorCol, line * 0.45);
  col = mix(col, majorCol, majorLine * (0.48 + 0.35 * exp(-dist * 2.6) * u_hover));

  // 指针处极淡测绘雷达光晕
  col += vec3(0.85, 0.47, 0.34) * exp(-dist * 4.5) * 0.12 * u_hover;

  gl_FragColor = vec4(col, 1.0);
}
`,

  /* 4. 磁流体 · 深色暗银金属磁场波峰 + 鼠标磁铁吸引 */
  ferrofluid: `
${COMMON_NOISE}
float field(vec2 p, vec2 m, float t, float hov) {
  float d = length(p - m);
  float pull = exp(-d * 3.0) * hov;
  float f = fbm(p * 2.6 + vec2(t * 0.4, -t * 0.3));
  float spikes = sin(p.x * 11.0 + f * 6.0 + t) * cos(p.y * 11.0 - f * 5.0 - t * 0.8);
  float radial = cos(d * 18.0 - t * 3.2) * pull;
  return f * 0.72 + spikes * (0.14 + 0.18 * pull) + radial * 0.22;
}

void main() {
  vec2 aspect = vec2(u_res.x / max(u_res.y, 1.0), 1.0);
  vec2 uv = v_uv * aspect;
  vec2 m = u_mouse * aspect;
  float t = u_time * 0.32;

  // 有限差分求液面法线，模拟真实磁流体金属反光
  float e = 0.008;
  float h0 = field(uv, m, t, u_hover);
  float hx = field(uv + vec2(e, 0.0), m, t, u_hover);
  float hy = field(uv + vec2(0.0, e), m, t, u_hover);
  vec3 normal = normalize(vec3((h0 - hx) * 6.5, (h0 - hy) * 6.5, 1.0));

  vec3 lightDir1 = normalize(vec3(0.45, 0.65, 0.8));
  vec3 lightDir2 = normalize(vec3(-0.6, -0.35, 0.7));
  vec3 viewDir = vec3(0.0, 0.0, 1.0);

  float diff = max(dot(normal, lightDir1), 0.0);
  vec3 half1 = normalize(lightDir1 + viewDir);
  vec3 half2 = normalize(lightDir2 + viewDir);
  float spec1 = pow(max(dot(normal, half1), 0.0), 26.0);
  float spec2 = pow(max(dot(normal, half2), 0.0), 18.0);
  float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 3.0);

  vec3 base = vec3(0.055, 0.060, 0.070);
  vec3 silver = vec3(0.56, 0.64, 0.74);
  vec3 warmRim = vec3(0.84, 0.56, 0.42);

  vec3 col = base + vec3(0.05, 0.06, 0.08) * diff;
  col += silver * spec1 * 0.46;
  col += warmRim * spec2 * 0.22;
  col += mix(silver, warmRim, 0.35) * fresnel * 0.28;

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`
}

function compileShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string
): WebGLShader | null {
  const s = gl.createShader(type)
  if (!s) return null
  gl.shaderSource(s, source)
  gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    gl.deleteShader(s)
    return null
  }
  return s
}

export function AvantShaderCanvas({
  shader,
  visible,
  reduceMotion
}: {
  shader: AvantShaderId
  visible: boolean
  reduceMotion: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mouseRef = useRef({ tx: 0.5, ty: 0.5, x: 0.5, y: 0.5, th: 0, h: 0 })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const hostCard = canvas.closest(".kt-collection-card") as HTMLElement | null
    if (!hostCard) return

    const onMove = (e: MouseEvent) => {
      const rect = hostCard.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return
      mouseRef.current.tx = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
      mouseRef.current.ty = Math.min(1, Math.max(0, 1 - (e.clientY - rect.top) / rect.height))
      mouseRef.current.th = 1
    }
    const onLeave = () => {
      mouseRef.current.th = 0
    }

    hostCard.addEventListener("mousemove", onMove, { passive: true })
    hostCard.addEventListener("mouseleave", onLeave, { passive: true })
    return () => {
      hostCard.removeEventListener("mousemove", onMove)
      hostCard.removeEventListener("mouseleave", onLeave)
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !visible) return

    const gl = canvas.getContext("webgl", {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
      powerPreference: "low-power"
    })
    if (!gl) return

    const vs = compileShader(gl, gl.VERTEX_SHADER, VERT_SRC)
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SHADERS[shader])
    if (!vs || !fs) {
      if (vs) gl.deleteShader(vs)
      if (fs) gl.deleteShader(fs)
      return
    }

    const program = gl.createProgram()
    if (!program) {
      gl.deleteShader(vs)
      gl.deleteShader(fs)
      return
    }
    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program)
      gl.deleteShader(vs)
      gl.deleteShader(fs)
      return
    }

    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    )

    const aPos = gl.getAttribLocation(program, "a_pos")
    const uRes = gl.getUniformLocation(program, "u_res")
    const uTime = gl.getUniformLocation(program, "u_time")
    const uMouse = gl.getUniformLocation(program, "u_mouse")
    const uHover = gl.getUniformLocation(program, "u_hover")

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      const w = Math.max(1, Math.floor(rect.width * dpr))
      const h = Math.max(1, Math.floor(rect.height * dpr))
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
      }
      gl.viewport(0, 0, w, h)
    }

    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    let rafId = 0
    const start = performance.now()

    const render = (now: number) => {
      const m = mouseRef.current
      m.x += (m.tx - m.x) * 0.08
      m.y += (m.ty - m.y) * 0.08
      m.h += (m.th - m.h) * 0.06

      gl.useProgram(program)
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
      gl.enableVertexAttribArray(aPos)
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)

      gl.uniform2f(uRes, canvas.width, canvas.height)
      gl.uniform1f(uTime, reduceMotion ? 1.5 : (now - start) * 0.001)
      gl.uniform2f(uMouse, m.x, m.y)
      gl.uniform1f(uHover, m.h)

      gl.drawArrays(gl.TRIANGLES, 0, 6)
      if (!reduceMotion) {
        rafId = requestAnimationFrame(render)
      }
    }

    rafId = requestAnimationFrame(render)

    return () => {
      cancelAnimationFrame(rafId)
      ro.disconnect()
      gl.deleteBuffer(buffer)
      gl.deleteProgram(program)
      gl.deleteShader(vs)
      gl.deleteShader(fs)
    }
  }, [shader, visible, reduceMotion])

  return (
    <canvas
      ref={canvasRef}
      className="kt-paper-shader-canvas"
      style={{ width: "100%", height: "100%", display: "block" }}
    />
  )
}
