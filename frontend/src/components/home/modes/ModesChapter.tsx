'use client';

import Link from 'next/link';
import { createContext, useContext, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowRight, Code2, FolderKanban, UserRound, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useMotionValueEvent, useScroll } from 'motion/react';
import { INTERVIEW_TYPES } from '@/config/interviewTypes';
import type { InterviewKind } from '@/config/interviewTypes';
import { KineticText } from '@/components/motion/KineticText';
import { cn } from '@/lib/cn';
import {
  SILK_GLOW,
  SILK_LIGHT,
  approach,
  drawKnot,
  drawRibbon,
  easeInOut,
  easeOut,
  lerp,
  pointAt,
  range,
  setStyle,
  spline,
} from '../silk/silk';
import { useSilkCanvas } from '../silk/useSilkCanvas';

interface Mode {
  kind: InterviewKind;
  /** 舞台背景里的大字：这种模式的结构 */
  word: string;
  title: string;
  lead: string;
  cta: string;
  /** 舞台里的元素按本模式内的滚动进度依次出现：第 n 步在进度达到 steps[n] 时出现 */
  steps: number[];
}

const MODES: Mode[] = [
  {
    kind: 'social',
    word: '深挖',
    title: '一个项目，问到第三层',
    lead: '围绕你简历里的项目，面试官顺着你的回答一层层追问，直到问出你真正理解到哪一步。',
    cta: '开始社招面试',
    steps: [0, 0.22, 0.48, 0.72],
  },
  {
    kind: 'campus',
    word: '广度',
    title: '从基础问起，再问回项目',
    lead: '计算机网络、操作系统、数据结构，最后落回你做过的项目。面向应届生的出题方式。',
    cta: '开始校招面试',
    steps: [0, 0.3, 0.6],
  },
  {
    kind: 'special',
    word: '聚焦',
    title: '只练一门技术栈，练透',
    lead: '选好技术栈，所有问题都集中在这一个方向，快速补齐短板。专项面试不需要简历。',
    cta: '选择技术栈',
    steps: [0, 0.35, 0.65],
  },
  {
    kind: 'multi',
    word: '同场',
    title: '三位面试官，同时在场',
    lead: '主面试官把控节奏，技术面试官深挖原理，项目面试官追问业务细节。还原大厂的多人面试。',
    cta: '开始多人面试',
    steps: [0, 0.33, 0.66],
  },
];

/** 舞台按滚动进度分成四段；相邻两段之间留一小段做丝线形变 */
const SEG = 1 / MODES.length;
const MORPH_IN = 0.06;
const MORPH_OUT = 0.012;
/** 文字和界面在形变的中点切换 */
const SWITCH = (MORPH_IN - MORPH_OUT) / 2;
const localProgress = (p: number, m: number) =>
  range(
    p,
    m === 0 ? 0 : m * SEG + MORPH_OUT,
    m === MODES.length - 1 ? 0.98 : (m + 1) * SEG - MORPH_IN
  );

/* ---------------------------------- 舞台元素 ---------------------------------- */

const Scene = createContext<{ flow: boolean; step: number; speaker: number }>({
  flow: true,
  step: 9,
  speaker: -1,
});

/**
 * 舞台上的一个浮动元素。at 是它在舞台里的位置（百分比）；a 是丝线接入点的名字；
 * depth 决定鼠标视差的强弱。手机端和减弱动态效果时按普通文档流排列。
 */
function Float({
  at,
  a,
  step = 0,
  depth = 1,
  indent = 0,
  children,
}: {
  at: [number, number];
  a?: string;
  step?: number;
  depth?: number;
  indent?: number;
  children: ReactNode;
}) {
  const { flow, step: cur } = useContext(Scene);
  if (flow) return <div style={{ marginLeft: indent * 20 }}>{children}</div>;
  return (
    <div
      data-a={a}
      data-depth={depth}
      className="absolute will-change-transform"
      style={{ left: `${at[0]}%`, top: `${at[1]}%` }}
    >
      <div
        className={cn(
          'transition-[opacity,transform] duration-500 ease-out',
          cur >= step ? 'opacity-100' : 'translate-y-2 opacity-0'
        )}
      >
        {children}
      </div>
    </div>
  );
}

