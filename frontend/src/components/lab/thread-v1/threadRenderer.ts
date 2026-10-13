/**
 * 「线索」艺术装置的 WebGL 渲染器。
 *
 * 一束细线（fiber），每根线由若干顶点组成，顶点只携带 (u, t)：
 *   u = 第几根线（0–1），t = 沿线的位置（0–1）
 * 线的形态全部在顶点着色器里计算，四种形态按权重混合：
 *   idle 丝带 / listen 耳廓 / think 三股编织 / speak 声波
 * 滚动时再在屏幕空间里混合到「垂向下一章节卡片」的形态。
 *
 * 不依赖任何三方库，只用 WebGL1 + GL_LINES，保证兼容性和包体积。
 */

export const TRAIL_SIZE = 12;
export const SYL_SIZE = 24;
export const IMP_SIZE = 8;

/** 由 React 组件每帧写入的模拟状态（可变对象，避免触发重渲染） */
export interface ThreadSim {
  time: number;
  /** 装置中心与尺度，CSS 像素 */
  cx: number;
  cy: number;
  scale: number;
  /** 形态混合：from → to，morph 0–1 */
  from: [number, number, number, number];
  to: [number, number, number, number];
  morph: number;
  /** 整体朝向（弹簧平滑后的鼠标视差） */
  yaw: number;
  pitch: number;
  /** 开场：画线进度 / 一根线展开成一束 */
  reveal: number;
  unfurl: number;
  /** 倾听能量（打字、鼠标会提高它） */
  energy: number;
  /** 键入脉冲的时间戳 */
  impulses: Float32Array;
  /** 回应时的音节：time, amp */
  syllables: Float32Array;
  /** 鼠标轨迹：x, y, vx, vy */
  trail: Float32Array;
  trailAge: Float32Array;
  /** 滚动过渡 0–1，以及下一章节三张卡片的锚点：x, y, width, 0 */
  scroll: number;
  anchors: Float32Array;
  /** 标题三行的范围：x0, y0, x1, y1，线经过时变淡 */
  shield: Float32Array;
  /** 整体透明度 */
  fade: number;
}

export function createSim(): ThreadSim {
  const impulses = new Float32Array(IMP_SIZE).fill(-100);
  const syllables = new Float32Array(SYL_SIZE * 2);
  for (let i = 0; i < SYL_SIZE; i++) syllables[i * 2] = -100;
  const trailAge = new Float32Array(TRAIL_SIZE).fill(100);
  return {
    time: 0,
    cx: 0,
    cy: 0,
    scale: 300,
    from: [1, 0, 0, 0],
    to: [1, 0, 0, 0],
    morph: 1,
    yaw: 0,
    pitch: 0,
    reveal: 0,
    unfurl: 0,
    energy: 0,
    impulses,
    syllables,
    trail: new Float32Array(TRAIL_SIZE * 4),
    trailAge,
    scroll: 0,
    anchors: new Float32Array(12),
    shield: new Float32Array(12),
    fade: 1,
  };
}

