/**
 * 首屏「线索」装置的 WebGL 渲染器。
 *
 * 画面由两层组成，共用一个 WebGL 上下文和同一个透视相机：
 *   1. 核心：raymarching 渲染的「镜面镂空外壳 + 透明水晶」，离屏低分辨率渲染后合成。
 *      水晶真实折射：光线穿过水晶内部，能看到背面的外壳；其余部分透出页面背景
 *   2. 轨道环：三束细线绕着核心，按 z 拆成前后两遍画，形成真实的前后遮挡
 *
 * 线的顶点只携带 (u, t)：u = 第几根线，t = 沿线位置；形态都在着色器里计算，
 * 四种状态（待命 / 倾听 / 思考 / 回应）按权重混合，每根线按自己的顺序迁移。
 * 不依赖任何三方库，只用 WebGL1。
 */

const SYL_VEC4 = 12; // 每个 vec4 存两个音节（time, amp, time, amp）
/** 相机到核心中心的距离（以核心尺度为单位），线和 raymarching 必须一致 */
const CAM = 3.2;
/** 线经过这些文字时变淡 */
export const SHIELD_SLOTS = 6;

/** 由 React 组件每帧写入的模拟状态（可变对象，避免触发重渲染） */
export interface CrystalSim {
  time: number;
  /** 核心中心与尺度（CSS 像素 / 单位） */
  cx: number;
  cy: number;
  scale: number;
  /** 轨道环形态混合：from → to，morph 0–1（每根线错峰迁移） */
  from: [number, number, number, number];
  to: [number, number, number, number];
  morph: number;
  /** 核心用的整体权重（平滑过渡，不错峰） */
  w: [number, number, number, number];
  /** 开场：环的画线进度 / 核心生长 / 外壳镂空程度 */
  reveal: number;
  grow: number;
  open: number;
  /** 外壳纹理的流动相位与自转角 */
  cageFlow: number;
  cageSpin: number;
  /** 倾听能量（打字会提高它） */
  energy: number;
  /** 涟漪的起始时间（8 个） */
  impulses: Float32Array;
  /** 说话的音节：time, amp 交替（24 个） */
  syllables: Float32Array;
  /** 平滑后的指针位置、低通后的速度、悬停强度 */
  mouse: [number, number];
  mouseVel: [number, number];
  hover: number;
  /** 涟漪从哪个方向传来（屏幕坐标，通常是对话卡片） */
  listenFrom: [number, number];
  /** 期待感：悬停在主按钮上时升高 */
  excite: number;
  /** 滚动过渡 0–1，以及下一节三张卡片的锚点：x, y, width, 0 */
  scroll: number;
  anchors: Float32Array;
  shield: Float32Array;
  fade: number;
}

export function createSim(): CrystalSim {
  const syllables = new Float32Array(SYL_VEC4 * 4);
  for (let i = 0; i < syllables.length; i += 2) syllables[i] = -100;
  return {
    time: 0,
    cx: 0,
    cy: 0,
    scale: 200,
    from: [1, 0, 0, 0],
    to: [1, 0, 0, 0],
    morph: 1,
    w: [1, 0, 0, 0],
    reveal: 0,
    grow: 0,
    open: 0,
    cageFlow: 0,
    cageSpin: 0,
    energy: 0,
    impulses: new Float32Array(8).fill(-100),
    syllables,
    mouse: [-9999, -9999],
    mouseVel: [0, 0],
    hover: 0,
    listenFrom: [0, 0],
    excite: 0,
    scroll: 0,
    anchors: new Float32Array(12),
    shield: new Float32Array(SHIELD_SLOTS * 4),
    fade: 1,
  };
}

/** 所有着色器共用：时间、状态、声音与涟漪 */
const SHARED = /* glsl */ `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uC;
uniform float uS;
uniform float uEnergy;
uniform vec4 uImp[2];
uniform vec4 uSyl[${SYL_VEC4}];
uniform vec2 uMouse;
uniform float uHover;
uniform float uExcite;
uniform float uGrow;

const float PI = 3.14159265;
const float TAU = 6.28318531;
const float CAM = ${CAM.toFixed(1)};

float hash(float n) { return fract(sin(n * 127.1 + 11.7) * 43758.5453); }

vec3 rotX(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x, p.y * c - p.z * s, p.y * s + p.z * c); }
vec3 rotY(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x * c + p.z * s, p.y, -p.x * s + p.z * c); }
vec3 rotZ(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x * c - p.y * s, p.x * s + p.y * c, p.z); }

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

// 一次涟漪的波前：从 0 处出发，以 speed 向外走
float pulseAt(float t0, float x, float speed, float width) {
  float age = uTime - t0;
  if (age <= 0.0 || age > 2.4) return 0.0;
  float d = (x - age * speed) * width;
  return exp(-d * d) * (1.0 - age / 2.4);
}
`;