function Pill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-line bg-white/80 px-3 py-1 text-[13px] text-ink-secondary backdrop-blur">
      <span className="h-1.5 w-1.5 rounded-full bg-brand-700" aria-hidden="true" />
      {children}
    </span>
  );
}

function Bubble({
  who,
  brand = false,
  children,
}: {
  who: string;
  brand?: boolean;
  children: ReactNode;
}) {
  return (
    <p
      className={cn(
        'w-max max-w-[300px] rounded-2xl border bg-white px-4 py-3 text-[15px] leading-6 text-ink shadow-card xl:max-w-[360px] xl:px-5 xl:py-3.5 xl:text-base xl:leading-7',
        brand ? 'border-brand-200' : 'border-line'
      )}
    >
      <span
        className={cn('mr-2 text-xs font-medium', brand ? 'text-brand-800' : 'text-ink-secondary')}
      >
        {who}
      </span>
      {children}
    </p>
  );
}

function Chip({ children, on = false, a }: { children: ReactNode; on?: boolean; a?: string }) {
  return (
    <span
      data-a={a}
      className={cn(
        'inline-block whitespace-nowrap rounded-xl border px-3.5 py-2 text-[15px] shadow-card',
        on ? 'border-brand-700 bg-brand-600 font-medium text-ink' : 'border-line bg-white text-ink'
      )}
    >
      {children}
    </span>
  );
}

function Meter({ label, value, of = 3 }: { label: string; value: number; of?: number }) {
  return (
    <div className="flex items-center gap-3 text-[13px] text-ink-secondary">
      {label}
      <span className="flex gap-1" aria-hidden="true">
        {Array.from({ length: of }).map((_, i) => (
          <span
            key={i}
            className={cn('h-1.5 w-6 rounded-full', i < value ? 'bg-brand-600' : 'bg-line')}
          />
        ))}
      </span>
    </div>
  );
}

function Panelist({ name, icon: Icon, index }: { name: string; icon: LucideIcon; index: number }) {
  const { speaker } = useContext(Scene);
  const on = speaker === index;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-full border bg-white py-1.5 pl-1.5 pr-3.5 text-[14px] shadow-card transition-[border-color,box-shadow] duration-300',
        on ? 'border-brand-700 shadow-[0_0_0_4px_rgba(191,234,46,0.3)]' : 'border-line'
      )}
    >
      <span
        className={cn(
          'grid h-7 w-7 place-items-center rounded-full transition-colors duration-300',
          on ? 'bg-brand-600 text-ink' : 'bg-warning-soft text-warning'
        )}
      >
        <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
      </span>
      {name}
    </span>
  );
}

const PANEL_LINES = [
  { who: '主面试官', text: '先用两分钟，介绍一下你最近做的项目。' },
  { who: '技术面试官', text: '消息队列重复消费，你们是怎么处理的？' },
  { who: '项目面试官', text: '这个功能上线后，业务指标有什么变化？' },
];

function PanelSpeech() {
  const { speaker, flow } = useContext(Scene);
  if (flow) {
    return (
      <div className="space-y-2">
        {PANEL_LINES.map((l) => (
          <Bubble key={l.who} who={l.who}>
            {l.text}
          </Bubble>
        ))}
      </div>
    );
  }
  const line = PANEL_LINES[Math.max(0, speaker)];
  return (
    <div key={line.who} className="animate-fade-in">
      <Bubble who={line.who} brand>
        {line.text}
      </Bubble>
    </div>
  );
}

