/**
 * 「线索」丝线的 2D 版本：首屏 WebGL 轨道环的视觉语言，在首页其余章节里用 Canvas 2D 延续。
 *
 * 一束丝线 = 沿一条中心线排开的若干根细线（lane）。丝带会沿长度方向扭转：
 * 扭到侧面时所有细线收拢成一根，转回正面时又展开，细线互相交叉产生和首屏一样的莫尔纹。
 * 每根细线按「离镜头远近」取色：远处荧光黄绿偏淡，近处深橄榄偏实。
 *
 * 路径统一用 Float32Array 存 x0, y0, x1, y1, …（CSS 像素），方便插值和形变。
 */

export type Path = Float32Array;

export const TAU = Math.PI * 2;

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
/** 把 v 从 [a, b] 映射到 [0, 1] 并截断 */
export const range = (v: number, a: number, b: number) => clamp01((v - a) / (b - a));
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
/** 与帧率无关的指数趋近 */
export const approach = (from: number, to: number, rate: number, dt: number) =>
  from + (to - from) * (1 - Math.exp(-rate * dt));

/** 稳定的伪随机数，同一个种子每次结果一样 */
export function hash(n: number) {
  const s = Math.sin(n * 127.1 + 11.7) * 43758.5453;
  return s - Math.floor(s);
}

/** 三次贝塞尔曲线采样成 n 个点 */
export function bezier(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
  n: number,
  out: Path = new Float32Array(n * 2)
): Path {
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const it = 1 - t;
    const a = it * it * it;
    const b = 3 * it * it * t;
    const c = 3 * it * t * t;
    const d = t * t * t;
    out[i * 2] = a * x0 + b * x1 + c * x2 + d * x3;
    out[i * 2 + 1] = a * y0 + b * y1 + c * y2 + d * y3;
  }
  return out;
}

let denseBuf = new Float32Array(0);
let lenBuf = new Float32Array(0);

/**
 * 穿过若干关键点的平滑曲线（Catmull-Rom），按弧长均匀采样成 n 个点。
 * 关键点数量相同的两条曲线可以直接逐点插值做形变。
 */