/** 轨道环：线的位置函数 */
const RINGS = /* glsl */ `
${SHARED}
uniform vec4 uFrom;
uniform vec4 uTo;
uniform float uMorph;
uniform vec2 uMouseVel;
uniform float uScroll;
uniform vec4 uAnchor[3];

vec3 orient(vec3 p, float ax, float ay, float az) { return rotY(rotZ(rotX(p, ax), az), ay); }

// 一圈由细线组成的环：lane 是线在这一束里的位置，互相轻微交叉产生丝绸般的莫尔纹
vec3 ringLocal(float a, float lane, float R) {
  float rr = R + lane * 0.05;
  return vec3(cos(a) * rr, sin(a) * rr, lane * 0.035 * sin(a * 3.0 + uTime * 0.6));
}

// 待命：三道不规则的轨道环，缓慢进动
vec3 ringIdle(float k, float lane, float a) {
  float T = uTime;
  float R = 1.04 + k * 0.12 + 0.03 * sin(a * 3.0 + k * 2.0 + T * 0.4);
  float ax = 1.18 + k * 0.1;
  float az = 0.24 - k * 0.27 + 0.08 * sin(T * 0.2 + k);
  float ay = T * (0.07 + k * 0.03) + k * 2.1;
  return orient(ringLocal(a, lane, R), ax, ay, az);
}

// 倾听：环转过来朝向对话卡片，变成同心的「耳廓」；每次键入，涟漪从外环向内收
vec3 ringListen(float k, float lane, float a) {
  float T = uTime;
  float R = 0.84 + k * 0.17;
  float imp = 0.0;
  for (int i = 0; i < 2; i++) {
    vec4 v = uImp[i];
    float x = (2.0 - k) * 0.14;
    imp += pulseAt(v.x, x, 1.0, 9.0) + pulseAt(v.y, x, 1.0, 9.0) + pulseAt(v.z, x, 1.0, 9.0) + pulseAt(v.w, x, 1.0, 9.0);
  }
  R -= imp * 0.08;
  R += sin(a * 6.0 - T * 3.0) * 0.006 * (1.0 + uEnergy * 3.0);
  return orient(ringLocal(a, lane, R), 0.42, 0.55, 0.0);
}

// 思考：三道环像陀螺仪一样各自绕不同的轴旋转
vec3 ringThink(float k, float lane, float a) {
  float T = uTime;
  vec3 p = ringLocal(a, lane, 0.9 + k * 0.07);
  if (k < 0.5) return orient(p, PI * 0.5, T * 1.1, 0.35);
  if (k < 1.5) return orient(p, 0.25, -T * 0.9, 0.0);
  return orient(p, PI * 0.25, T * 0.7, -T * 0.6);
}

// 回应：环随每个字从内向外扩散，像一圈圈声波
vec3 ringSpeak(float k, float lane, float a) {
  float T = uTime;
  float env = speechEnv(k * 0.16);
  float R = 0.98 + k * 0.17 + env * 0.16 + env * 0.05 * sin(a * 14.0 - T * 9.0 + k * 2.0);
  vec3 p = orient(ringLocal(a, lane, R), 1.02 + k * 0.06, 0.3 + T * 0.06, -0.12);
  return p + vec3(0.0, (k - 1.0) * 0.14 - env * 0.04, 0.0);
}

vec3 ringAt(float u, float t, vec4 w) {
  float k = floor(u * 2.999);
  float lane = fract(u * 3.0) - 0.5;
  float a = t * TAU;
  vec3 p = vec3(0.0);
  if (w.x > 0.001) p += ringIdle(k, lane, a) * w.x;
  if (w.y > 0.001) p += ringListen(k, lane, a) * w.y;
  if (w.z > 0.001) p += ringThink(k, lane, a) * w.z;
  if (w.w > 0.001) p += ringSpeak(k, lane, a) * w.w;
  return p * (0.35 + 0.65 * uGrow);
}

vec2 project(vec3 p) {
  vec3 P = p * uS;
  float F = uS * CAM;
  return uC + P.xy * (F / max(F + P.z, 1.0));
}

// 一根线上某一点的最终屏幕位置；z < 0 表示在核心前方
vec2 fiberPos(float u, float t, out float z, out float ws, out float mf, out vec4 w) {
  float hu = hash(u * 91.7);
  float key = mix(u, hu, 0.65);
  float pm = smoothstep(key * 0.45, key * 0.45 + 0.55, uMorph);
  w = mix(uFrom, uTo, pm);

  vec3 p = ringAt(u, t, w);
  // 迁移途中线会从空间里绕一下，而不是直线插值
  float arc = sin(PI * pm) * step(0.01, distance(uFrom, uTo));
  p *= 1.0 + arc * (0.12 + 0.18 * hash(u * 13.0));
  vec2 scr = project(p);
  z = p.z;

  // 滚动：环从一处断开，垂下来接到下一节的卡片上
  float k3 = floor(u * 2.999);
  float l3 = fract(u * 3.0);
  vec4 A = uAnchor[0];
  if (k3 > 0.5) A = uAnchor[1];
  if (k3 > 1.5) A = uAnchor[2];
  vec2 S0 = uC + vec2((u - 0.5) * uS * 1.4, uS * 0.4);
  vec2 S3 = vec2(A.x + (l3 - 0.5) * A.z * 0.72, A.y);
  float midY = mix(S0.y, S3.y, 0.55);
  float it = 1.0 - t;
  vec2 cable = it * it * it * S0 + 3.0 * it * it * t * vec2(S0.x, midY) + 3.0 * it * t * t * vec2(S3.x, midY) + t * t * t * S3;
  cable.x += sin(t * PI) * sin(uTime * 0.7 + u * 6.0) * uS * 0.04;
  ws = smoothstep(0.0, 1.0, uScroll * 1.7 - (1.0 - t) * 0.55 - hu * 0.08);
  scr = mix(scr, cable, ws);
  z = mix(z, -1.0, step(0.5, ws));

  // 鼠标：像光拂过丝绸——附近的线平滑地让开并被照亮，没有回弹和抖动
  vec2 d = scr - uMouse;
  float R = uS * 0.55;
  mf = exp(-dot(d, d) / (R * R)) * uHover;
  scr += (d * 0.22 + uMouseVel * 0.015) * mf * (1.0 - ws * 0.7);
  return scr;
}
`;