const VERT = /* glsl */ `
precision highp float;
attribute vec2 aUT;

uniform vec2 uRes;
uniform float uTime;
uniform vec2 uC;
uniform float uS;
uniform vec4 uFrom;
uniform vec4 uTo;
uniform float uMorph;
uniform vec2 uRot;
uniform float uReveal;
uniform float uUnfurl;
uniform float uEnergy;
uniform float uImp[${IMP_SIZE}];
uniform vec2 uSyl[${SYL_SIZE}];
uniform vec4 uTrail[${TRAIL_SIZE}];
uniform float uTrailAge[${TRAIL_SIZE}];
uniform float uScroll;
uniform vec4 uAnchor[3];
uniform vec4 uShield[3];

varying float vAlpha;
varying float vTone;
varying float vGlow;

const float PI = 3.14159265;
const float TAU = 6.28318531;

float hash(float n) { return fract(sin(n * 127.1 + 11.7) * 43758.5453); }

vec3 rotY(vec3 p, float a) {
  float c = cos(a), s = sin(a);
  return vec3(p.x * c + p.z * s, p.y, -p.x * s + p.z * c);
}
vec3 rotX(vec3 p, float a) {
  float c = cos(a), s = sin(a);
  return vec3(p.x, p.y * c - p.z * s, p.y * s + p.z * c);
}

// 丝带的横截面方向：沿切线建立局部坐标系，再按扭转角旋转
vec3 bandDir(vec3 tangent, float th) {
  vec3 T = normalize(tangent);
  vec3 N = normalize(cross(T, vec3(0.0, 0.0, 1.0)));
  vec3 B = cross(T, N);
  return N * cos(th) + B * sin(th);
}

// 待命：一笔丝带从画面外扫进来，末端卷起一个会呼吸的旋（欧拉螺线，曲率随长度线性增加）
vec3 ribbon(float u, float t) {
  float T = uTime;
  float L = 4.1;
  float sig = t * L;
  float b = 0.78 + 0.1 * sin(T * 0.85);
  float a = 0.08 + 0.05 * sin(T * 0.31);
  float phi0 = PI - 0.62 + 0.08 * sin(T * 0.2);
  // 从当前位置积分到末端，得到相对旋心的位置
  vec2 acc = vec2(0.0);
  float h = (L - sig) / 40.0;
  for (int i = 0; i < 40; i++) {
    float x = sig + (float(i) + 0.5) * h;
    float ph = phi0 + a * x + b * x * x;
    acc += vec2(cos(ph), sin(ph)) * h;
  }
  float phi = phi0 + a * sig + b * sig * sig;
  vec3 c = vec3(-acc, (1.0 - t) * -0.35 + sin(t * 5.0 + T * 0.4) * 0.08);
  float breath = 0.8 + 0.2 * sin(T * 0.85 + 1.2);
  float th = t * 5.0 + T * 0.3 + sin(T * 0.13) * 0.8;
  float v = (u - 0.5) * 0.7 * breath * uUnfurl * mix(1.0, 0.28, t);
  vec3 dir = vec3(-sin(phi) * cos(th), cos(phi) * cos(th), sin(th));
  vec3 p = c + dir * v;
  p.y += sin(t * 11.0 - T * 1.3 + u * 5.0) * 0.006;
  // 整体转一个角度，让尾巴从右上方的空白处进入画面
  float ca = cos(-0.8), sa = sin(-0.8);
  p.xy = vec2(p.x * ca - p.y * sa, p.x * sa + p.y * ca);
  return p + vec3(-0.1, 0.02, 0.0);
}

// 倾听：丝带卷成耳蜗一样的螺旋，声音（你打的每个字）从外圈沿螺旋传到中心
vec3 ear(float u, float t) {
  float T = uTime;
  float th = mix(14.2, 0.9, t);
  float r = 0.058 * exp(0.18 * th);
  float imp = 0.0;
  for (int i = 0; i < ${IMP_SIZE}; i++) {
    float age = T - uImp[i];
    if (age > 0.0 && age < 2.6) {
      float d = (t - age * 0.5) * 11.0;
      imp += exp(-d * d) * (1.0 - age / 2.6);
    }
  }
  float lane = (u - 0.5) * 0.62;
  float wave = sin(t * 46.0 - T * 5.0) * (0.006 + 0.02 * uEnergy);
  float rr = r * (1.0 + lane + wave + imp * 0.16);
  float a = th + T * 0.12;
  vec3 p = vec3(cos(a) * rr, sin(a) * rr, (1.0 - r / 0.75) * 0.45 - imp * 0.08 + lane * 0.05);
  // 转向左下方的对话卡片
  p = rotX(rotY(p, -0.55), 0.3);
  return p + vec3(0.04, 0.06, 0.0);
}

// 思考：线一根根离开，编成三股（你的回答 / 你的简历 / 岗位要求）
vec3 braid(float u, float t) {
  float T = uTime;
  float s = t * 2.0 - 1.0;
  float k = floor(u * 2.999);
  float l = fract(u * 3.0);
  float taper = 1.0 - pow(abs(s), 3.0);
  float ph = s * PI * 2.0 - T * 0.85 + k * TAU / 3.0;
  vec3 c = vec3(s * 1.2, sin(ph) * 0.24 * taper, sin(2.0 * ph) * 0.14 * taper);
  c.y += -cos(s * 1.4) * 0.1 + 0.04;
  float tube = (0.05 + 0.02 * sin(T * 1.6 + s * 4.0 + k)) * (0.35 + 0.65 * taper);
  float psi = l * TAU + s * 7.0 + T * 0.7;
  return c + vec3(0.0, cos(psi), sin(psi)) * tube;
}

// 回应：线摊平成一层层五线谱，问题的每个字都是一次发声，波从声源向外传
vec3 stave(float u, float t) {
  float T = uTime;
  float s = t * 2.0 - 1.0;
  float row = u - 0.5;
  vec3 p = vec3(s * 1.45, row * 0.5, row * 1.05);
  float dist = abs(s + 0.55);
  float tau = T - dist * 0.85;
  float env = 0.0;
  for (int i = 0; i < ${SYL_SIZE}; i++) {
    float d = tau - uSyl[i].x;
    env += uSyl[i].y * exp(-d * d * 30.0);
  }
  env = min(env, 1.4) * exp(-dist * 0.75);
  float carrier = sin(s * 31.0 - T * 8.0 + row * 6.0) * 0.6 + sin(s * 11.0 + T * 3.0 - row * 4.0) * 0.4;
  float rowGain = 0.3 + 0.7 * exp(-row * row * 9.0);
  p.y -= carrier * env * 0.2 * rowGain;
  p.y += sin(s * 2.6 + T * 0.5 + row * 3.0) * 0.018;
  return p;
}

void main() {
  float u = aUT.x;
  float t = aUT.y;
  float hu = hash(u * 91.7);

  // 每根线按自己的顺序迁移，形成「重组」感
  float key = mix(u, hu, 0.65);
  float pm = smoothstep(key * 0.45, key * 0.45 + 0.55, uMorph);
  vec4 w = mix(uFrom, uTo, pm);

  vec3 p = vec3(0.0);
  if (w.x > 0.001) p += ribbon(u, t) * w.x;
  if (w.y > 0.001) p += ear(u, t) * w.y;
  if (w.z > 0.001) p += braid(u, t) * w.z;
  if (w.w > 0.001) p += stave(u, t) * w.w;

  // 迁移途中线会从空间里绕一下，而不是直线插值
  float moving = step(0.01, distance(uFrom, uTo));
  float arc = sin(PI * pm) * moving;
  p.z -= arc * (0.2 + 0.4 * hash(u * 13.0));
  p.y += arc * (hash(u * 7.0) - 0.5) * 0.35;

  float yaw = uRot.x + sin(uTime * 0.11) * 0.07;
  float pitch = uRot.y + sin(uTime * 0.07 + 1.0) * 0.04;
  p = rotX(rotY(p, yaw), pitch);

  vec3 P = p * uS;
  float F = uS * 3.2;
  float persp = F / max(F + P.z, 1.0);
  vec2 scr = uC + P.xy * persp;

  // 滚动：线从尾端开始垂下去，接到下一章节的卡片上
  float k3 = floor(u * 2.999);
  float l3 = fract(u * 3.0);
  vec4 A = uAnchor[0];
  if (k3 > 0.5) A = uAnchor[1];
  if (k3 > 1.5) A = uAnchor[2];
  vec2 P0 = uC + vec2((u - 0.5) * uS * 1.1, -uS * 0.2);
  vec2 P3 = vec2(A.x + (l3 - 0.5) * A.z * 0.72, A.y);
  float midY = mix(P0.y, P3.y, 0.55);
  vec2 P1 = vec2(P0.x, midY);
  vec2 P2 = vec2(P3.x, midY);
  float it = 1.0 - t;
  vec2 cable = it * it * it * P0 + 3.0 * it * it * t * P1 + 3.0 * it * t * t * P2 + t * t * t * P3;
  cable.x += sin(t * PI) * sin(uTime * 0.7 + u * 6.0) * uS * 0.03;
  float ws = smoothstep(0.0, 1.0, uScroll * 1.7 - (1.0 - t) * 0.55 - hu * 0.08);
  scr = mix(scr, cable, ws);

  // 鼠标：带阻尼回弹的弹性扰动，划过之后线会晃几下再归位
  vec2 disp = vec2(0.0);
  float R = uS * 0.36;
  for (int i = 0; i < ${TRAIL_SIZE}; i++) {
    float age = uTrailAge[i];
    if (age < 3.0) {
      vec2 d = scr - uTrail[i].xy;
      float fall = exp(-dot(d, d) / (R * R));
      float spring = exp(-age * 2.4) * cos(age * 7.5);
      disp += (uTrail[i].zw * 0.04 + d * 0.22) * fall * spring;
    }
  }
  scr += disp * (1.0 - ws * 0.6) * mix(1.0, 0.25, t * ws);

  vec2 clip = scr / uRes * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);

  // 开场：沿线逐步画出
  float front = uReveal * 1.4 - key * 0.4;
  float vis = 1.0 - smoothstep(front - 0.06, front, t);

  float ends = smoothstep(0.0, 0.07, t) * smoothstep(1.0, 0.93, t);
  ends = mix(ends, smoothstep(0.0, 0.07, t), ws);

  // 线从标题后面穿过时变淡，保证标题清晰
  float shield = 0.0;
  for (int i = 0; i < 3; i++) {
    vec2 q = max(max(uShield[i].xy - scr, scr - uShield[i].zw), 0.0);
    shield = max(shield, 1.0 - smoothstep(0.0, 36.0, length(q)));
  }

  vTone = clamp(0.55 - P.z / uS * 0.6, 0.0, 1.0);

  // 思考时有光点沿线游走；回应时声波处更亮
  float pulse = pow(0.5 + 0.5 * sin(t * 26.0 - uTime * 5.0 + hu * 30.0), 14.0) * w.z;
  vGlow = clamp(pulse + length(disp) / uS * 1.5, 0.0, 1.0);
  vAlpha = vis * ends * mix(1.0, 0.4, shield) * (0.22 + 0.3 * vTone + pulse * 0.5 + w.w * 0.08);
}
`;

