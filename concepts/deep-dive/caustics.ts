// 수면 근처의 일렁이는 빛. 원시 WebGL 프래그먼트 셰이더 하나, 풀스크린 삼각형 하나.
// 프리멀티플라이드 알파로 내보내서 아래 물빛 위에 '빛만' 얹힌다 (screen 합성과 거의 같다).
// 수심(scroll)이 깊어지면 빛이 지수적으로 줄고, 완전히 사라지면 렌더를 멈춘다.
// WebGL이 없으면 같은 캔버스에 Canvas2D 그라디언트로 대신 그린다.

import { dpr, fitCanvas } from '../../src/lib/motion'

const VERT = `attribute vec2 p;varying vec2 v;void main(){v=p*.5+.5;gl_Position=vec4(p,0.,1.);}`

const FRAG = `
precision mediump float;
varying vec2 v;
uniform float uT, uScroll, uAspect;
void main(){
  vec2 uv = vec2(v.x * uAspect, 1.0 - v.y);          // 화면 높이 단위, y는 아래로
  float wy = uv.y + uScroll;                          // 문서 기준 수심
  float surf = 0.055 + 0.012*sin(uv.x*4.0 + uT*0.8) + 0.007*sin(uv.x*11.0 - uT*1.3);
  float d = wy - surf;                                // 수면 아래 거리

  // 고전적인 반복 sin 도메인 워프 caustic
  vec2 p = vec2(uv.x, wy*1.6) * 5.2 - 250.0;
  vec2 i = p; float c = 1.0; float t = uT*0.32;
  for (int n = 0; n < 4; n++) {
    float tn = t * (1.0 - 3.5 / float(n + 1));
    i = p + vec2(cos(tn - i.x) + sin(tn + i.y), sin(tn - i.y) + cos(tn + i.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x + tn) / 0.006), p.y / (cos(i.y + tn) / 0.006)));
  }
  c = 1.17 - pow(c / 4.0, 1.4);
  float caus = clamp(pow(abs(c), 7.0), 0.0, 1.2);

  // 수면 위 광원에서 비스듬히 내려오는 빛줄기
  vec2 dv = vec2(uv.x - uAspect*(0.62 + 0.06*sin(uT*0.05)), wy + 0.9);
  float a = atan(dv.x, dv.y);
  float rays = smoothstep(0.35, 1.0, sin(a*19.0 + uT*0.21 + 1.6*sin(a*6.0 - uT*0.13)));
  rays += 0.7*smoothstep(0.55, 1.0, sin(a*37.0 - uT*0.31 + 2.0*sin(a*3.0 + uT*0.07)));

  float under = step(0.0, d);
  float dd = max(d, 0.0);
  vec3 light = vec3(0.80, 1.0, 0.95);
  vec3 col = light * (caus * 0.55 * exp(-dd*2.1) + rays * 0.11 * exp(-dd*0.75)) * under;
  // 수면선의 반짝임과, 수면 너머(전반사)의 은빛
  col += vec3(0.9, 1.0, 1.0) * (smoothstep(0.018, 0.0, abs(d)) * 0.55);
  col += vec3(0.55, 0.78, 0.78) * (1.0 - under) * (0.35 + 0.25*caus);
  col = min(col, vec3(1.0));
  gl_FragColor = vec4(col, max(col.r, max(col.g, col.b)));
}`

export interface Caustics {
  /** scrollVh: 스크롤 위치(화면 높이 단위). 렌더할 게 없으면 false */
  render(t: number, scrollVh: number): boolean
  resize(): void
}

export function createCaustics(canvas: HTMLCanvasElement): Caustics {
  const gl = canvas.getContext('webgl', { alpha: true, antialias: false, premultipliedAlpha: true, powerPreference: 'low-power' })
  if (gl) {
    const prog = buildProgram(gl)
    if (prog) return webgl(canvas, gl, prog)
  }
  return fallback2d(canvas)
}

// 수면 빛은 저주파라 절반 해상도로 충분하다 (blend로 합성되므로 티가 나지 않는다)
const SCALE = () => Math.min(dpr(), 2) * 0.5

function buildProgram(gl: WebGLRenderingContext): WebGLProgram | null {
  const sh = (type: number, src: string) => {
    const s = gl.createShader(type)
    if (!s) return null
    gl.shaderSource(s, src)
    gl.compileShader(s)
    return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null
  }
  const vs = sh(gl.VERTEX_SHADER, VERT)
  const fs = sh(gl.FRAGMENT_SHADER, FRAG)
  const prog = gl.createProgram()
  if (!vs || !fs || !prog) return null
  gl.attachShader(prog, vs)
  gl.attachShader(prog, fs)
  gl.linkProgram(prog)
  return gl.getProgramParameter(prog, gl.LINK_STATUS) ? prog : null
}

function webgl(canvas: HTMLCanvasElement, gl: WebGLRenderingContext, prog: WebGLProgram): Caustics {
  gl.useProgram(prog)
  const buf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  const loc = gl.getAttribLocation(prog, 'p')
  gl.enableVertexAttribArray(loc)
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
  const uT = gl.getUniformLocation(prog, 'uT')
  const uScroll = gl.getUniformLocation(prog, 'uScroll')
  const uAspect = gl.getUniformLocation(prog, 'uAspect')
  let cleared = false

  const resize = () => {
    fitCanvas(canvas, SCALE())
    gl.viewport(0, 0, canvas.width, canvas.height)
  }
  resize()

  return {
    resize,
    render(t, scrollVh) {
      // 3.2 화면 아래로 내려가면 빛줄기까지 거의 0 → 한 번 지우고 멈춘다
      if (scrollVh > 3.2) {
        if (!cleared) {
          gl.clearColor(0, 0, 0, 0)
          gl.clear(gl.COLOR_BUFFER_BIT)
          cleared = true
        }
        return false
      }
      cleared = false
      gl.uniform1f(uT, t)
      gl.uniform1f(uScroll, scrollVh)
      gl.uniform1f(uAspect, canvas.width / canvas.height)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      return true
    },
  }
}

function fallback2d(canvas: HTMLCanvasElement): Caustics {
  const ctx = canvas.getContext('2d')
  const resize = () => {
    fitCanvas(canvas, SCALE())
  }
  resize()
  return {
    resize,
    render(t, scrollVh) {
      if (!ctx) return false
      const { width: W, height: H } = canvas
      ctx.clearRect(0, 0, W, H)
      const fade = Math.exp(-scrollVh * 1.2)
      if (fade < 0.01) return false
      const top = -scrollVh * H
      // 수면 쪽 은은한 빛
      const g = ctx.createLinearGradient(0, top, 0, top + H * 1.4)
      g.addColorStop(0, `rgba(200,255,245,${0.42 * fade})`)
      g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, W, H)
      // 천천히 흔들리는 빛줄기 몇 가닥
      ctx.save()
      ctx.translate(W * 0.62, top - H * 0.4)
      for (let k = 0; k < 7; k++) {
        const a = -0.5 + k * 0.17 + Math.sin(t * 0.2 + k * 1.7) * 0.03
        const rg = ctx.createLinearGradient(0, 0, 0, H * 1.8)
        rg.addColorStop(0, `rgba(210,255,248,${0.14 * fade})`)
        rg.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = rg
        ctx.beginPath()
        ctx.moveTo(0, 0)
        ctx.lineTo(Math.tan(a - 0.025) * H * 1.8, H * 1.8)
        ctx.lineTo(Math.tan(a + 0.025) * H * 1.8, H * 1.8)
        ctx.closePath()
        ctx.fill()
      }
      ctx.restore()
      return true
    },
  }
}