export function spline(keys: number[], n: number, out: Path = new Float32Array(n * 2)): Path {
  const k = keys.length / 2;
  // 先密采样，再按弧长重采样，避免关键点间距不均时线条疏密不一
  const SUB = 24;
  const need = (SUB * (k - 1) + 1) * 2;
  if (denseBuf.length < need) denseBuf = new Float32Array(need);
  const tmp = denseBuf;
  const P = (i: number, c: number) => keys[Math.min(k - 1, Math.max(0, i)) * 2 + c];
  let o = 0;
  for (let s = 0; s < k - 1; s++) {
    const count = s === k - 2 ? SUB + 1 : SUB;
    for (let j = 0; j < count; j++) {
      const t = j / SUB;
      const t2 = t * t;
      const t3 = t2 * t;
      for (let c = 0; c < 2; c++) {
        const p0 = P(s - 1, c);
        const p1 = P(s, c);
        const p2 = P(s + 1, c);
        const p3 = P(s + 2, c);
        tmp[o * 2 + c] =
          0.5 *
          (2 * p1 +
            (-p0 + p2) * t +
            (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
            (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
      }
      o++;
    }
  }
  return resample(tmp, o, n, out);
}

/** 把一条折线按弧长均匀重采样 */
export function resample(src: Path, count: number, n: number, out: Path = new Float32Array(n * 2)) {
  if (lenBuf.length < count) lenBuf = new Float32Array(count);
  const len = lenBuf;
  len[0] = 0;
  for (let i = 1; i < count; i++) {
    len[i] = len[i - 1] + Math.hypot(src[i * 2] - src[i * 2 - 2], src[i * 2 + 1] - src[i * 2 - 1]);
  }
  const total = len[count - 1] || 1;
  let j = 0;
  for (let i = 0; i < n; i++) {
    const target = (i / (n - 1)) * total;
    while (j < count - 2 && len[j + 1] < target) j++;
    const seg = len[j + 1] - len[j] || 1;
    const t = Math.min(1, Math.max(0, (target - len[j]) / seg));
    out[i * 2] = src[j * 2] + (src[j * 2 + 2] - src[j * 2]) * t;
    out[i * 2 + 1] = src[j * 2 + 1] + (src[j * 2 + 3] - src[j * 2 + 1]) * t;
  }
  return out;
}

/** 两条点数相同的路径逐点插值 */
export function mix(a: Path, b: Path, k: number, out: Path = new Float32Array(a.length)): Path {
  for (let i = 0; i < a.length; i++) out[i] = a[i] + (b[i] - a[i]) * k;
  return out;
}

/**
 * 一道倾斜的椭圆轨道环（和首屏的轨道环同一种几何），同时给出每个点的前后关系：
 * depth > 0 在中心物体后面，< 0 在前面。
 */
export function ring(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  rot: number,
  phase: number,
  n: number,
  out: Path = new Float32Array(n * 2),
  depth: Float32Array = new Float32Array(n)
) {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  for (let i = 0; i < n; i++) {
    const a = (i / (n - 1)) * TAU + phase;
    const x = Math.cos(a) * rx;
    const y = Math.sin(a) * ry;
    out[i * 2] = cx + x * c - y * s;
    out[i * 2 + 1] = cy + x * s + y * c;
    depth[i] = -Math.sin(a);
  }
  return { path: out, depth };
}

export interface Palette {
  colors: string[];
}

const hexRgb = (h: string) => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** 远 → 近的若干档颜色（含透明度），画线时按深度取档，避免逐段拼颜色字符串 */
export function palette(
  far: string,
  near: string,
  farA: number,
  nearA: number,
  steps = 7
): Palette {
  const a = hexRgb(far);
  const b = hexRgb(near);
  const colors: string[] = [];
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    const c = a.map((v, j) => Math.round(v + (b[j] - v) * t));
    colors.push(`rgba(${c[0]},${c[1]},${c[2]},${(farA + (nearA - farA) * t).toFixed(3)})`);
  }
  return { colors };
}

/**
 * 写样式前先比对上一次的值，值没变就不写：滚动时 DOM 样式重复写入会触发不必要的样式重算。
 * 元素的样式必须都经过它写，否则缓存会失效（第一次写会覆盖掉之前直接写的值）。
 */
const styleCache = new WeakMap<HTMLElement, Record<string, string>>();
export function setStyle(el: HTMLElement, props: Record<string, string>) {
  let prev = styleCache.get(el);
  if (!prev) styleCache.set(el, (prev = {}));
  for (const k in props) {
    if (prev[k] === props[k]) continue;
    prev[k] = props[k];
    el.style.setProperty(k, props[k]);
  }
}

/** 品牌色板：浅底用荧光黄绿（远）→ 深橄榄（近）；深底用橄榄（远）→ 浅荧光（近） */
export const SILK_LIGHT = palette('#9CC41A', '#4D6A06', 0.3, 0.78);
export const SILK_DARK = palette('#5E7F12', '#D9F58A', 0.35, 0.95);
export const SILK_GLOW = palette('#BFEA2E', '#BFEA2E', 0.5, 1);

export interface RibbonOptions {
  palette: Palette;
  /** 细线根数 */
  lanes?: number;
  /** 丝带宽度（px） */
  width?: number;
  /** 沿全长扭转几圈 */
  twist?: number;
  /** 扭转相位（随时间变化就会缓缓转动） */
  phase?: number;
  /** 只画 [from, to] 这一段（0–1），用于「画出来」的动画 */
  from?: number;
  to?: number;
  alpha?: number;
  lineWidth?: number;
  /** 两端收拢成一点的比例（0–0.5） */
  taper?: number;
  /** 只收拢起点 / 终点 */
  taperStart?: boolean;
  taperEnd?: boolean;
  /** 每个点额外的前后关系（轨道环用），配合 side 只画前半或后半 */
  depth?: Float32Array;
  side?: -1 | 0 | 1;
  /** 细线之间的微小起伏，time 驱动 */
  wobble?: number;
  time?: number;
  /** 宽度沿长度的额外缩放（0–1 位置 → 倍数） */
  widthAt?: (s: number) => number;
}

/**
 * 画质：由 useSilkCanvas 在每次绘制前设置。帧率不够时降低细线根数，
 * 丝线的形状和颜色不变，只是更「稀」一点。
 */
let laneScale = 1;
export function setSilkQuality(scale: number) {
  laneScale = scale;
}

// 逐点的法线、扭转、宽度：所有丝线共用一块缓冲区，避免每帧分配
let scratch = new Float32Array(0);
const grow = (n: number) => {
  if (scratch.length < n * 4) scratch = new Float32Array(n * 4);
  return scratch;
};

/**
 * 画一束丝线。
 * 同一档颜色的线段收进同一个 Path2D，一束丝线最多描边 7 次（原来每根细线每换一次颜色就描边一次）；
 * 画布外的线段直接跳过。
 */
export function drawRibbon(ctx: CanvasRenderingContext2D, path: Path, o: RibbonOptions) {
  const n = path.length / 2;
  if (n < 2) return;
  const lanes = Math.max(3, Math.round((o.lanes ?? 12) * laneScale));
  const width = o.width ?? 16;
  const twist = o.twist ?? 1.2;
  const phase = o.phase ?? 0;
  const from = clamp01(o.from ?? 0);
  const to = clamp01(o.to ?? 1);
  if (to - from <= 0.001) return;
  const taper = o.taper ?? 0;
  const tStart = o.taperStart ?? true;
  const tEnd = o.taperEnd ?? true;
  const wobble = o.wobble ?? 0;
  const time = o.time ?? 0;
  const colors = o.palette.colors;
  const steps = colors.length;
  const side = o.side ?? 0;
  const depth = o.depth;
  const i0 = Math.floor(from * (n - 1));
  const i1 = Math.ceil(to * (n - 1));

  // 可见范围（当前坐标系下），向外留出丝带宽度
  const m = ctx.getTransform();
  const pad = width * 2 + 8;
  const bx0 = -m.e / m.a - pad;
  const by0 = -m.f / m.d - pad;
  const bx1 = (ctx.canvas.width - m.e) / m.a + pad;
  const by1 = (ctx.canvas.height - m.f) / m.d + pad;

  // 每个点的法线、扭转角、宽度只算一次，所有细线共用
  const buf = grow(n);
  for (let i = i0; i <= i1; i++) {
    const a = Math.max(0, i - 1);
    const b = Math.min(n - 1, i + 1);
    let tx = path[b * 2] - path[a * 2];
    let ty = path[b * 2 + 1] - path[a * 2 + 1];
    const l = Math.hypot(tx, ty) || 1;
    tx /= l;
    ty /= l;
    const s = i / (n - 1);
    const th = TAU * twist * s + phase;
    let w = width;
    if (taper > 0) {
      // 收拢按「画出来的那一段」计算：线还在生长时，生长的尖端也是收拢的
      const v = (s - from) / Math.max(1e-3, to - from);
      const span = to - from;
      if (tStart) w *= Math.min(1, (v * span) / taper);
      if (tEnd) w *= Math.min(1, ((1 - v) * span) / taper);
      w = w * (0.15 + 0.85 * Math.sin((Math.min(1, w / width) * Math.PI) / 2));
    }
    if (o.widthAt) w *= o.widthAt(s);
    buf[i * 4] = -ty;
    buf[i * 4 + 1] = tx;
    buf[i * 4 + 2] = Math.cos(th) * w;
    buf[i * 4 + 3] = Math.sin(th);
  }

  const paths: (Path2D | undefined)[] = [];
  for (let k = 0; k < lanes; k++) {
    const lane = lanes === 1 ? 0 : k / (lanes - 1) - 0.5;
    const wob = wobble * (hash(k * 7.1) - 0.5);
    let px = 0;
    let py = 0;
    let pVis = false;
    let pIn = false;
    let run = -1; // 上一段收进了哪一档颜色；-1 表示断开
    for (let i = i0; i <= i1; i++) {
      const s = i / (n - 1);
      const off = lane * buf[i * 4 + 2] + (wobble ? wob * Math.sin(time * 0.9 + s * 9 + k) : 0);
      const x = path[i * 2] + buf[i * 4] * off;
      const y = path[i * 2 + 1] + buf[i * 4 + 1] * off;
      const pd = depth ? depth[i] : 0;
      const vis = side === 0 || (side > 0 ? pd >= 0 : pd < 0);
      const inb = x > bx0 && x < bx1 && y > by0 && y < by1;
      // 一段线：两端有一端可见、且有一端在画布里才画
      if (i > i0 && (vis || pVis) && (inb || pIn)) {
        // 深度：丝带自身的扭转 + 路径本身的前后（轨道环）
        const d = lane * buf[i * 4 + 3] * 0.9 + pd * 0.5;
        const b = Math.max(0, Math.min(steps - 1, Math.round((0.5 - d) * (steps - 1))));
        let p2 = paths[b];
        if (!p2) p2 = paths[b] = new Path2D();
        if (run !== b) p2.moveTo(px, py);
        p2.lineTo(x, y);
        run = b;
      } else run = -1;
      px = x;
      py = y;
      pVis = vis;
      pIn = inb;
    }
  }

  ctx.lineWidth = o.lineWidth ?? 1;
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'bevel';
  const prevAlpha = ctx.globalAlpha;
  ctx.globalAlpha = prevAlpha * (o.alpha ?? 1);
  for (let b = 0; b < steps; b++) {
    const p2 = paths[b];
    if (!p2) continue;
    ctx.strokeStyle = colors[b];
    ctx.stroke(p2);
  }
  ctx.globalAlpha = prevAlpha;
}

/** 在丝线某个位置（0–1）取点，用于让文字或节点「挂」在线上 */
export function pointAt(path: Path, s: number): [number, number] {
  const n = path.length / 2;
  const f = clamp01(s) * (n - 1);
  const i = Math.min(n - 2, Math.floor(f));
  const t = f - i;
  return [
    path[i * 2] + (path[i * 2 + 2] - path[i * 2]) * t,
    path[i * 2 + 1] + (path[i * 2 + 3] - path[i * 2 + 1]) * t,
  ];
}

/** 一个发光的结：线索在这里汇合 */
export function drawKnot(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  fill: string,
  stroke: string,
  alpha = 1
) {
  if (alpha <= 0.001) return;
  const prev = ctx.globalAlpha;
  ctx.globalAlpha = prev * alpha;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = stroke;
  ctx.stroke();
  ctx.globalAlpha = prev;
}
