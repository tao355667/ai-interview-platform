/**
 * 「线索」艺术装置的 WebGL 渲染器（v2）。
 *
 * 一束细线（fiber），每根线由若干顶点组成，顶点只携带 (u, t)：
 *   u = 第几根线（0–1），t = 沿线的位置（0–1）
 * 线的形态全部在顶点着色器里计算，四种形态按权重混合：
 *   idle 卷起的丝带 / listen 耳蜗 / think 三股编织 / speak 声波
 * 约四分之一的线组成「导线」，从装置的核心一直接到对话卡片顶部——
 * 你和面试官的对话沿着它流动：每个字是一颗沿线移动的光点（bead）。
 * 滚动时所有线在屏幕空间里垂向下一章节的卡片。
 *
 * 不依赖任何三方库，只用 WebGL1：线用 GL_LINES，光点用 GL_POINTS。
 */

export const BEAD_SLOTS = 32;
const SYL_VEC4 = 12; // 每个 vec4 存两个音节（time, amp, time, amp）

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
  /** 开场：画线进度 / 一根线展开成一束 */
  reveal: number;
  unfurl: number;
  /** 倾听能量（打字会提高它） */
  energy: number;
  /** 耳蜗涟漪的起始时间（8 个） */
  impulses: Float32Array;
  /** 回应的音节：time, amp 交替（24 个） */
  syllables: Float32Array;
  /** 平滑后的指针位置、低通后的速度、悬停强度 */
  mouse: [number, number];
  mouseVel: [number, number];
  hover: number;
  /** 导线终点（对话卡片顶边）：x, y, width, 导线生长进度 */
  mouth: Float32Array;
  /** 是否启用导线（小屏上卡片离装置太远，关闭） */
  conduit: number;
  /** 空闲时的小动作：开始时间, 种类（0 波动 / 1 吸气） */
  gesture: [number, number];
  /** 期待感：悬停在主按钮或卡片上时升高 */
  excite: number;
  /** 光点：A = spawn, duration, u, size；B = t0, t1, isConduit, 0 */
  beadA: Float32Array;
  beadB: Float32Array;
  /** 滚动过渡 0–1，以及下一章节三张卡片的锚点：x, y, width, 0 */
  scroll: number;
  anchors: Float32Array;
  /** 标题三行的范围：x0, y0, x1, y1，线经过时变淡 */
  shield: Float32Array;
  /** 整体透明度 */
  fade: number;
}

export function createSim(): ThreadSim {
  const syllables = new Float32Array(SYL_VEC4 * 4);
  for (let i = 0; i < syllables.length; i += 2) syllables[i] = -100;
  const beadA = new Float32Array(BEAD_SLOTS * 4);
  for (let i = 0; i < BEAD_SLOTS; i++) {
    beadA[i * 4] = -100;
    beadA[i * 4 + 1] = 1;
  }
  return {
    time: 0,
    cx: 0,
    cy: 0,
    scale: 300,
    from: [1, 0, 0, 0],
    to: [1, 0, 0, 0],
    morph: 1,
    reveal: 0,
    unfurl: 0,
    energy: 0,
    impulses: new Float32Array(8).fill(-100),
    syllables,
    mouse: [-9999, -9999],
    mouseVel: [0, 0],
    hover: 0,
    mouth: new Float32Array(4),
    conduit: 1,
    gesture: [-100, 0],
    excite: 0,
    beadA,
    beadB: new Float32Array(BEAD_SLOTS * 4),
    scroll: 0,
    anchors: new Float32Array(12),
    shield: new Float32Array(12),
    fade: 1,
  };
}

let beadCursor = 0;

/** 放出一颗光点：沿第 u 根线（或导线）从 t0 走到 t1 */
export function spawnBead(
  sim: ThreadSim,
  opts: { u: number; t0: number; t1: number; dur: number; conduit: boolean; size?: number }
) {
  const i = beadCursor++ % BEAD_SLOTS;
  sim.beadA.set([sim.time, opts.dur, opts.u, opts.size ?? 5], i * 4);
  sim.beadB.set([opts.t0, opts.t1, opts.conduit ? 1 : 0, 0], i * 4);
}