const LINE_VERT = /* glsl */ `
${RINGS}
attribute vec2 aUT;
uniform float uReveal;
uniform vec4 uShield[${SHIELD_SLOTS}];
varying float vAlpha;
varying float vTone;
varying float vGlow;
varying float vZ;
varying float vMetal;

void main() {
  float u = aUT.x;
  float t = aUT.y;
  float z;
  float ws;
  float mf;
  vec4 w;
  vec2 scr = fiberPos(u, t, z, ws, mf, w);
  vec2 clip = scr / uRes * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  vZ = z;
  // 中间那道环是金属灰，呼应外壳
  float k = floor(u * 2.999);
  vMetal = step(0.5, k) * step(k, 1.5) * (1.0 - ws);

  float hu = hash(u * 91.7);
  float key = mix(u, hu, 0.65);
  // 开场：每道环沿圆周画出来
  float front = uReveal * 1.4 - key * 0.4;
  float vis = 1.0 - smoothstep(front - 0.05, front, t);
  float ends = mix(1.0, smoothstep(0.0, 0.07, t), ws);

  // 线从文字后面经过时变淡：文字在前，线退到后面
  float shield = 0.0;
  for (int i = 0; i < ${SHIELD_SLOTS}; i++) {
    vec2 q = max(max(uShield[i].xy - scr, scr - uShield[i].zw), 0.0);
    shield = max(shield, 1.0 - smoothstep(0.0, 40.0, length(q)));
  }

  vTone = clamp(0.5 - z * 0.5, 0.0, 1.0);
  float spark = pow(0.5 + 0.5 * sin(t * TAU * 3.0 - uTime * 4.0 + hu * 20.0), 18.0) * w.z;
  vGlow = clamp(mf * 0.6 + spark + uExcite * 0.25, 0.0, 1.0);
  vAlpha = vis * ends * mix(1.0, 0.18, shield) * (0.2 + 0.34 * vTone + mf * 0.2 + spark * 0.4);
}
`;