/** 四种模式各自的舞台构图 */
function SceneFor({ kind }: { kind: InterviewKind }) {
  switch (kind) {
    case 'social':
      return (
        <>
          <Float at={[4, 13]}>
            <Pill>社招 · 后端开发 · 第 2 问</Pill>
          </Float>
          <Float at={[6, 25]} a="a0" depth={0.6}>
            <Bubble who="面试官">订单缓存是怎么和数据库保持一致的？</Bubble>
          </Float>
          <Float at={[17, 41]} a="a1" step={1} depth={1} indent={1}>
            <Bubble who="追问" brand>
              删除缓存失败了怎么办？
            </Bubble>
          </Float>
          <Float at={[28, 57]} a="a2" step={2} depth={1.4} indent={2}>
            <Bubble who="再追问" brand>
              重试期间读到旧数据，业务能接受吗？
            </Bubble>
          </Float>
          <Float at={[28, 73]} step={3} depth={1.7}>
            <Meter label="同一个话题，追问到第 3 层" value={3} />
          </Float>
        </>
      );
    case 'campus':
      return (
        <>
          <Float at={[4, 13]}>
            <Pill>校招 · 应届生 · 第 1 问</Pill>
          </Float>
          <Float at={[8, 25]} a="q" depth={0.6}>
            <Bubble who="面试官">TCP 三次握手，为什么不是两次？</Bubble>
          </Float>
          <Float at={[2, 58]} a="a0" depth={1.2}>
            <Chip>计算机网络</Chip>
          </Float>
          <Float at={[22, 69]} a="a1" depth={1.5}>
            <Chip>操作系统</Chip>
          </Float>
          <Float at={[42, 59]} a="a2" depth={1.2}>
            <Chip>数据结构</Chip>
          </Float>
          <Float at={[62, 40]} a="a3" step={1} depth={0.9}>
            <Chip on>项目经历</Chip>
          </Float>
          <Float at={[44, 78]} step={2} depth={1.7}>
            <Bubble who="问回项目" brand>
              你项目里的长连接，是怎么保活的？
            </Bubble>
          </Float>
        </>
      );
    case 'special':
      return (
        <>
          <Float at={[4, 13]}>
            <Pill>专项 · 不需要简历</Pill>
          </Float>
          <Float at={[4, 24]} depth={0.5}>
            <div className="flex flex-wrap gap-2" aria-label="技术栈">
              <Chip>Go</Chip>
              <Chip>Java</Chip>
              <Chip on a="lens">
                Redis
              </Chip>
              <Chip>MySQL</Chip>
              <Chip>系统设计</Chip>
            </div>
          </Float>
          <Float at={[16, 45]} a="q" depth={1}>
            <Bubble who="面试官">Redis 的持久化，RDB 和 AOF 你会怎么选？</Bubble>
          </Float>
          <Float at={[28, 61]} a="f" step={1} depth={1.3} indent={1}>
            <Bubble who="追问" brand>
              AOF 重写期间宕机，会丢数据吗？
            </Bubble>
          </Float>
          <Float at={[28, 77]} step={2} depth={1.6}>
            <p className="text-[13px] text-ink-secondary">
              这一场只问 Redis：持久化 · 缓存一致性 · 集群
            </p>
          </Float>
        </>
      );
    case 'multi':
      return (
        <>
          <Float at={[4, 13]}>
            <Pill>多人 · 三位面试官轮流提问</Pill>
          </Float>
          <Float at={[2, 26]} a="a0" depth={0.8}>
            <Panelist name="主面试官" icon={Users} index={0} />
          </Float>
          <Float at={[34, 22]} a="a1" depth={1}>
            <Panelist name="技术面试官" icon={Code2} index={1} />
          </Float>
          <Float at={[64, 26]} a="a2" depth={0.8}>
            <Panelist name="项目面试官" icon={FolderKanban} index={2} />
          </Float>
          <Float at={[10, 46]} depth={1.3}>
            <PanelSpeech />
          </Float>
          <Float at={[38, 72]} a="you" depth={1.5}>
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-white py-1.5 pl-1.5 pr-4 text-[14px] text-ink shadow-card">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-canvas">
                <UserRound
                  className="h-4 w-4 text-ink-secondary"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
              </span>
              你
            </span>
          </Float>
        </>
      );
  }
}

/* ---------------------------------- 丝线布局 ---------------------------------- */

type Rect = { x: number; y: number; w: number; h: number };
type Anchors = Record<string, Rect>;
interface Spec {
  /** 5 个关键点 x, y */
  keys: number[];
  width: number;
  twist: number;
  alpha: number;
  /** 丝线伸到终点的比例 */
  reach: number;
  glow: number;
}

const ZERO: Rect = { x: 0, y: 0, w: 0, h: 0 };
const cx = (r: Rect) => r.x + r.w / 2;
const cy = (r: Rect) => r.y + r.h / 2;