const FRAG = /* glsl */ `
precision mediump float;
varying float vAlpha;
varying float vTone;
varying float vGlow;
uniform vec3 uColFar;
uniform vec3 uColNear;
uniform vec3 uColGlow;
uniform float uFade;
void main() {
  vec3 col = mix(uColFar, uColNear, vTone);
  col = mix(col, uColGlow, vGlow);
  float a = clamp(vAlpha * uFade, 0.0, 1.0);
  gl_FragColor = vec4(col * a, a);
}
`;

const hex = (h: string): [number, number, number] => {
  const n = parseInt(h.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

export interface ThreadRenderer {
  resize(width: number, height: number, dpr: number): void;
  render(sim: ThreadSim): void;
  dispose(): void;
}

export function createThreadRenderer(
  canvas: HTMLCanvasElement,
  opts: { fibers: number; segments: number }
): ThreadRenderer | null {
  const gl = canvas.getContext('webgl', {
    antialias: true,
    alpha: true,
    premultipliedAlpha: true,
    powerPreference: 'high-performance',
  });
  if (!gl) return null;

  const compile = (type: number, src: string) => {
    const sh = gl.createShader(type)!;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.error('[thread] shader', gl.getShaderInfoLog(sh));
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  };
  const vs = compile(gl.VERTEX_SHADER, VERT);
  const fs = compile(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error('[thread] program', gl.getProgramInfoLog(prog));
    return null;
  }
  gl.useProgram(prog);

  // 顶点：每根线 segments+1 个点；索引：GL_LINES 的线段对
  const { fibers, segments } = opts;
  const pts = segments + 1;
  const ut = new Float32Array(fibers * pts * 2);
  const idx = new Uint16Array(fibers * segments * 2);
  let o = 0;
  let q = 0;
  for (let f = 0; f < fibers; f++) {
    const u = fibers === 1 ? 0.5 : f / (fibers - 1);
    for (let i = 0; i < pts; i++) {
      ut[o++] = u;
      ut[o++] = i / segments;
      if (i < segments) {
        idx[q++] = f * pts + i;
        idx[q++] = f * pts + i + 1;
      }
    }
  }
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, ut, gl.STATIC_DRAW);
  const ibo = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
  const aUT = gl.getAttribLocation(prog, 'aUT');
  gl.enableVertexAttribArray(aUT);
  gl.vertexAttribPointer(aUT, 2, gl.FLOAT, false, 0, 0);

  const U = (name: string) => gl.getUniformLocation(prog, name);
  const loc = {
    res: U('uRes'),
    time: U('uTime'),
    c: U('uC'),
    s: U('uS'),
    from: U('uFrom'),
    to: U('uTo'),
    morph: U('uMorph'),
    rot: U('uRot'),
    reveal: U('uReveal'),
    unfurl: U('uUnfurl'),
    energy: U('uEnergy'),
    imp: U('uImp'),
    syl: U('uSyl'),
    trail: U('uTrail'),
    trailAge: U('uTrailAge'),
    scroll: U('uScroll'),
    anchor: U('uAnchor'),
    shield: U('uShield'),
    fade: U('uFade'),
  };
  // 颜色取自品牌令牌：远处 brand-300，近处 brand-800，光点 brand-600
  gl.uniform3fv(U('uColFar'), hex('#70D3AE'));
  gl.uniform3fv(U('uColNear'), hex('#0B7F59'));
  gl.uniform3fv(U('uColGlow'), hex('#10BB83'));

  gl.disable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0, 0, 0, 0);

  let cssW = 1;
  let cssH = 1;

  return {
    resize(width, height, dpr) {
      cssW = width;
      cssH = height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
    },
    render(sim) {
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (sim.fade <= 0.001) return;
      gl.uniform2f(loc.res, cssW, cssH);
      gl.uniform1f(loc.time, sim.time);
      gl.uniform2f(loc.c, sim.cx, sim.cy);
      gl.uniform1f(loc.s, sim.scale);
      gl.uniform4fv(loc.from, sim.from);
      gl.uniform4fv(loc.to, sim.to);
      gl.uniform1f(loc.morph, sim.morph);
      gl.uniform2f(loc.rot, sim.yaw, sim.pitch);
      gl.uniform1f(loc.reveal, sim.reveal);
      gl.uniform1f(loc.unfurl, sim.unfurl);
      gl.uniform1f(loc.energy, sim.energy);
      gl.uniform1fv(loc.imp, sim.impulses);
      gl.uniform2fv(loc.syl, sim.syllables);
      gl.uniform4fv(loc.trail, sim.trail);
      gl.uniform1fv(loc.trailAge, sim.trailAge);
      gl.uniform1f(loc.scroll, sim.scroll);
      gl.uniform4fv(loc.anchor, sim.anchors);
      gl.uniform4fv(loc.shield, sim.shield);
      gl.uniform1f(loc.fade, sim.fade);
      gl.drawElements(gl.LINES, idx.length, gl.UNSIGNED_SHORT, 0);
    },
    dispose() {
      gl.deleteBuffer(vbo);
      gl.deleteBuffer(ibo);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    },
  };
}