const LINE_FRAG = /* glsl */ `
precision mediump float;
varying float vAlpha;
varying float vTone;
varying float vGlow;
varying float vZ;
varying float vMetal;
uniform vec3 uColFar;
uniform vec3 uColNear;
uniform vec3 uColGlow;
uniform float uFade;
uniform float uSide;
void main() {
  // 第一遍只画核心后面的部分，第二遍只画前面的部分
  if (uSide > 0.5) { if (vZ < 0.0) discard; } else { if (vZ >= 0.0) discard; }
  vec3 col = mix(uColFar, uColNear, vTone);
  col = mix(col, mix(vec3(0.66, 0.69, 0.68), vec3(0.3, 0.34, 0.32), vTone), vMetal);
  col = mix(col, uColGlow, vGlow);
  float a = clamp(vAlpha * uFade, 0.0, 1.0);
  gl_FragColor = vec4(col * a, a);
}
`;

/** 核心：镜面镂空外壳（陀螺曲面与球壳求交）包着会流动、会分裂的透明水晶 */
const CORE_VERT = /* glsl */ `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const CORE_FRAG = /* glsl */ `
${SHARED}
uniform vec2 uRectMin;
uniform vec2 uRectSize;
uniform vec2 uFbo;
uniform vec4 uW;
uniform float uOpen;
uniform vec2 uCage;
uniform vec3 uLookDir;

const vec3 LIME = vec3(0.749, 0.918, 0.18);
const vec3 KEY = vec3(-0.5, -0.76, -0.41);

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

float gelSDF(vec3 p) {
  float T = uTime;
  float env = speechEnv(0.0);
  vec3 dir = normalize(p + vec3(1e-4));
  // 说话时随每个字搏动；开场提问（待命形态）也有轻微的搏动
  float rad = 0.47 * uGrow + 0.012 * sin(T * 0.9) + env * (0.05 * uW.w + 0.025 * uW.x) + uExcite * 0.025;
  // 倾听：每次键入，涟漪从朝向卡片的一侧沿表面散开
  float th = acos(clamp(dot(dir, uLookDir), -1.0, 1.0));
  float rip = 0.0;
  for (int i = 0; i < 2; i++) {
    vec4 v = uImp[i];
    rip += pulseAt(v.x, th, 1.5, 5.0) + pulseAt(v.y, th, 1.5, 5.0) + pulseAt(v.z, th, 1.5, 5.0) + pulseAt(v.w, th, 1.5, 5.0);
  }
  rad += rip * 0.04 * uW.y;
  // 指针：水晶朝光标方向微微鼓起
  vec3 md = normalize(vec3((uMouse - uC) / uS, -0.9));
  rad += uHover * 0.03 * pow(max(dot(dir, md), 0.0), 3.0);
  float n = sin(p.x * 4.3 + T * 0.7) * sin(p.y * 3.7 - T * 0.55) * sin(p.z * 4.1 + T * 0.63);
  float single = length(p) - rad - n * (0.022 + 0.05 * uW.w * env + 0.02 * uEnergy);
  if (uW.z < 0.001) return single;
  // 思考：水晶分成三滴，在外壳里互相环绕
  float tb = 1e3;
  for (int i = 0; i < 3; i++) {
    float a = T * 1.3 + float(i) * TAU / 3.0;
    vec3 c = vec3(cos(a) * 0.3, sin(a * 2.0 + float(i)) * 0.13, sin(a) * 0.3);
    tb = smin(tb, length(p - c) - 0.27 * uGrow, 0.2);
  }
  return mix(single, tb, uW.z);
}

// 平滑求交：镂空切口带一点倒角，金属边缘更自然，也避免法线突变产生的锯齿亮点
float smax(float a, float b, float k) {
  return -smin(-a, -b, k);
}

float cageSDF(vec3 p) {
  vec3 q = rotX(rotY(p, uCage.y), 0.35);
  float shell = abs(length(q) - 0.6 * uGrow) - 0.022;
  float f = 4.8;
  vec3 r = q * f + vec3(0.0, uCage.x, 0.0);
  float gy = dot(sin(r), cos(r.yzx));
  float open = uOpen + speechEnv(0.0) * 0.12 * uW.w;
  return smax(shell, (abs(gy) - open) / (f * 1.8), 0.012);
}