/** 每种模式下四束丝线的走向：都从线孔进入，终点和路径表达这种模式的结构 */
function specsFor(
  mode: number,
  A: Anchors,
  ports: [number, number][],
  H: number,
  lp: number,
  hover: string | null
): Spec[] {
  const g = (id: string) => A[id] ?? ZERO;
  const steps = MODES[mode].steps;
  const glowOf = (id: string) => (hover === id ? 1 : 0);
  const start = (k: number) => [
    ports[k][0],
    ports[k][1],
    ports[k][0],
    Math.max(ports[k][1], 0) + 0.1 * H,
  ];
  let out: Spec[] = [];

  if (mode === 0) {
    // 深挖：三束线从左侧依次接进三层追问
    out = [0, 1, 2].map((k) => {
      const b = g(`a${k}`);
      const ex = b.x - 3;
      const ey = cy(b);
      return {
        keys: [...start(k), ex - 150 + k * 18, ey - 80, ex - 44, ey, ex, ey],
        width: 16,
        twist: 1.6,
        alpha: 1,
        reach: k === 0 ? 1 : range(lp, steps[k] - 0.14, steps[k]),
        glow: glowOf(`a${k}`),
      };
    });
    out.push({ ...out[2], alpha: 0, reach: 0, glow: 0 });
  } else if (mode === 1) {
    // 广度：穿过问题之后散开，分别接到三门基础课；最后一束绕回项目经历
    const q = g('q');
    out = [0, 1, 2].map((k) => {
      const t = g(`a${k}`);
      const qx = q.x + q.w * (0.25 + 0.25 * k);
      return {
        keys: [
          ...start(k),
          qx,
          cy(q),
          lerp(qx, cx(t), 0.55),
          lerp(q.y + q.h, t.y, 0.5),
          cx(t),
          t.y - 2,
        ],
        width: 18,
        twist: 1.2,
        alpha: 1,
        reach: 1,
        glow: glowOf(`a${k}`),
      };
    });
    const p = g('a3');
    out.push({
      keys: [...start(2), q.x + q.w * 0.9, cy(q), p.x - 50, cy(p) + 16, p.x - 3, cy(p)],
      width: 14,
      twist: 2,
      alpha: 1,
      reach: range(lp, steps[1] - 0.18, steps[1]),
      glow: glowOf('a3'),
    });
  } else if (mode === 2) {
    // 聚焦：所有线穿过同一个技术栈，收成一束，再拧紧往下问
    const lens = g('lens');
    const q = g('q');
    const f = g('f');
    out = [0, 1, 2].map((k) => {
      const end = k < 2 ? [q.x - 3, cy(q) + (k - 0.5) * 6] : [f.x - 3, cy(f)];
      return {
        keys: [
          ...start(k),
          cx(lens) + (k - 1) * 10,
          lens.y - 30,
          cx(lens) + (k - 1) * 3,
          lens.y + lens.h + 36,
          end[0],
          end[1],
        ],
        width: 9,
        twist: 3.4,
        alpha: 1,
        reach: k < 2 ? 1 : range(lp, steps[1] - 0.16, steps[1]),
        glow: glowOf(k < 2 ? 'q' : 'f'),
      };
    });
    out.push({ ...out[2], alpha: 0, reach: 0, glow: 0 });
  } else {
    // 三方：三束线各自穿过一位面试官，再一起落到你身上；正在提问的那束发亮
    const you = g('you');
    const speaker = lp < steps[1] ? 0 : lp < steps[2] ? 1 : 2;
    out = [0, 1, 2].map((k) => {
      const av = g(`a${k}`);
      return {
        keys: [
          ...start(k),
          cx(av),
          cy(av),
          lerp(cx(av), cx(you), 0.45),
          lerp(cy(av), you.y, 0.6),
          cx(you) + (k - 1) * 14,
          you.y + 4,
        ],
        width: 14,
        twist: 1.4,
        alpha: speaker === k ? 1 : 0.55,
        reach: 1,
        glow: speaker === k || hover === `a${k}` ? 1 : 0,
      };
    });
    out.push({ ...out[2], alpha: 0, reach: 0, glow: 0 });
  }
  return out;
}

/* ---------------------------------- 章节 ---------------------------------- */

const N = 120;
const STICKY_TOP = 64;

/**
 * 四种面试模式：一个被固定住的舞台。往下滚，四种模式依次登场；
 * 从首屏垂下来的丝线穿过线孔进入舞台，按每种模式的结构重新走线。
 */