/** 两个程序共用的 uniform 与形态函数 */
const COMMON = /* glsl */ `
precision highp float;

uniform vec2 uRes;
uniform float uTime;
uniform vec2 uC;
uniform float uS;
uniform vec4 uFrom;
uniform vec4 uTo;
uniform float uMorph;
uniform float uUnfurl;
uniform float uEnergy;
uniform vec4 uImp[2];
uniform vec4 uSyl[${SYL_VEC4}];
uniform vec2 uMouse;
uniform vec2 uMouseVel;
uniform float uHover;
uniform vec4 uMouth;
uniform float uConduit;
uniform vec2 uGesture;
uniform float uExcite;
uniform float uScroll;
uniform vec4 uAnchor[3];

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

// 一次键入在耳蜗上激起的涟漪：从外圈（t=0）沿螺旋传到中心
float impOne(float t0, float t) {
  float age = uTime - t0;
  if (age <= 0.0 || age > 2.6) return 0.0;
  float d = (t - age * 0.5) * 11.0;
  return exp(-d * d) * (1.0 - age / 2.6);
}
float impulseAt(float t) {
  float s = 0.0;
  for (int i = 0; i < 2; i++) {
    vec4 v = uImp[i];
    s += impOne(v.x, t) + impOne(v.y, t) + impOne(v.z, t) + impOne(v.w, t);
  }
  return s;
}

// delay 秒之前发出的声音此刻的强度
float speechEnv(float delay) {
  float tau = uTime - delay;
  float env = 0.0;
  for (int i = 0; i < ${SYL_VEC4}; i++) {
    vec4 v = uSyl[i];
    float d1 = tau - v.x;
    float d2 = tau - v.z;
    env += v.y * exp(-d1 * d1 * 30.0) + v.w * exp(-d2 * d2 * 30.0);
  }
  return min(env, 1.4);
}

// 待命：一笔丝带从画面外扫进来，末端卷起一个会呼吸的旋（欧拉螺线）
// 空闲时偶尔做小动作：一道波从尾部传到旋心，或旋心像吸气一样收紧
vec3 ribbon(float u, float t) {
  float T = uTime;
  float gA = T - uGesture.x;
  float ripple = 0.0;
  float inhale = 0.0;
  if (gA > 0.0 && gA < 3.2) {
    if (uGesture.y < 0.5) {
      float d = (t - gA * 0.42) * 7.0;
      ripple = exp(-d * d) * (1.0 - gA / 3.2);
    } else {
      inhale = sin(PI * min(gA / 2.2, 1.0));
    }
  }
  inhale = max(inhale, uExcite * 0.7);

  float L = 4.1;
  float sig = t * L;
  float b = 0.78 + 0.1 * sin(T * 0.85) + inhale * 0.14;
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

  // 说话时声音从旋心沿丝带向外传，丝带随每个字张开
  float speech = speechEnv((1.0 - t) * 0.7);
  float breath = (0.8 + 0.2 * sin(T * 0.85 + 1.2)) * (1.0 - inhale * 0.22) * (1.0 + speech * 0.35);
  float th = t * 5.0 + T * 0.3 + sin(T * 0.13) * 0.8;
  float v = (u - 0.5) * 0.7 * breath * uUnfurl * mix(1.0, 0.28, t);
  vec3 dir = vec3(-sin(phi) * cos(th), cos(phi) * cos(th), sin(th));
  vec3 nrm = vec3(-sin(phi), cos(phi), 0.0);
  vec3 p = c + dir * v + nrm * ripple * 0.09 + vec3(0.0, 0.0, ripple * 0.12);
  p.y += sin(t * 11.0 - T * 1.3 + u * 5.0) * 0.006;
  // 整体转一个角度，让尾巴从右上方的空白处进入画面
  float ca = cos(-0.8), sa = sin(-0.8);
  p.xy = vec2(p.x * ca - p.y * sa, p.x * sa + p.y * ca);
  return p + vec3(-0.1, 0.02, 0.0);
}

// 倾听：丝带卷成耳蜗一样的螺旋，你打的每个字从外圈沿螺旋传到中心
vec3 ear(float u, float t) {
  float T = uTime;
  float th = mix(14.2, 0.9, t);
  float r = 0.058 * exp(0.18 * th);
  float imp = impulseAt(t);
  float lane = (u - 0.5) * 0.62;
  float wave = sin(t * 46.0 - T * 5.0) * (0.006 + 0.02 * uEnergy);
  float rr = r * (1.0 + lane + wave + imp * 0.16);
  float a = th + T * 0.12;
  vec3 p = vec3(cos(a) * rr, sin(a) * rr, (1.0 - r / 0.75) * 0.45 - imp * 0.08 + lane * 0.05);
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

// 回应：线摊平成一层层声波，问题的每个字都是一次发声，波从声源向外传
const float EMIT = -0.55;
vec3 stave(float u, float t) {
  float T = uTime;
  float s = t * 2.0 - 1.0;
  float row = u - 0.5;
  vec3 p = vec3(s * 1.45, row * 0.5, row * 1.05);
  float dist = abs(s - EMIT);
  float env = speechEnv(dist * 0.85) * exp(-dist * 0.75);
  float carrier = sin(s * 31.0 - T * 8.0 + row * 6.0) * 0.6 + sin(s * 11.0 + T * 3.0 - row * 4.0) * 0.4;
  float rowGain = 0.3 + 0.7 * exp(-row * row * 9.0);
  p.y -= carrier * env * 0.2 * rowGain;
  p.y += sin(s * 2.6 + T * 0.5 + row * 3.0) * 0.018;
  return p;
}

vec3 shapeAt(float u, float t, vec4 w) {
  vec3 p = vec3(0.0);
  if (w.x > 0.001) p += ribbon(u, t) * w.x;
  if (w.y > 0.001) p += ear(u, t) * w.y;
  if (w.z > 0.001) p += braid(u, t) * w.z;
  if (w.w > 0.001) p += stave(u, t) * w.w;
  return p;
}

// 每种形态的「核心」：导线从这里出发
vec3 coreAt(vec4 w) {
  vec3 c = vec3(0.0);
  if (w.x > 0.001) c += ribbon(0.5, 0.97) * w.x;
  if (w.y > 0.001) c += ear(0.5, 0.97) * w.y;
  if (w.z > 0.001) c += braid(0.5, 0.5) * w.z;
  if (w.w > 0.001) c += vec3(EMIT * 1.45, 0.0, 0.0) * w.w;
  return c;
}

vec2 project(vec3 p, out float depth) {
  // 只有极慢的自主转动，不再跟随鼠标
  p = rotX(rotY(p, sin(uTime * 0.11) * 0.05), sin(uTime * 0.07 + 1.0) * 0.03);
  vec3 P = p * uS;
  float F = uS * 3.2;
  depth = p.z;
  return uC + P.xy * (F / max(F + P.z, 1.0));
}

float isConduit(float u) { return step(hash(u * 53.3 + 7.0), 0.24) * uConduit; }

// 导线：从核心向右下方绕出，再垂直落进对话卡片的顶边，中段像透镜一样微微张开
vec2 conduitPos(float lane, float t, vec2 core) {
  vec2 P3 = vec2(uMouth.x + (lane - 0.5) * uMouth.z * 0.46, uMouth.y);
  vec2 P0 = core;
  float dy = max(P3.y - P0.y, uS * 0.3);
  vec2 P1 = P0 + vec2(uS * 0.3, dy * 0.5);
  vec2 P2 = P3 - vec2(0.0, dy * 0.65);
  float it = 1.0 - t;
  vec2 q = it * it * it * P0 + 3.0 * it * it * t * P1 + 3.0 * it * t * t * P2 + t * t * t * P3;
  float bulge = sin(t * PI);
  q.x += (lane - 0.5) * uS * 0.14 * bulge + sin(uTime * 0.6 + lane * 4.0 + t * 3.0) * uS * 0.012 * bulge;
  return q;
}

// 一根线上某一点的最终屏幕位置（线和光点共用）
vec2 fiberPos(float u, float t, float conduit, out float depth, out float ws, out float mf, out vec4 w) {
  float hu = hash(u * 91.7);
  float key = mix(u, hu, 0.65);
  float pm = smoothstep(key * 0.45, key * 0.45 + 0.55, uMorph);
  w = mix(uFrom, uTo, pm);

  vec2 scr;
  if (conduit > 0.5) {
    vec2 core = project(coreAt(w), depth);
    scr = conduitPos(u, t, core);
    depth = 0.0;
  } else {
    vec3 p = shapeAt(u, t, w);
    // 迁移途中线会从空间里绕一下，而不是直线插值
    float arc = sin(PI * pm) * step(0.01, distance(uFrom, uTo));
    p.z -= arc * (0.2 + 0.4 * hash(u * 13.0));
    p.y += arc * (hash(u * 7.0) - 0.5) * 0.35;
    scr = project(p, depth);
  }

  // 滚动：线从尾端开始垂下去，接到下一章节的卡片上
  float k3 = floor(u * 2.999);
  float l3 = fract(u * 3.0);
  vec4 A = uAnchor[0];
  if (k3 > 0.5) A = uAnchor[1];
  if (k3 > 1.5) A = uAnchor[2];
  vec2 S0 = uC + vec2((u - 0.5) * uS * 1.1, -uS * 0.2);
  vec2 S3 = vec2(A.x + (l3 - 0.5) * A.z * 0.72, A.y);
  float midY = mix(S0.y, S3.y, 0.55);
  vec2 S1 = vec2(S0.x, midY);
  vec2 S2 = vec2(S3.x, midY);
  float it = 1.0 - t;
  vec2 cable = it * it * it * S0 + 3.0 * it * it * t * S1 + 3.0 * it * t * t * S2 + t * t * t * S3;
  cable.x += sin(t * PI) * sin(uTime * 0.7 + u * 6.0) * uS * 0.03;
  ws = smoothstep(0.0, 1.0, uScroll * 1.7 - (1.0 - t) * 0.55 - hu * 0.08);
  scr = mix(scr, cable, ws);

  // 鼠标：像光拂过丝绸——附近的线平滑地让开并被照亮，没有回弹和抖动
  vec2 d = scr - uMouse;
  float R = uS * 0.42;
  mf = exp(-dot(d, d) / (R * R)) * uHover;
  scr += (d * 0.28 + uMouseVel * 0.018) * mf * (1.0 - ws * 0.7);
  return scr;
}

vec4 toClip(vec2 scr) {
  vec2 clip = scr / uRes * 2.0 - 1.0;
  return vec4(clip.x, -clip.y, 0.0, 1.0);
}
`;