vec2 map(vec3 p) {
  float a = gelSDF(p);
  float b = cageSDF(p);
  return a < b ? vec2(a, 0.0) : vec2(b, 1.0);
}

vec3 gelNormal(vec3 p) {
  const vec2 e = vec2(1.0, -1.0) * 0.002;
  return normalize(e.xyy * gelSDF(p + e.xyy) + e.yyx * gelSDF(p + e.yyx) + e.yxy * gelSDF(p + e.yxy) + e.xxx * gelSDF(p + e.xxx));
}
vec3 cageNormal(vec3 p) {
  const vec2 e = vec2(1.0, -1.0) * 0.003;
  return normalize(e.xyy * cageSDF(p + e.xyy) + e.yyx * cageSDF(p + e.yyx) + e.yxy * cageSDF(p + e.yxy) + e.xxx * cageSDF(p + e.xxx));
}

// 摄影棚环境：上亮下暗，两块柔光箱，地面反上来一点荧光黄绿；y 轴朝下
vec3 env(vec3 d) {
  float up = -d.y;
  vec3 col = mix(vec3(0.76, 0.79, 0.78), vec3(0.985, 0.99, 0.985), smoothstep(-0.6, 0.7, up));
  col *= 1.0 - 0.42 * exp(-pow((up - 0.02) * 6.0, 2.0));
  col += pow(max(dot(d, normalize(KEY)), 0.0), 30.0) * 1.6;
  col += pow(max(dot(d, normalize(vec3(0.75, -0.15, -0.6))), 0.0), 12.0) * 0.45;
  col = mix(col, LIME, smoothstep(0.2, 0.95, -up) * 0.45);
  return col;
}

// 透过水晶看到的环境：明暗对比更强（深色地面、亮天空、一道地平线），
// 折射后上下颠倒，水晶才显得「透」，否则在白底上只会是一团奶白
vec3 envT(vec3 d) {
  float up = -d.y;
  vec3 col = mix(vec3(0.36, 0.41, 0.33), vec3(0.99), smoothstep(-0.12, 0.3, up));
  col *= 1.0 - 0.55 * exp(-pow((up - 0.04) * 9.0, 2.0));
  col += pow(max(dot(d, normalize(KEY)), 0.0), 18.0) * 1.5;
  col = mix(col, LIME * 0.9, smoothstep(0.05, 0.85, -up) * 0.55);
  return col;
}

// 指针就是一盏灯：高光随光标在表面上平滑移动
float mouseSpec(vec3 r, float power) {
  vec3 L = normalize(vec3((uMouse - uC) / uS, -1.6));
  return pow(max(dot(r, L), 0.0), power) * 1.3 * uHover;
}

vec3 chrome(vec3 p, vec3 rd) {
  vec3 n = cageNormal(p);
  float ndv = clamp(dot(n, -rd), 0.0, 1.0);
  vec3 r = reflect(rd, n);
  float fres = 0.04 + 0.96 * pow(1.0 - ndv, 5.0);
  vec3 e = env(r);
  float ao = clamp(cageSDF(p + n * 0.06) / 0.06, 0.0, 1.0) * 0.4 + 0.6;
  return mix(e * vec3(0.86, 0.89, 0.9), e, fres) * ao + mouseSpec(r, 70.0);
}

