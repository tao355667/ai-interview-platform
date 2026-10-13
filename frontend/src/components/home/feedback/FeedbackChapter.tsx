'use client';

import { useRef, useState } from 'react';
import type { MotionValue } from 'motion/react';
import { useMotionValueEvent, useScroll } from 'motion/react';
import { KineticText } from '@/components/motion/KineticText';
import { cn } from '@/lib/cn';
import {
  SILK_GLOW,
  SILK_LIGHT,
  TAU,
  approach,
  drawKnot,
  drawRibbon,
  easeInOut,
  easeOut,
  hash,
  lerp,
  range,
  setStyle,
  spline,
} from '../silk/silk';
import { useSilkCanvas } from '../silk/useSilkCanvas';

// 示例数据：以下分数、点评和语音都是演示用的虚构数据，不代表真实用户
const DIMS = [
  { name: '技术深度', a: 58, b: 84, note: '能讲清原理，可以再补充边界情况' },
  { name: '项目理解', a: 66, b: 88, note: '量化了峰值 QPS 和瓶颈，说服力强' },
  { name: '表达结构', a: 62, b: 86, note: '先给结论再展开，结构清晰' },
  { name: '追问应对', a: 54, b: 82, note: '被追问时能补充新的信息，而不是重复' },
  { name: '沟通表达', a: 70, b: 90, note: '语速平稳，长停顿明显减少' },
];
const SCORE = { a: 62, b: 86 };
const HISTORY = [62, 71, 68, 77, 80, 86];
const PINS = [
  { at: 0.08, tone: 'good', text: '先说结论：先更新数据库，再删缓存' },
  { at: 0.34, tone: 'good', text: '用订单系统举例，有说服力' },
  { at: 0.56, tone: 'warn', text: '这里停顿了 4 秒' },
  { at: 0.8, tone: 'tip', text: '可以补充：延迟双删适用于什么场景' },
] as const;

/** 滚动驱动的状态 + 用户的选择，在三幅图之间共享 */
interface Shared {
  /** 0 = 第 1 场，1 = 第 6 场 */
  m: number;
  /** 用户点了切换按钮之后，就不再跟随滚动 */
  pick: 0 | 1 | null;
  hover: number;
}

/* ---------------------------------- 编织雷达 ---------------------------------- */