const LINE_VERT = /* glsl */ `
${COMMON}
attribute vec2 aUT;
uniform float uReveal;
uniform vec4 uShield[3];
varying float vAlpha;
varying float vTone;
varying float vGlow;

void main() {
  float u = aUT.x;
  float t = aUT.y;
  float conduit = isConduit(u);
  float depth;
  float ws;
  float mf;
  vec4 w;
  vec2 scr = fiberPos(u, t, conduit, depth, ws, mf, w);
  gl_Position = toClip(scr);

  float hu = hash(u * 91.7);
  float key = mix(u, hu, 0.65);
  // 开场：沿线逐步画出；导线在之后从核心长向卡片
  float front = uReveal * 1.4 - key * 0.4;
  float vis = 1.0 - smoothstep(front - 0.06, front, t);
  float grow = uMouth.w * 1.15 - hu * 0.15;
  vis = mix(vis, 1.0 - smoothstep(grow - 0.08, grow, t), conduit);

  float ends = smoothstep(0.0, 0.07, t) * smoothstep(1.0, 0.93, t);
  ends = mix(ends, smoothstep(0.0, 0.2, t), conduit);
  ends = mix(ends, smoothstep(0.0, 0.07, t), ws);

  // 线从标题后面穿过时变淡，保证标题清晰
  float shield = 0.0;
  for (int i = 0; i < 3; i++) {
    vec2 q = max(max(uShield[i].xy - scr, scr - uShield[i].zw), 0.0);
    shield = max(shield, 1.0 - smoothstep(0.0, 36.0, length(q)));
  }

  vTone = clamp(0.55 - depth * 0.6, 0.0, 1.0);
  float pulse = pow(0.5 + 0.5 * sin(t * 26.0 - uTime * 5.0 + hu * 30.0), 14.0) * w.z * (1.0 - conduit);
  // 导线里有一股缓慢流向卡片的电流，期待时更亮
  float current = conduit * pow(0.5 + 0.5 * sin(t * 9.0 - uTime * 2.6 + hu * 6.0), 10.0) * (0.3 + uExcite * 0.7);
  vGlow = clamp(pulse + mf * 0.5 + current + uExcite * 0.12, 0.0, 1.0);
  float base = mix(0.22 + 0.3 * vTone, 0.34, conduit);
  vAlpha = vis * ends * mix(1.0, 0.4, shield) * (base + pulse * 0.5 + w.w * 0.08 + mf * 0.2 + current * 0.35);
}
`;