// 透明水晶：表面反射 + 穿过内部的折射（带色散）+ 透过水晶看到的背面外壳
// 返回预乘 alpha 的颜色；没被外壳挡住的地方会透出页面背景
vec4 crystal(vec3 p, vec3 rd) {
  vec3 n = gelNormal(p);
  float ndv = clamp(dot(n, -rd), 0.0, 1.0);
  float F = 0.05 + 0.95 * pow(1.0 - ndv, 5.0);
  vec3 refl = env(reflect(rd, n)) + vec3(mouseSpec(reflect(rd, n), 90.0));

  // 穿过水晶内部，找到出射点
  vec3 rin = refract(rd, n, 1.0 / 1.5);
  vec3 q = p - n * 0.01;
  float thick = 0.0;
  float st = 0.0;
  for (int i = 0; i < 40; i++) {
    float d = gelSDF(q);
    if (d > 0.0) break;
    st = max(-d, 0.006);
    q += rin * st;
    thick += st;
  }
  // 二分细化出射点，避免内部折射出现断层
  for (int i = 0; i < 5; i++) {
    st *= 0.5;
    if (gelSDF(q) > 0.0) { q -= rin * st; thick -= st; } else { q += rin * st; thick += st; }
  }
  vec3 nOut = gelNormal(q);
  vec3 rOut = refract(rin, -nOut, 1.5);
  if (dot(rOut, rOut) < 1e-4) rOut = reflect(rin, -nOut);
  // 色散：红绿蓝三个通道的折射率略有不同，边缘出现一点彩边
  vec3 rR = refract(rin, -nOut, 1.47);
  vec3 rB = refract(rin, -nOut, 1.54);
  if (dot(rR, rR) < 1e-4) rR = rOut;
  if (dot(rB, rB) < 1e-4) rB = rOut;
  vec3 seen = vec3(envT(rR).r, envT(rOut).g, envT(rB).b);

  // 透过水晶看到的背面外壳
  float backA = 0.0;
  vec3 backC = vec3(0.0);
  float tb = 0.02;
  for (int i = 0; i < 40; i++) {
    vec3 bp = q + rOut * tb;
    float d = cageSDF(bp);
    if (d < 0.002) { backA = 1.0; backC = chrome(bp, rOut); break; }
    tb += d * 0.8;
    if (tb > 1.6) break;
  }

  float absorb = 1.0 - exp(-thick * 2.4);
  vec3 tint = mix(vec3(1.0), LIME, 0.1 + 0.3 * absorb);
  // 折射出的环境占多少：中间厚的地方折射清楚，边缘薄的地方更透出页面
  float body = 0.38 + 0.4 * absorb;
  float transA = mix(body, 0.92, backA);
  vec3 trans = tint * mix(seen, backC, backA) * transA;
  // 光在水晶内部聚焦形成的亮斑
  float caustic = pow(max(dot(rOut, normalize(KEY)), 0.0), 10.0);
  trans += mix(LIME, vec3(1.0), 0.4) * caustic * 0.55;
  vec3 col = refl * F + (1.0 - F) * trans;
  float a = F + (1.0 - F) * min(1.0, transA + caustic * 0.4);
  // 掠射角处的暗边，让玻璃轮廓更清晰
  float rim = smoothstep(0.55, 0.97, 1.0 - ndv);
  col = mix(col, vec3(0.16, 0.2, 0.12) * a, rim * 0.35);
  a = max(a, rim * 0.5);
  return vec4(col, a);
}

void main() {
  vec2 f = gl_FragCoord.xy / uFbo;
  vec2 scr = vec2(uRectMin.x + f.x * uRectSize.x, uRectMin.y + (1.0 - f.y) * uRectSize.y);
  vec2 q = (scr - uC) / uS;
  vec3 ro = vec3(0.0, 0.0, -CAM);
  vec3 rd = normalize(vec3(q, CAM));
  float b = dot(ro, rd);
  float h = b * b - (dot(ro, ro) - 0.72);
  if (h < 0.0) { gl_FragColor = vec4(0.0); return; }
  float t = max(-b - sqrt(h), 0.0);
  float tEnd = -b + sqrt(h);
  float pix = (uRectSize.x / uFbo.x) / uS / CAM;
  float minD = 1e3;
  float tMin = t;
  float hitT = -1.0;
  for (int i = 0; i < 100; i++) {
    vec3 p = ro + rd * t;
    float d = map(p).x;
    float px = pix * t;
    if (d / px < minD) { minD = d / px; tMin = t; }
    if (d < px * 0.25) { hitT = t; break; }
    t += d * 0.75;
    if (t > tEnd) break;
  }
  float cov = 1.0;
  if (hitT < 0.0) {
    // 没打中但擦边：按距离做抗锯齿
    cov = 1.0 - smoothstep(0.0, 1.2, minD);
    if (cov <= 0.0) { gl_FragColor = vec4(0.0); return; }
    hitT = tMin;
  }
  vec3 p = ro + rd * hitT;
  vec4 c = map(p).y > 0.5 ? vec4(chrome(p, rd), 1.0) : crystal(p, rd);
  gl_FragColor = clamp(c, 0.0, 1.0) * cov;
}
`;

const BLIT_VERT = /* glsl */ `
attribute vec2 aPos;
uniform vec4 uRect;
uniform vec2 uRes;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  vec2 scr = uRect.xy + vec2(vUv.x, 1.0 - vUv.y) * uRect.zw;
  vec2 clip = scr / uRes * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}