function Radar({
  progress,
  shared,
}: {
  progress: MotionValue<number>;
  shared: React.MutableRefObject<Shared>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodeRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const scoreRef = useRef<HTMLSpanElement>(null);
  const deltaRef = useRef<HTMLSpanElement>(null);
  const barRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const valRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const smooth = useRef({ q: 0 });
  const [hover, setHover] = useState(-1);
  const [shownPick, setShownPick] = useState<0 | 1>(0);
  const [picked, setPicked] = useState<0 | 1 | null>(null);
  const shownRef = useRef<0 | 1>(0);

  const { invalidate } = useSilkCanvas(
    canvasRef,
    ({ ctx, w, h, time, dt, reduced }) => {
      const S = shared.current;
      const s = smooth.current;
      const tq = progress.get();
      s.q = reduced ? tq : approach(s.q, tq, 10, dt);
      const weave = reduced ? 1 : easeOut(range(s.q, 0.1, 0.36));
      const target = S.pick ?? easeInOut(range(s.q, 0.36, 0.52));
      S.m = reduced ? target : approach(S.m, target, S.pick === null ? 14 : 5, dt);
      const m = S.m;

      const cx = w / 2;
      const cy = h / 2;
      const R = Math.min(w, h) * 0.36;
      const ang = (i: number) => -Math.PI / 2 + (i * TAU) / DIMS.length;
      const pt = (i: number, v: number): [number, number] => [
        cx + Math.cos(ang(i)) * R * (v / 100),
        cy + Math.sin(ang(i)) * R * (v / 100),
      ];

      // 刻度环
      ctx.lineWidth = 1;
      for (let k = 1; k <= 5; k++) {
        ctx.beginPath();
        for (let i = 0; i <= DIMS.length; i++) {
          const [x, y] = pt(i % DIMS.length, k * 20);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = `rgba(14,26,21,${k === 5 ? 0.1 : 0.05})`;
        ctx.stroke();
      }

      // 辐条：每个维度一束丝线，从中心织出去
      DIMS.forEach((_, i) => {
        const [x, y] = pt(i, 100);
        const path = spline(
          [cx, cy, lerp(cx, x, 0.5) + Math.sin(time * 0.6 + i) * 3, lerp(cy, y, 0.5), x, y],
          40
        );
        drawRibbon(ctx, path, {
          palette: S.hover === i ? SILK_GLOW : SILK_LIGHT,
          lanes: 6,
          width: 5,
          twist: 1,
          phase: time * 0.5 + i,
          to: weave,
          taper: 0.3,
          alpha: S.hover === i ? 0.9 : 0.35,
          time,
        });
      });

      // 第 1 场的轮廓（虚线基准）
      const ghost = Math.min(1, m * 3) * weave;
      if (ghost > 0.01) {
        ctx.save();
        ctx.setLineDash([3, 4]);
        ctx.lineWidth = 1.25;
        ctx.strokeStyle = `rgba(77,106,6,${(0.55 * ghost).toFixed(3)})`;
        ctx.beginPath();
        DIMS.forEach((d, i) => {
          const [x, y] = pt(i, d.a);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
      }

      // 当前这场：用丝线织出来的多边形
      const pts = DIMS.map((d, i) => pt(i, lerp(d.a, d.b, m)));
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
      ctx.closePath();
      ctx.fillStyle = `rgba(191,234,46,${(0.2 * weave).toFixed(3)})`;
      ctx.fill();
      pts.forEach((a, i) => {
        const b = pts[(i + 1) % pts.length];
        const e = easeOut(range(weave, 0.25 + i * 0.1, 0.55 + i * 0.1));
        if (e <= 0) return;
        const mx = (a[0] + b[0]) / 2;
        const my = (a[1] + b[1]) / 2;
        // 边微微向外鼓，像被拉紧的丝
        const ox = (mx - cx) * 0.05;
        const oy = (my - cy) * 0.05;
        const path = spline([a[0], a[1], mx + ox, my + oy, b[0], b[1]], 50);
        drawRibbon(ctx, path, {
          palette: SILK_LIGHT,
          lanes: 12,
          width: 11,
          twist: 1.5,
          phase: time * 0.7 + i * 1.3,
          to: e,
          taper: 0.12,
          wobble: 0.8,
          time,
        });
      });

      // DOM：节点按钮、分数、维度条
      pts.forEach(([x, y], i) => {
        const el = nodeRefs.current[i];
        if (!el) return;
        setStyle(el, {
          transform: `translate3d(${(x - 9).toFixed(1)}px, ${(y - 9).toFixed(1)}px, 0) scale(${weave > 0.6 ? 1 : 0})`,
        });
      });
      const score = Math.round(lerp(SCORE.a, SCORE.b, m));
      if (scoreRef.current && scoreRef.current.textContent !== String(score)) {
        scoreRef.current.textContent = String(score);
      }
      if (deltaRef.current) {
        const d = `+${Math.round((SCORE.b - SCORE.a) * m)}`;
        if (deltaRef.current.textContent !== d) deltaRef.current.textContent = d;
      }
      DIMS.forEach((d, i) => {
        const v = lerp(d.a, d.b, m);
        const bar = barRefs.current[i];
        if (bar) setStyle(bar, { transform: `scaleX(${((v / 100) * weave).toFixed(3)})` });
        const val = valRefs.current[i];
        const t = String(Math.round(v));
        if (val && val.textContent !== t) val.textContent = t;
      });
      const shown: 0 | 1 = m > 0.5 ? 1 : 0;
      if (shown !== shownRef.current) {
        shownRef.current = shown;
        setShownPick(shown);
      }
      return Math.abs(s.q - tq) > 0.0005 || Math.abs(S.m - target) > 0.001;
    },
    { ambient: true }
  );
  useMotionValueEvent(progress, 'change', invalidate);

  const focus = (i: number) => {
    shared.current.hover = i;
    setHover(i);
    invalidate();
  };
  const blur = () => focus(-1);
  const sel = picked ?? shownPick;

  return (
    <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-16">
      <figure
        className="relative mx-auto aspect-square w-full max-w-[540px]"
        aria-label="能力雷达图（示例数据）"
      >
        <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 h-full w-full" />
        {DIMS.map((d, i) => {
          const a = -Math.PI / 2 + (i * TAU) / DIMS.length;
          return (
            <span
              key={d.name}
              aria-hidden="true"
              className={cn(
                'absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-[13px] transition-colors',
                hover === i ? 'font-medium text-ink' : 'text-ink-secondary'
              )}
              style={{ left: `${50 + Math.cos(a) * 44}%`, top: `${50 + Math.sin(a) * 44}%` }}
            >
              {d.name}
            </span>
          );
        })}
        {DIMS.map((d, i) => (
          <button
            key={d.name}
            type="button"
            ref={(el) => (nodeRefs.current[i] = el)}
            onMouseEnter={() => focus(i)}
            onMouseLeave={blur}
            onFocus={() => focus(i)}
            onBlur={blur}
            aria-label={`${d.name}：第 1 场 ${d.a} 分，第 6 场 ${d.b} 分。${d.note}`}
            className="absolute left-0 top-0 h-[18px] w-[18px] rounded-full border-2 border-brand-800 bg-brand-600 shadow-[0_0_0_5px_rgba(191,234,46,0.25)] transition-[box-shadow] duration-200 hover:shadow-[0_0_0_8px_rgba(191,234,46,0.35)]"
            style={{ transform: 'scale(0)' }}
          />
        ))}
        {hover >= 0 && (
          <div
            role="tooltip"
            className="pointer-events-none absolute bottom-0 left-1/2 w-[260px] -translate-x-1/2 animate-fade-in rounded-xl border border-line bg-white/95 p-3.5 shadow-pop backdrop-blur"
          >
            <p className="flex items-baseline justify-between text-[14px] font-medium text-ink">
              {DIMS[hover].name}
              <span className="tabular-nums text-[13px] font-normal text-ink-secondary">
                {DIMS[hover].a} →{' '}
                <span className="font-medium text-brand-800">{DIMS[hover].b}</span>
              </span>
            </p>
            <p className="mt-1 text-[13px] leading-5 text-ink-secondary">{DIMS[hover].note}</p>
          </div>
        )}
      </figure>

      <div>
        <div className="flex items-end justify-between gap-6">
          <div>
            <p className="text-[13px] text-ink-secondary">综合得分</p>
            <p className="mt-1 flex items-baseline gap-3">
              <span
                ref={scoreRef}
                className="text-[clamp(4rem,8vw,6.5rem)] font-semibold leading-none tracking-[-0.04em] tabular-nums text-ink"
              >
                {SCORE.a}
              </span>
              <span className="whitespace-nowrap rounded-full bg-brand-600 px-2.5 py-0.5 text-[13px] font-medium tabular-nums text-ink">
                较第 1 场 <span ref={deltaRef}>+0</span>
              </span>
            </p>
          </div>
          <div
            role="radiogroup"
            aria-label="对比场次"
            className="inline-flex shrink-0 rounded-[10px] bg-white p-1 shadow-xs ring-1 ring-line"
          >
            {(['第 1 场', '第 6 场'] as const).map((label, i) => (
              <button
                key={label}
                type="button"
                role="radio"
                aria-checked={sel === i}
                onClick={() => {
                  shared.current.pick = i as 0 | 1;
                  setPicked(i as 0 | 1);
                  invalidate();
                }}
                className={cn(
                  'h-8 rounded-lg px-3 text-[13px] transition-[background-color,color] duration-150',
                  sel === i ? 'bg-ink font-medium text-white' : 'text-ink-secondary hover:text-ink'
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <ul className="mt-8 space-y-3.5" aria-label="各维度得分（示例数据）">
          {DIMS.map((d, i) => (
            <li
              key={d.name}
              onMouseEnter={() => focus(i)}
              onMouseLeave={blur}
              className={cn('rounded-lg px-2 py-1 transition-colors', hover === i && 'bg-white')}
            >
              <div className="flex items-baseline justify-between text-[14px]">
                <span className={hover === i ? 'text-ink' : 'text-ink-secondary'}>{d.name}</span>
                <span className="tabular-nums text-ink">
                  <span ref={(el) => (valRefs.current[i] = el)}>{d.a}</span>
                  <span className="sr-only">
                    分（第 1 场 {d.a}，第 6 场 {d.b}）
                  </span>
                </span>
              </div>
              <div className="relative mt-1.5 h-1.5 overflow-hidden rounded-full bg-line/70">
                <span
                  aria-hidden="true"
                  className="absolute inset-y-0 left-0 border-r-2 border-brand-800/60"
                  style={{ width: `${d.a}%` }}
                />
                <span
                  ref={(el) => (barRefs.current[i] = el)}
                  className="absolute inset-0 origin-left rounded-full bg-brand-600"
                  style={{ transform: 'scaleX(0)' }}
                />
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-5 text-[13px] text-ink-muted">
          竖线是第 1 场的位置。悬停或聚焦雷达上的节点，可以看到这一项的点评。
        </p>
      </div>
    </div>
  );
}

/* ---------------------------------- 语音波形 ---------------------------------- */

/** 一段约 84 秒的回答：几段连续的语句，中间有一次 4 秒的停顿 */
function amplitude(t: number) {
  const phrases = [
    [0.02, 0.2],
    [0.23, 0.52],
    [0.6, 0.76],
    [0.79, 0.97],
  ];
  let env = 0;
  for (const [a, b] of phrases) {
    const k = Math.min(1, (t - a) * 40, (b - t) * 40);
    if (k > 0) env = Math.max(env, k);
  }
  const syl = 0.45 + 0.55 * Math.abs(Math.sin(t * 160 + Math.sin(t * 37) * 2));
  return env * syl * (0.55 + 0.45 * hash(Math.floor(t * 220)));
}

function Waveform({ progress }: { progress: MotionValue<number> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pinRefs = useRef<(HTMLLIElement | null)[]>([]);
  const timeRef = useRef<HTMLSpanElement>(null);
  const smooth = useRef({ q: 0 });

  // 波形是静态的：按画布尺寸缓存成一条 Path2D，滚动时只做裁剪和两次描边
  const wave = useRef<{ w: number; h: number; path: Path2D } | null>(null);
  const { invalidate } = useSilkCanvas(canvasRef, ({ ctx, w, h, dt, reduced }) => {
    const s = smooth.current;
    const tq = progress.get();
    s.q = reduced ? tq : approach(s.q, tq, 10, dt);
    const head = reduced ? 1 : range(s.q, 0.36, 0.7);
    const mid = h / 2;
    const step = 4;
    if (!wave.current || wave.current.w !== w || wave.current.h !== h) {
      const path = new Path2D();
      const n = Math.floor(w / step);
      for (let i = 0; i < n; i++) {
        const t = i / n;
        const a = amplitude(t) * (h * 0.42);
        const x = i * step + 1;
        for (let k = -1; k <= 1; k++) {
          const hk = a * (1 - Math.abs(k) * 0.25) + 1;
          path.moveTo(x + k, mid - hk);
          path.lineTo(x + k, mid + hk);
        }
      }
      wave.current = { w, h, path };
    }
    // 播过的部分是深橄榄，没播的是浅灰：用裁剪切一刀，只描边两次
    ctx.lineWidth = 1;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, Math.max(0, head * w), h);
    ctx.clip();
    ctx.strokeStyle = 'rgba(77,106,6,0.85)';
    ctx.stroke(wave.current.path);
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.rect(head * w, 0, w - head * w, h);
    ctx.clip();
    ctx.strokeStyle = 'rgba(14,26,21,0.14)';
    ctx.stroke(wave.current.path);
    ctx.restore();
    // 停顿处用虚线标出长度
    const p0 = 0.52 * w;
    const p1 = 0.6 * w;
    ctx.save();
    ctx.setLineDash([2, 3]);
    ctx.strokeStyle = 'rgba(183,121,31,0.6)';
    ctx.beginPath();
    ctx.moveTo(p0, mid);
    ctx.lineTo(p1, mid);
    ctx.stroke();
    ctx.restore();
    // 播放头
    const hx = head * w;
    ctx.fillStyle = 'rgba(191,234,46,0.18)';
    ctx.fillRect(Math.max(0, hx - 60), 0, Math.min(60, hx), h);
    ctx.strokeStyle = '#4D6A06';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(hx, 4);
    ctx.lineTo(hx, h - 4);
    ctx.stroke();
    drawKnot(ctx, hx, 4, 4, '#BFEA2E', '#4D6A06');

    PINS.forEach((pin, i) => {
      const el = pinRefs.current[i];
      if (!el) return;
      const on = head >= pin.at ? 1 : 0;
      el.dataset.on = String(on === 1);
    });
    if (timeRef.current) {
      const sec = Math.round(head * 84);
      const label = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')} / 1:24`;
      if (timeRef.current.textContent !== label) timeRef.current.textContent = label;
    }
    return Math.abs(s.q - tq) > 0.0005;
  });
  useMotionValueEvent(progress, 'change', invalidate);

  return (
    <figure className="rounded-tile border border-line bg-white p-6 shadow-card sm:p-7">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[15px] font-medium text-ink">第 3 题 · 你的语音回答</span>
        <span ref={timeRef} className="text-[13px] tabular-nums text-ink-muted">
          0:00 / 1:24
        </span>
      </figcaption>
      <p className="mt-1 text-[13px] text-ink-secondary">订单缓存是怎么和数据库保持一致的？</p>
      {/* 点评钉在它说的那一刻上：交错两排，竖线落到波形中线 */}
      <div className="relative mt-6 sm:mt-32">
        <canvas ref={canvasRef} aria-hidden="true" className="block h-[96px] w-full" />
        <ol aria-label="这段回答的点评（示例）" className="mt-4 space-y-2 sm:mt-0 sm:space-y-0">
          {PINS.map((pin, i) => (
            <li
              key={pin.text}
              ref={(el) => (pinRefs.current[i] = el)}
              data-on="false"
              className={cn(
                'group transition-opacity duration-300 data-[on=false]:opacity-35 sm:absolute sm:w-max',
                i % 2 === 0 ? 'sm:bottom-1/2 sm:pb-[100px]' : 'sm:bottom-1/2 sm:pb-[52px]',
                pin.at < 0.15
                  ? 'sm:-translate-x-3'
                  : pin.at > 0.85
                    ? 'sm:-translate-x-full'
                    : 'sm:-translate-x-1/2'
              )}
              style={{ left: `${pin.at * 100}%` }}
            >
              <span
                className={cn(
                  'relative z-[1] block max-w-[220px] rounded-lg border px-2.5 py-1.5 text-[12px] leading-[18px] shadow-xs transition-transform duration-300 group-data-[on=false]:translate-y-1',
                  pin.tone === 'good' && 'border-success/30 bg-success-soft text-success',
                  pin.tone === 'warn' && 'border-warning/30 bg-warning-soft text-warning',
                  pin.tone === 'tip' && 'border-brand-700/40 bg-brand-50 text-brand-800'
                )}
              >
                {pin.text}
              </span>
              <span
                aria-hidden="true"
                className={cn(
                  'absolute bottom-0 hidden w-px bg-ink/20 sm:block',
                  i % 2 === 0 ? 'top-[calc(100%-100px)]' : 'top-[calc(100%-52px)]',
                  pin.at < 0.15 ? 'left-3' : pin.at > 0.85 ? 'right-0' : 'left-1/2'
                )}
              />
            </li>
          ))}
        </ol>
      </div>
    </figure>
  );
}

/* ---------------------------------- 成长曲线 ---------------------------------- */

function Growth({ progress }: { progress: MotionValue<number> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const smooth = useRef({ q: 0 });

  const { invalidate } = useSilkCanvas(
    canvasRef,
    ({ ctx, w, h, time, dt, reduced }) => {
      const s = smooth.current;
      const tq = progress.get();
      s.q = reduced ? tq : approach(s.q, tq, 10, dt);
      const grow = reduced ? 1 : easeOut(range(s.q, 0.42, 0.66));
      const padX = 18;
      const padY = 26;
      const X = (i: number) => padX + (i / (HISTORY.length - 1)) * (w - padX * 2);
      const Y = (v: number) => h - padY - ((v - 55) / 35) * (h - padY * 2);
      ctx.strokeStyle = 'rgba(14,26,21,0.06)';
      ctx.lineWidth = 1;
      [60, 70, 80, 90].forEach((v) => {
        ctx.beginPath();
        ctx.moveTo(padX, Y(v));
        ctx.lineTo(w - padX, Y(v));
        ctx.stroke();
      });
      const keys: number[] = [];
      HISTORY.forEach((v, i) => keys.push(X(i), Y(v)));
      const path = spline(keys, 160);
      drawRibbon(ctx, path, {
        palette: SILK_LIGHT,
        lanes: 12,
        width: 12,
        twist: 2.2,
        phase: time * 0.6,
        to: grow,
        taper: 0.06,
        taperStart: false,
        wobble: 0.6,
        time,
      });
      HISTORY.forEach((v, i) => {
        const at = i / (HISTORY.length - 1);
        if (grow < at - 0.001) return;
        const last = i === HISTORY.length - 1;
        drawKnot(ctx, X(i), Y(v), last ? 5 : 3.5, last ? '#BFEA2E' : '#FFFFFF', '#4D6A06');
        ctx.fillStyle = last ? '#0E1A15' : '#56635D';
        ctx.font = `${last ? 600 : 400} 12px var(--font-sans), sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(String(v), X(i), Y(v) - 12);
      });
      return Math.abs(s.q - tq) > 0.0005;
    },
    { ambient: true }
  );
  useMotionValueEvent(progress, 'change', invalidate);

  return (
    <figure className="flex flex-col rounded-tile border border-line bg-white p-6 shadow-card sm:p-7">
      <figcaption className="text-[15px] font-medium text-ink">最近 6 场的综合得分</figcaption>
      <p className="sr-only">从第 1 场的 62 分，提升到第 6 场的 86 分（示例数据）。</p>
      <canvas ref={canvasRef} aria-hidden="true" className="mt-4 block h-[150px] w-full flex-1" />
      <div className="mt-2 flex justify-between text-[12px] text-ink-muted">
        <span>第 1 场</span>
        <span>第 6 场</span>
      </div>
    </figure>
  );
}

/* ---------------------------------- 章节 ---------------------------------- */

/**
 * 面试反馈：数据艺术。滚动时雷达从中心织出来，多边形从第 1 场长成第 6 场；
 * 语音波形的播放头随滚动前进，经过的位置亮起对应的点评；成长曲线随之生长。
 */
export default function FeedbackChapter() {
  const sectionRef = useRef<HTMLElement>(null);
  const shared = useRef<Shared>({ m: 0, pick: null, hover: -1 });
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ['start end', 'end start'] });

  return (
    <section
      ref={sectionRef}
      id="feedback"
      aria-label="面试反馈"
      className="page relative scroll-mt-16 py-28 lg:py-36"
    >
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="eyebrow">面试反馈</p>
          <KineticText
            as="h2"
            text="答得怎么样，画出来给你看。"
            className="mt-4 block text-[clamp(2.25rem,4.6vw,4rem)] font-semibold leading-[1.12] tracking-[-0.03em] text-ink"
          />
        </div>
        <p className="max-w-[24em] text-base leading-7 text-ink-secondary">
          每场面试结束后生成评估报告：综合得分、各维度表现，以及每道题的点评。
          <span className="mt-2 block text-[13px] text-ink-muted">本节图表均为示例数据。</span>
        </p>
      </div>

      <div className="mt-16">
        <Radar progress={scrollYProgress} shared={shared} />
      </div>

      <div className="mt-16 grid gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <Waveform progress={scrollYProgress} />
        <Growth progress={scrollYProgress} />
      </div>
    </section>
  );
}