export default function ModesChapter() {
  const trackRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const regionRef = useRef<HTMLDivElement>(null);
  const eyesRef = useRef<HTMLDivElement>(null);
  const fillRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const [active, setActive] = useState(0);
  const [step, setStep] = useState(0);
  const stateRef = useRef({ active: 0, step: 0 });
  const smooth = useRef({ p: 0, enter: 0, mx: 0, my: 0, tx: 0, ty: 0 });
  const hoverRef = useRef<string | null>(null);

  const { scrollYProgress } = useScroll({
    target: trackRef,
    offset: [`start ${STICKY_TOP}px`, 'end end'],
  });
  const { scrollYProgress: enterProgress } = useScroll({
    target: trackRef,
    offset: ['start end', `start ${STICKY_TOP}px`],
  });

  const { invalidate } = useSilkCanvas(
    canvasRef,
    ({ ctx, w, h, time, dt, reduced }) => {
      const s = smooth.current;
      const targetP = scrollYProgress.get();
      const targetE = enterProgress.get();
      s.p = reduced ? targetP : approach(s.p, targetP, 12, dt);
      s.enter = reduced ? targetE : approach(s.enter, targetE, 12, dt);
      s.mx = approach(s.mx, s.tx, 5, dt);
      s.my = approach(s.my, s.ty, 5, dt);
      const p = s.p;

      // 当前在哪两种模式之间
      let a = Math.min(MODES.length - 1, Math.floor(p / SEG));
      let b = a;
      let e = 0;
      for (let i = 0; i < MODES.length - 1; i++) {
        const T = (i + 1) * SEG;
        if (p > T - MORPH_IN && p < T + MORPH_OUT) {
          a = i;
          b = i + 1;
          e = easeInOut(range(p, T - MORPH_IN, T + MORPH_OUT));
        }
      }

      // 先读：线孔、接入点的位置（相对画布）
      const cr = ctx.canvas.getBoundingClientRect();
      const eyes = eyesRef.current?.querySelectorAll<HTMLElement>('[data-thread-anchor]') ?? [];
      const ports: [number, number][] = Array.from(eyes).map((el) => {
        const r = el.getBoundingClientRect();
        return [r.left + r.width / 2 - cr.left, Math.max(-240, r.bottom - cr.top - 2)];
      });
      if (ports.length < 3) return;
      const panels = regionRef.current?.querySelectorAll<HTMLElement>('[data-panel]');
      if (!panels) return;
      const measure = (i: number): Anchors => {
        const A: Anchors = {};
        panels[i].querySelectorAll<HTMLElement>('[data-a]').forEach((el) => {
          const r = el.getBoundingClientRect();
          A[el.dataset.a!] = { x: r.left - cr.left, y: r.top - cr.top, w: r.width, h: r.height };
        });
        return A;
      };
      const SA = specsFor(a, measure(a), ports, h, localProgress(p, a), hoverRef.current);
      const SB =
        b === a ? SA : specsFor(b, measure(b), ports, h, localProgress(p, b), hoverRef.current);

      // 再写：鼠标视差、模式进度条
      if (!reduced) {
        regionRef.current?.querySelectorAll<HTMLElement>(':scope > [data-depth]').forEach((el) => {
          const d = Number(el.dataset.depth);
          setStyle(el, {
            transform: `translate3d(${(s.mx * d * 10).toFixed(2)}px, ${(s.my * d * 8).toFixed(2)}px, 0)`,
          });
        });
        [a, b].forEach((i) =>
          panels[i].querySelectorAll<HTMLElement>('[data-depth]').forEach((el) => {
            const d = Number(el.dataset.depth);
            setStyle(el, {
              transform: `translate3d(${(s.mx * d * 10).toFixed(2)}px, ${(s.my * d * 8).toFixed(2)}px, 0)`,
            });
          })
        );
      }
      fillRefs.current.forEach((el, i) => {
        if (el)
          setStyle(el, { transform: `scaleY(${range(p, i * SEG, (i + 1) * SEG).toFixed(3)})` });
      });

      // 离散状态：当前模式、模式内的步骤
      let nextActive = 0;
      for (let i = 0; i < MODES.length - 1; i++) if (p > (i + 1) * SEG - SWITCH) nextActive = i + 1;
      const lp = localProgress(p, nextActive);
      const nextStep = MODES[nextActive].steps.filter((t) => lp >= t).length - 1;
      if (nextActive !== stateRef.current.active || nextStep !== stateRef.current.step) {
        stateRef.current = { active: nextActive, step: nextStep };
        setActive(nextActive);
        setStep(nextStep);
      }

      // 画线
      const reveal = easeOut(range(s.enter, 0.35, 1));
      for (let r = 0; r < 4; r++) {
        const A = SA[r];
        const B = SB[r];
        const keys = A.keys.map((v, i) => lerp(v, B.keys[i], e));
        const reach = lerp(A.reach, B.reach, e) * reveal;
        const alpha = lerp(A.alpha, B.alpha, e);
        if (alpha < 0.01 || reach < 0.005) continue;
        const width = lerp(A.width, B.width, e);
        const twist = lerp(A.twist, B.twist, e);
        const glow = lerp(A.glow, B.glow, e);
        const path = spline(keys, N);
        const opts = {
          lanes: 14,
          width,
          twist,
          phase: time * 0.5 + r * 1.7,
          to: reach,
          taper: 0.1,
          taperStart: false,
          alpha,
          wobble: 1.2,
          time,
          widthAt: (t: number) => 1 + 1.6 * Math.pow(1 - t, 10),
        };
        drawRibbon(ctx, path, { ...opts, palette: SILK_LIGHT });
        if (glow > 0.01) {
          drawRibbon(ctx, path, {
            ...opts,
            palette: SILK_GLOW,
            lanes: 5,
            width: width * 0.5,
            alpha: glow * 0.9,
          });
        }
        if (reach > 0.97) {
          const [x, y] = pointAt(path, 1);
          drawKnot(ctx, x, y, 3.5, '#BFEA2E', '#4D6A06', alpha * range(reach, 0.97, 1));
        }
      }
      return (
        Math.abs(s.p - targetP) > 0.0005 ||
        Math.abs(s.enter - targetE) > 0.001 ||
        Math.abs(s.mx - s.tx) > 0.002 ||
        Math.abs(s.my - s.ty) > 0.002
      );
    },
    { ambient: true, dprCap: 1.5 }
  );

  useMotionValueEvent(scrollYProgress, 'change', invalidate);
  useMotionValueEvent(enterProgress, 'change', invalidate);

  /** 点击左侧的模式：滚动到舞台上对应的那一段 */
  const jump = (i: number) => {
    const track = trackRef.current;
    if (!track) return;
    const top = track.getBoundingClientRect().top + window.scrollY - STICKY_TOP;
    const dist = track.offsetHeight - (window.innerHeight - STICKY_TOP);
    const p = i * SEG + (i === 0 ? 0.02 : MORPH_OUT + 0.06);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: top + p * dist, behavior: reduce ? 'auto' : 'smooth' });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    const r = e.currentTarget.getBoundingClientRect();
    smooth.current.tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
    smooth.current.ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-a]');
    hoverRef.current = el?.dataset.a ?? null;
    invalidate();
  };

  const mode = MODES[active];
  const meta = INTERVIEW_TYPES[mode.kind];

  return (
    <section id="modes" aria-label="四种面试模式" className="relative scroll-mt-16">
      {/* 引子：大标题，以及首屏丝线穿过的三个线孔 */}
      <div className="page pt-24 lg:pt-32">
        <p className="eyebrow">四种面试模式</p>
        <div data-shield className="mt-4 w-fit">
          <KineticText
            as="h2"
            text="同一位面试官，四种问法。"
            className="block text-[clamp(2.25rem,5vw,4.25rem)] font-semibold leading-[1.1] tracking-[-0.03em] text-ink"
          />
        </div>
        <p className="mt-5 max-w-[32em] text-base leading-7 text-ink-secondary">
          每种模式的出题方向和追问深度都不一样。不确定选哪个，就从社招简历面试开始。
        </p>
        <div className="mt-12 lg:grid lg:grid-cols-[minmax(0,380px)_1fr] lg:gap-10">
          <div className="hidden lg:block" />
          <div ref={eyesRef} className="relative h-3 motion-reduce:invisible" aria-hidden="true">
            {[30, 52, 74].map((x) => (
              <span
                key={x}
                data-thread-anchor
                className="thread-eye absolute top-0 w-14 -translate-x-1/2"
                style={{ left: `${x}%` }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* 桌面端：固定舞台。手机端和减弱动态效果时换成下面的纵向列表 */}
      <div ref={trackRef} className="relative hidden h-[440vh] lg:motion-safe:block">
        <div
          className="sticky top-16 h-[calc(100vh-4rem)] overflow-hidden"
          onPointerMove={onPointerMove}
          onPointerLeave={() => {
            smooth.current.tx = 0;
            smooth.current.ty = 0;
            hoverRef.current = null;
            invalidate();
          }}
        >
          <canvas
            ref={canvasRef}
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 h-full w-full"
          />
          <div className="page relative grid h-full grid-cols-[minmax(0,380px)_1fr] gap-10">
            <div className="flex flex-col justify-center pb-10">
              <ul className="space-y-0.5" aria-label="选择面试模式">
                {MODES.map((m, i) => (
                  <li key={m.kind}>
                    <button
                      type="button"
                      onClick={() => jump(i)}
                      aria-current={active === i ? 'step' : undefined}
                      className="group flex h-11 w-full items-center gap-3 text-left"
                    >
                      <span className="relative h-7 w-[3px] overflow-hidden rounded-full bg-line">
                        <span
                          ref={(el) => (fillRefs.current[i] = el)}
                          className="absolute inset-0 origin-top rounded-full bg-brand-700"
                          style={{ transform: 'scaleY(0)' }}
                        />
                      </span>
                      <span
                        className={cn(
                          'text-[15px] transition-colors duration-300',
                          active === i
                            ? 'font-medium text-ink'
                            : 'text-ink-secondary group-hover:text-ink'
                        )}
                      >
                        {INTERVIEW_TYPES[m.kind].label}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <KineticText
                key={active}
                immediate
                as="h3"
                stagger={24}
                text={mode.title}
                className="mt-10 block text-[clamp(2rem,3.3vw,2.875rem)] font-semibold leading-[1.18] tracking-[-0.02em] text-ink"
              />
              <p
                key={`lead-${active}`}
                className="mt-5 max-w-[26em] animate-fade-in text-base leading-7 text-ink-secondary"
              >
                {mode.lead}
              </p>
              <Link href={meta.href} className="link-btn-primary link-btn-lg mt-8 w-fit">
                {mode.cta}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>

            <div ref={regionRef} className="relative h-full">
              {/* 背景大字：空心描边，和丝线反向视差，拉出纵深 */}
              <div
                data-depth="-0.8"
                aria-hidden="true"
                className="pointer-events-none absolute bottom-[2%] right-[-2%] select-none"
              >
                <KineticText
                  key={`w-${active}`}
                  immediate
                  stagger={90}
                  text={mode.word}
                  className="block text-[clamp(9rem,15vw,15rem)] font-semibold leading-none tracking-[-0.05em] text-transparent [-webkit-text-stroke:1.5px_#CDD4D0]"
                />
              </div>
              {MODES.map((m, i) => (
                <div
                  key={m.kind}
                  data-panel={i}
                  aria-hidden={active !== i}
                  className={cn(
                    'absolute inset-0 transition-[opacity,transform] duration-500 ease-out',
                    active === i
                      ? 'opacity-100'
                      : cn(
                          'pointer-events-none opacity-0',
                          i < active ? '-translate-y-6' : 'translate-y-6'
                        )
                  )}
                >
                  <Scene.Provider
                    value={{
                      flow: false,
                      step: i < active ? 9 : i === active ? step : 0,
                      speaker: i === active ? step : -1,
                    }}
                  >
                    <SceneFor kind={m.kind} />
                  </Scene.Provider>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 手机端 / 减弱动态效果：纵向排列四种模式 */}
      <div className="page mt-4 space-y-4 pb-8 lg:motion-safe:hidden">
        {MODES.map((m) => {
          const t = INTERVIEW_TYPES[m.kind];
          return (
            <article
              key={m.kind}
              className="rounded-tile border border-line bg-white p-6 shadow-card"
            >
              <p className="text-[13px] font-medium text-brand-800">{t.label}</p>
              <h3 className="mt-2 text-2xl font-semibold leading-snug text-ink">{m.title}</h3>
              <p className="mt-3 text-[15px] leading-7 text-ink-secondary">{m.lead}</p>
              <div className="mt-5 flex flex-col items-start gap-3 rounded-card bg-canvas p-4">
                <Scene.Provider value={{ flow: true, step: 9, speaker: -1 }}>
                  <SceneFor kind={m.kind} />
                </Scene.Provider>
              </div>
              <Link href={t.href} className="link-btn-primary mt-6 w-fit">
                {m.cta}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </article>
          );
        })}
      </div>
    </section>
  );
}