`;

const BLIT_FRAG = /* glsl */ `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform float uFade;
void main() { gl_FragColor = texture2D(uTex, vUv) * uFade; }
`;

const hex = (h: string): [number, number, number] => {
  const n = parseInt(h.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

const SHARED_UNIFORMS = [
  'uRes',
  'uTime',
  'uC',
  'uS',
  'uEnergy',
  'uImp',
  'uSyl',
  'uMouse',
  'uHover',
  'uExcite',
  'uGrow',
  'uFade',
];

type Loc = Record<string, WebGLUniformLocation | null>;

export interface CrystalRenderer {
  resize(width: number, height: number, dpr: number): void;
  render(sim: CrystalSim): void;
  /** 核心离屏渲染的分辨率倍数，帧率不够时调低 */
  setCoreScale(scale: number): void;
  dispose(): void;
}

export function createCrystalRenderer(
  canvas: HTMLCanvasElement,
  opts: { fibers: number; segments: number; coreScale: number }
): CrystalRenderer | null {
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
      console.error('[crystal] shader', gl.getShaderInfoLog(sh));
      return null;
    }
    shaders.push(sh);
    return sh;
  };
  const link = (vsSrc: string, fsSrc: string, names: string[]) => {
    const vs = compile(gl.VERTEX_SHADER, vsSrc);
    const fs = compile(gl.FRAGMENT_SHADER, fsSrc);
    if (!vs || !fs) return null;
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('[crystal] program', gl.getProgramInfoLog(prog));
      return null;
    }
    const loc: Loc = {};
    for (const name of names) loc[name] = gl.getUniformLocation(prog, name);
    return { prog, loc };
  };

  const line = link(LINE_VERT, LINE_FRAG, [
    ...SHARED_UNIFORMS,
    'uFrom',
    'uTo',
    'uMorph',
    'uMouseVel',
    'uScroll',
    'uAnchor',
    'uSide',
    'uReveal',
    'uShield',
    'uColFar',
    'uColNear',
    'uColGlow',
  ]);
  const core = link(CORE_VERT, CORE_FRAG, [
    ...SHARED_UNIFORMS,
    'uRectMin',
    'uRectSize',
    'uFbo',
    'uW',
    'uOpen',
    'uCage',
    'uLookDir',
  ]);
  const blit = link(BLIT_VERT, BLIT_FRAG, ['uRect', 'uRes', 'uTex', 'uFade']);
  if (!line || !core || !blit) return null;

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

  const quadVbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quadVbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const aPosCore = gl.getAttribLocation(core.prog, 'aPos');
  const aPosBlit = gl.getAttribLocation(blit.prog, 'aPos');

  // 核心的离屏目标
  const tex = gl.createTexture();
  const fbo = gl.createFramebuffer();
  let fboSize = 0;
  const ensureFbo = (size: number) => {
    if (size === fboSize) return;
    fboSize = size;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  };

  // 颜色取自品牌令牌：远处 brand-700，近处 brand-800（深橄榄），高光 brand-600（荧光黄绿）
  gl.useProgram(line.prog);
  gl.uniform3fv(line.loc.uColFar, hex('#9CC41A'));
  gl.uniform3fv(line.loc.uColNear, hex('#4D6A06'));
  gl.uniform3fv(line.loc.uColGlow, hex('#BFEA2E'));

  gl.disable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  let cssW = 1;
  let cssH = 1;
  let coreScale = opts.coreScale;

  const setShared = (loc: Loc, sim: CrystalSim) => {
    gl.uniform2f(loc.uRes, cssW, cssH);
    gl.uniform1f(loc.uTime, sim.time);
    gl.uniform2f(loc.uC, sim.cx, sim.cy);
    gl.uniform1f(loc.uS, sim.scale);
    gl.uniform1f(loc.uEnergy, sim.energy);
    gl.uniform4fv(loc.uImp, sim.impulses);
    gl.uniform4fv(loc.uSyl, sim.syllables);
    gl.uniform2fv(loc.uMouse, sim.mouse);
    gl.uniform1f(loc.uHover, sim.hover);
    gl.uniform1f(loc.uExcite, sim.excite);
    gl.uniform1f(loc.uGrow, sim.grow);
    gl.uniform1f(loc.uFade, sim.fade);
  };

  const drawLines = (sim: CrystalSim, side: number) => {
    gl.useProgram(line.prog);
    setShared(line.loc, sim);
    gl.uniform4fv(line.loc.uFrom, sim.from);
    gl.uniform4fv(line.loc.uTo, sim.to);
    gl.uniform1f(line.loc.uMorph, sim.morph);
    gl.uniform2fv(line.loc.uMouseVel, sim.mouseVel);
    gl.uniform1f(line.loc.uScroll, sim.scroll);
    gl.uniform4fv(line.loc.uAnchor, sim.anchors);
    gl.uniform1f(line.loc.uSide, side);
    gl.uniform1f(line.loc.uReveal, sim.reveal);
    gl.uniform4fv(line.loc.uShield, sim.shield);
    gl.bindBuffer(gl.ARRAY_BUFFER, lineVbo);
    gl.enableVertexAttribArray(aUT);
    gl.vertexAttribPointer(aUT, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, lineIbo);
    gl.drawElements(gl.LINES, idx.length, gl.UNSIGNED_SHORT, 0);
    gl.disableVertexAttribArray(aUT);
  };

  const drawCore = (sim: CrystalSim) => {
    if (sim.grow <= 0.001) return;
    // 核心外接正方形（含透视放大）
    const half = sim.scale * 0.95;
    const rect = [sim.cx - half, sim.cy - half, half * 2, half * 2];
    const size = Math.max(16, Math.round(half * 2 * coreScale));
    ensureFbo(size);

    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.viewport(0, 0, size, size);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.disable(gl.BLEND);
    gl.useProgram(core.prog);
    setShared(core.loc, sim);
    gl.uniform2f(core.loc.uRectMin, rect[0], rect[1]);
    gl.uniform2f(core.loc.uRectSize, rect[2], rect[3]);
    gl.uniform2f(core.loc.uFbo, size, size);
    gl.uniform4fv(core.loc.uW, sim.w);
    gl.uniform1f(core.loc.uOpen, sim.open);
    gl.uniform2f(core.loc.uCage, sim.cageFlow, sim.cageSpin);
    // 涟漪传来的方向（核心坐标系，z 朝向镜头为负）
    const lx = sim.listenFrom[0] - sim.cx;
    const ly = sim.listenFrom[1] - sim.cy;
    const ll = Math.hypot(lx, ly, sim.scale * 0.8) || 1;
    gl.uniform3f(core.loc.uLookDir, lx / ll, ly / ll, (-sim.scale * 0.8) / ll);
    gl.bindBuffer(gl.ARRAY_BUFFER, quadVbo);
    gl.enableVertexAttribArray(aPosCore);
    gl.vertexAttribPointer(aPosCore, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.disableVertexAttribArray(aPosCore);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.enable(gl.BLEND);
    gl.useProgram(blit.prog);
    gl.uniform4f(blit.loc.uRect, rect[0], rect[1], rect[2], rect[3]);
    gl.uniform2f(blit.loc.uRes, cssW, cssH);
    gl.uniform1f(blit.loc.uFade, sim.fade);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(blit.loc.uTex, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, quadVbo);
    gl.enableVertexAttribArray(aPosBlit);
    gl.vertexAttribPointer(aPosBlit, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.disableVertexAttribArray(aPosBlit);
  };

  return {
    resize(width, height, ratio) {
      cssW = width;
      cssH = height;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
    },
    setCoreScale(scale) {
      coreScale = scale;
    },
    render(sim) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (sim.fade <= 0.001) return;
      drawLines(sim, 1);
      drawCore(sim);
      drawLines(sim, 0);
    },
    dispose() {
      gl.deleteBuffer(lineVbo);
      gl.deleteBuffer(lineIbo);
      gl.deleteBuffer(quadVbo);
      gl.deleteTexture(tex);
      gl.deleteFramebuffer(fbo);
      [line, core, blit].forEach((p) => gl.deleteProgram(p.prog));
      shaders.forEach((sh) => gl.deleteShader(sh));
    },
  };
}