const LINE_FRAG = /* glsl */ `
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

const BEAD_VERT = /* glsl */ `
${COMMON}
attribute float aSlot;
uniform vec4 uBeadA[${BEAD_SLOTS}];
uniform vec4 uBeadB[${BEAD_SLOTS}];
uniform float uDpr;
varying float vA;

void main() {
  int i = int(aSlot);
  vec4 A = uBeadA[i];
  vec4 B = uBeadB[i];
  float p = (uTime - A.x) / A.y;
  if (p <= 0.0 || p >= 1.0) {
    gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
    gl_PointSize = 0.0;
    vA = 0.0;
    return;
  }
  float e = p * p * (3.0 - 2.0 * p);
  float t = mix(B.x, B.y, e);
  float depth;
  float ws;
  float mf;
  vec4 w;
  vec2 scr = fiberPos(A.z, t, B.z * uConduit, depth, ws, mf, w);
  gl_Position = toClip(scr);
  gl_PointSize = A.w * 2.6 * uDpr;
  vA = smoothstep(0.0, 0.1, p) * smoothstep(1.0, 0.88, p) * (1.0 - ws);
}
`;

const BEAD_FRAG = /* glsl */ `
precision mediump float;
varying float vA;
uniform vec3 uColBead;
uniform vec3 uColHalo;
uniform float uFade;
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.6;
  float core = 1.0 - smoothstep(0.32, 0.42, r);
  float halo = (1.0 - smoothstep(0.0, 1.3, r)) * 0.35;
  float a = clamp((core + halo) * vA * uFade, 0.0, 1.0);
  vec3 col = mix(uColHalo, uColBead, core);
  gl_FragColor = vec4(col * a, a);
}
`;

const hex = (h: string): [number, number, number] => {
  const n = parseInt(h.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

const COMMON_UNIFORMS = [
  'uRes',
  'uTime',
  'uC',
  'uS',
  'uFrom',
  'uTo',
  'uMorph',
  'uUnfurl',
  'uEnergy',
  'uImp',
  'uSyl',
  'uMouse',
  'uMouseVel',
  'uHover',
  'uMouth',
  'uConduit',
  'uGesture',
  'uExcite',
  'uScroll',
  'uAnchor',
  'uFade',
] as const;

type Loc = Record<string, WebGLUniformLocation | null>;

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

  const shaders: WebGLShader[] = [];
  const compile = (type: number, src: string) => {
    const sh = gl.createShader(type)!;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.error('[thread] shader', gl.getShaderInfoLog(sh));
      return null;
    }
    shaders.push(sh);
    return sh;
  };
  const link = (vsSrc: string, fsSrc: string, extra: string[]) => {
    const vs = compile(gl.VERTEX_SHADER, vsSrc);
    const fs = compile(gl.FRAGMENT_SHADER, fsSrc);
    if (!vs || !fs) return null;
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('[thread] program', gl.getProgramInfoLog(prog));
      return null;
    }
    const loc: Loc = {};
    for (const name of [...COMMON_UNIFORMS, ...extra])
      loc[name] = gl.getUniformLocation(prog, name);
    return { prog, loc };
  };

  const line = link(LINE_VERT, LINE_FRAG, [
    'uReveal',
    'uShield',
    'uColFar',
    'uColNear',
    'uColGlow',
  ]);
  const bead = link(BEAD_VERT, BEAD_FRAG, ['uBeadA', 'uBeadB', 'uDpr', 'uColBead', 'uColHalo']);
  if (!line || !bead) return null;

  // 线：每根 segments+1 个点；索引是 GL_LINES 的线段对
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
  const lineVbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, lineVbo);
  gl.bufferData(gl.ARRAY_BUFFER, ut, gl.STATIC_DRAW);
  const lineIbo = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, lineIbo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
  const aUT = gl.getAttribLocation(line.prog, 'aUT');

  const slots = new Float32Array(BEAD_SLOTS).map((_, i) => i);
  const beadVbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, beadVbo);
  gl.bufferData(gl.ARRAY_BUFFER, slots, gl.STATIC_DRAW);
  const aSlot = gl.getAttribLocation(bead.prog, 'aSlot');

  // 颜色取自品牌令牌：远处 brand-300，近处 brand-800，高光 brand-600，光点 brand-900
  gl.useProgram(line.prog);
  gl.uniform3fv(line.loc.uColFar, hex('#70D3AE'));
  gl.uniform3fv(line.loc.uColNear, hex('#0B7F59'));
  gl.uniform3fv(line.loc.uColGlow, hex('#10BB83'));
  gl.useProgram(bead.prog);
  gl.uniform3fv(bead.loc.uColBead, hex('#08613F'));
  gl.uniform3fv(bead.loc.uColHalo, hex('#10BB83'));

  gl.disable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0, 0, 0, 0);

  let cssW = 1;
  let cssH = 1;
  let dpr = 1;

  const setCommon = (loc: Loc, sim: ThreadSim) => {
    gl.uniform2f(loc.uRes, cssW, cssH);
    gl.uniform1f(loc.uTime, sim.time);
    gl.uniform2f(loc.uC, sim.cx, sim.cy);
    gl.uniform1f(loc.uS, sim.scale);
    gl.uniform4fv(loc.uFrom, sim.from);
    gl.uniform4fv(loc.uTo, sim.to);
    gl.uniform1f(loc.uMorph, sim.morph);
    gl.uniform1f(loc.uUnfurl, sim.unfurl);
    gl.uniform1f(loc.uEnergy, sim.energy);
    gl.uniform4fv(loc.uImp, sim.impulses);
    gl.uniform4fv(loc.uSyl, sim.syllables);
    gl.uniform2fv(loc.uMouse, sim.mouse);
    gl.uniform2fv(loc.uMouseVel, sim.mouseVel);
    gl.uniform1f(loc.uHover, sim.hover);
    gl.uniform4fv(loc.uMouth, sim.mouth);
    gl.uniform1f(loc.uConduit, sim.conduit);
    gl.uniform2fv(loc.uGesture, sim.gesture);
    gl.uniform1f(loc.uExcite, sim.excite);
    gl.uniform1f(loc.uScroll, sim.scroll);
    gl.uniform4fv(loc.uAnchor, sim.anchors);
    gl.uniform1f(loc.uFade, sim.fade);
  };

  return {
    resize(width, height, ratio) {
      cssW = width;
      cssH = height;
      dpr = ratio;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      gl.viewport(0, 0, canvas.width, canvas.height);
    },
    render(sim) {
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (sim.fade <= 0.001) return;

      gl.useProgram(line.prog);
      setCommon(line.loc, sim);
      gl.uniform1f(line.loc.uReveal, sim.reveal);
      gl.uniform4fv(line.loc.uShield, sim.shield);
      gl.bindBuffer(gl.ARRAY_BUFFER, lineVbo);
      gl.enableVertexAttribArray(aUT);
      gl.vertexAttribPointer(aUT, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, lineIbo);
      gl.drawElements(gl.LINES, idx.length, gl.UNSIGNED_SHORT, 0);
      gl.disableVertexAttribArray(aUT);

      gl.useProgram(bead.prog);
      setCommon(bead.loc, sim);
      gl.uniform4fv(bead.loc.uBeadA, sim.beadA);
      gl.uniform4fv(bead.loc.uBeadB, sim.beadB);
      gl.uniform1f(bead.loc.uDpr, dpr);
      gl.bindBuffer(gl.ARRAY_BUFFER, beadVbo);
      gl.enableVertexAttribArray(aSlot);
      gl.vertexAttribPointer(aSlot, 1, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.POINTS, 0, BEAD_SLOTS);
      gl.disableVertexAttribArray(aSlot);
    },
    dispose() {
      gl.deleteBuffer(lineVbo);
      gl.deleteBuffer(lineIbo);
      gl.deleteBuffer(beadVbo);
      gl.deleteProgram(line.prog);
      gl.deleteProgram(bead.prog);
      shaders.forEach((sh) => gl.deleteShader(sh));
    },
  };
}
