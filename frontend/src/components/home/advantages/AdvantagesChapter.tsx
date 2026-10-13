'use client';

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Mic } from 'lucide-react';
import { useMotionValueEvent, useScroll } from 'motion/react';
import { KineticText } from '@/components/motion/KineticText';
import { NumberTicker } from '@/components/motion/NumberTicker';
import { cn } from '@/lib/cn';
import {
  SILK_GLOW,
  SILK_LIGHT,
  approach,
  drawKnot,
  drawRibbon,
  range,
  setStyle,
  spline,
} from '../silk/silk';
import { useSilkCanvas } from '../silk/useSilkCanvas';

const LEVELS = [
  { label: '入门', question: 'HTTP 和 HTTPS 有什么区别？' },
  { label: '进阶', question: 'HTTPS 握手时，证书是怎么被校验的？' },
  { label: '资深', question: '在网关层统一做 TLS 卸载，你会考虑哪些风险？' },
];

// 示例数据：前两项为占位数字，上线前请替换为真实统计；面试模式数量来自产品配置
const STATS = [
  { value: 86000, suffix: '+', label: '场模拟面试' },
  { value: 24000, suffix: '+', label: '位注册用户' },
  { value: 4, suffix: '', label: '种面试模式' },
];

/** 一块横向展开的内容。flow 时（手机端 / 减弱动态效果）按普通卡片纵向排列 */
function Panel({
  flow,
  width,
  children,
  className,
}: {
  flow: boolean;
  width: string;
  children: ReactNode;
  className?: string;
}) {
  if (flow) {
    return (
      <div
        className={cn('rounded-tile border border-line bg-white p-6 shadow-card sm:p-8', className)}
      >
        {children}
      </div>
    );
  }
  return (
    <div
      className={cn('relative flex h-full shrink-0 flex-col justify-center px-[4vw]', className)}
      style={{ width }}
    >
      {children}
    </div>
  );
}

function DepthPanel({
  flow,
  depth,
  setDepth,
}: {
  flow: boolean;
  depth: number;
  setDepth: (d: number) => void;
}) {
  return (
    <div className={cn(!flow && 'grid grid-cols-[auto_minmax(0,1fr)] items-center gap-[4vw]')}>
      <span
        aria-hidden="true"
        className={cn(
          'font-semibold leading-[0.8] tracking-[-0.07em] text-ink tabular-nums',
          flow ? 'block text-[7rem]' : 'text-[clamp(12rem,22vw,21rem)]'
        )}
      >
        <KineticText key={depth} immediate text={String(depth)} />
      </span>
      <div>
        <p className="eyebrow">追问深度</p>
        <h3 className="mt-3 text-[clamp(1.75rem,2.6vw,2.5rem)] font-semibold leading-tight text-ink">
          难度越高，问得越深
        </h3>
        <p className="mt-3 max-w-[30em] text-[15px] leading-7 text-ink-secondary">
          同一个知识点，选资深难度时，面试官会顺着你的回答连续追问三层。
        </p>
        <div
          className="mt-6 inline-flex rounded-[10px] bg-white p-1 shadow-xs ring-1 ring-line"
          role="radiogroup"
          aria-label="选择难度"
        >
          {LEVELS.map((l, i) => (
            <button
              key={l.label}
              type="button"
              role="radio"
              aria-checked={depth === i + 1}
              onClick={() => setDepth(i + 1)}
              className={cn(
                'h-9 rounded-lg px-4 text-[14px] transition-[background-color,color] duration-150',
                depth === i + 1
                  ? 'bg-ink font-medium text-white'
                  : 'text-ink-secondary hover:text-ink'
              )}
            >
              {l.label}
            </button>
          ))}
        </div>
        {/* 台阶：每深一层，丝线往下走一级；台阶上是这一层的问题 */}
        <ol
          data-h="stair"
          aria-live="polite"
          className={cn('relative', flow ? 'mt-6 space-y-2' : 'mt-24 h-[150px]')}
        >
          {LEVELS.map((l, i) => (
            <li
              key={l.label}
              className={cn(
                'text-[14px] leading-6 transition-[opacity,transform] duration-500',
                !flow && 'absolute w-[31%]',
                i < depth ? 'text-ink opacity-100' : 'pointer-events-none opacity-0 max-lg:hidden'
              )}
              style={
                flow
                  ? undefined
                  : {
                      left: `${i * 33.5}%`,
                      top: `${(i * 150) / 3 - 4}px`,
                      transform: 'translateY(-100%)',
                    }
              }
            >
              <span className="mr-1.5 text-[12px] font-medium text-brand-800">
                {i === 0 ? '提问' : `追问 ${i}`}
              </span>
              {l.question}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

/**
 * 产品优势：一条横向展开的长卷。滚动时内容向左移动，一根丝线贯穿整条长卷，
 * 在每一块里变成不同的形状——追问的台阶、一场面试的时间尺、说话的波形，最后打一个结。
 */
export default function AdvantagesChapter() {
  const trackRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [depth, setDepth] = useState(3);
  const depthRef = useRef(3);
  depthRef.current = depth;
  const [dist, setDist] = useState(0);
  const smooth = useRef({ p: 0, depth: 3 });
  const boxes = useRef<Record<string, { x: number; y: number; w: number; h: number }>>({});

  const { scrollYProgress } = useScroll({ target: trackRef, offset: ['start 64px', 'end end'] });

  // 长卷的总宽度决定这一节需要多少滚动距离
  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const measure = () => {
      setDist(Math.max(0, rail.scrollWidth - window.innerWidth));
      const rr = rail.getBoundingClientRect();
      const out: typeof boxes.current = {};
      rail.querySelectorAll<HTMLElement>('[data-h]').forEach((el) => {
        const r = el.getBoundingClientRect();
        out[el.dataset.h!] = { x: r.left - rr.left, y: r.top - rr.top, w: r.width, h: r.height };
      });
      boxes.current = out;
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(rail);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  const { invalidate } = useSilkCanvas(
    canvasRef,
    ({ ctx, w, h, time, dt, reduced }) => {
      const rail = railRef.current;
      const B = boxes.current;
      if (!rail || !B.stair || !B.ruler || !B.wave || !B.knot) return;
      const s = smooth.current;
      const tp = scrollYProgress.get();
      s.p = reduced ? tp : approach(s.p, tp, 10, dt);
      s.depth = reduced ? depthRef.current : approach(s.depth, depthRef.current, 6, dt);
      const x = -s.p * dist;
      setStyle(rail, { transform: `translate3d(${x.toFixed(1)}px, 0, 0)` });

      // 长卷坐标系下的关键点（rail 的 y 与画布一致）
      const k: number[] = [];
      const add = (px: number, py: number) => k.push(px, py);
      add(-40, h * 0.8);
      add(w * 0.25, h * 0.84);
      // 台阶：深几层就往下走几级
      const S = B.stair;
      const lv = (n: number) => S.y + (S.h / 3) * Math.min(n, s.depth);
      add(S.x - 60, S.y - 10);
      for (let n = 0; n < 3; n++) {
        add(S.x + S.w * (n / 3 + 0.02), lv(n));
        add(S.x + S.w * ((n + 1) / 3 - 0.06), lv(n));
      }
      add(S.x + S.w + 30, lv(3));
      // 时间尺：拉直
      const R = B.ruler;
      add(R.x - 40, R.y + R.h * 0.35);
      add(R.x + R.w * 0.5, R.y + R.h * 0.35);
      add(R.x + R.w + 20, R.y + R.h * 0.35);
      // 波形：像一段说话的声音
      const V = B.wave;
      const cy = V.y + V.h / 2;
      add(V.x - 40, cy);
      for (let i = 0; i <= 10; i++) {
        const env = Math.sin((i / 10) * Math.PI);
        const amp =
          V.h * 0.42 * env * (reduced ? 0.8 : 0.65 + 0.35 * Math.sin(time * 2.4 + i * 1.7));
        add(V.x + (V.w * i) / 10, cy + (i % 2 ? -amp : amp));
      }
      // 结：绕一圈再离开
      const K = B.knot;
      const ky = K.y + K.h * 0.5;
      add(K.x - 60, ky);
      add(K.x + K.w * 0.45, ky);
      add(K.x + K.w * 0.7, ky - K.h * 0.38);
      add(K.x + K.w * 0.9, ky);
      add(K.x + K.w * 0.68, ky + K.h * 0.36);
      add(K.x + K.w * 0.52, ky - 4);
      add(K.x + K.w + 120, ky - 30);
      add(rail.scrollWidth + 40, ky - 60);

      const path = spline(k, 900);
      ctx.save();
      ctx.translate(x, 0);
      drawRibbon(ctx, path, {
        palette: SILK_LIGHT,
        lanes: 14,
        width: 18,
        twist: 22,
        phase: time * 0.5,
        wobble: 1.4,
        time,
      });
      // 时间尺上的题目刻度和播放头
      const lp = range(-x, R.x - w * 0.55, R.x + R.w - w * 0.45);
      for (let q = 0; q < 8; q++) {
        const qx = R.x + R.w * (0.06 + q * 0.125);
        drawKnot(ctx, qx, R.y + R.h * 0.35, 4, lp * 8 > q + 0.3 ? '#BFEA2E' : '#FFFFFF', '#4D6A06');
      }
      const hx = R.x + R.w * lp;
      drawRibbon(
        ctx,
        spline([R.x, R.y + R.h * 0.35, (R.x + hx) / 2, R.y + R.h * 0.35, hx, R.y + R.h * 0.35], 60),
        {
          palette: SILK_GLOW,
          lanes: 6,
          width: 8,
          twist: 3,
          phase: time,
          alpha: 0.9,
        }
      );
      ctx.restore();
      return Math.abs(s.p - tp) > 0.0004 || Math.abs(s.depth - depthRef.current) > 0.002;
    },
    { ambient: true, dprCap: 1.5 }
  );
  useMotionValueEvent(scrollYProgress, 'change', invalidate);
  useEffect(() => invalidate(), [depth, invalidate]);

  const panels = (flow: boolean) => [
    <Panel
      key="intro"
      flow={flow}
      width="52vw"
      className={cn(flow && 'border-0 bg-transparent p-0 shadow-none sm:p-0')}
    >
      <p className="eyebrow">为什么在这里练</p>
      <KineticText
        as="h2"
        text="练得像真的，面的时候才从容。"
        className="mt-4 block text-[clamp(2.5rem,5.4vw,5.75rem)] font-semibold leading-[1.04] tracking-[-0.04em] text-ink"
      />
      <p className="mt-6 max-w-[26em] text-base leading-7 text-ink-secondary">
        几个具体的设计，让每一次练习都更接近真实面试。
      </p>
    </Panel>,
    <Panel key="depth" flow={flow} width="72vw">
      <DepthPanel flow={flow} depth={depth} setDepth={setDepth} />
    </Panel>,
    <Panel key="session" flow={flow} width="60vw">
      <p
        aria-hidden="true"
        className={cn(
          'font-semibold leading-none tracking-[-0.05em] text-ink tabular-nums',
          flow ? 'text-[4.5rem]' : 'text-[clamp(6rem,11vw,10.5rem)]'
        )}
      >
        5–10
        <span className="ml-3 text-[0.26em] font-medium tracking-normal text-ink-secondary">
          道题
        </span>
      </p>
      <h3 className="mt-6 text-[clamp(1.75rem,2.6vw,2.5rem)] font-semibold leading-tight text-ink">
        一场面试，三十分钟左右
      </h3>
      <p className="mt-3 max-w-[30em] text-[15px] leading-7 text-ink-secondary">
        每场 5–10 道题，一般 30 分钟左右。中途可以随时结束，系统会按已作答的题目生成报告。
      </p>
      <div
        data-h="ruler"
        aria-hidden="true"
        className={cn('relative mt-10 h-16 w-full max-w-[640px]', flow && 'hidden')}
      >
        <div className="absolute inset-x-0 bottom-0 flex justify-between text-[12px] tabular-nums text-ink-muted">
          {['0', '10', '20', '30 分钟'].map((t) => (
            <span key={t}>{t}</span>
          ))}
        </div>
      </div>
    </Panel>,
    <Panel key="voice" flow={flow} width="60vw">
      <KineticText
        as="p"
        text="开口说，也能答。"
        className={cn(
          'block font-semibold leading-[1.02] tracking-[-0.04em] text-ink',
          flow ? 'text-[3rem]' : 'text-[clamp(4rem,7.4vw,7.5rem)]'
        )}
      />
      <p className="mt-6 max-w-[30em] text-[15px] leading-7 text-ink-secondary">
        点一下麦克风录音，识别结果自动填进输入框，你可以改完再发送。
      </p>
      <div className="mt-8 flex max-w-[560px] items-center gap-4">
        <span
          className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-brand-600 shadow-btn"
          aria-hidden="true"
        >
          <Mic className="h-5 w-5 text-ink" strokeWidth={1.75} />
        </span>
        <p className="rounded-xl border border-line bg-white px-4 py-3 text-[15px] leading-6 text-ink shadow-xs">
          “我们用的是先更新数据库、再删缓存的方案……”
          <span className="ml-1 text-ink-muted">识别中</span>
        </p>
      </div>
      <div
        data-h="wave"
        aria-hidden="true"
        className={cn('mt-6 h-24 w-full max-w-[560px]', flow && 'hidden')}
      />
    </Panel>,
    <Panel key="numbers" flow={flow} width="66vw">
      <div className={cn('grid gap-x-12 gap-y-8', !flow && 'grid-cols-[auto_auto] items-end')}>
        <div className={cn(!flow && 'col-span-2')}>
          <p
            className={cn(
              'font-semibold leading-none tracking-[-0.05em] text-ink',
              flow ? 'text-[3.5rem]' : 'text-[clamp(5rem,10vw,9.5rem)]'
            )}
          >
            <NumberTicker value={STATS[0].value} />
            <span className="text-brand-800">{STATS[0].suffix}</span>
          </p>
          <p className="mt-3 text-[15px] text-ink-secondary">{STATS[0].label}</p>
        </div>
        {STATS.slice(1).map((st) => (
          <div key={st.label}>
            <p className="text-[clamp(2.5rem,4vw,3.75rem)] font-semibold leading-none tracking-[-0.04em] text-ink">
              <NumberTicker value={st.value} />
              <span className="text-brand-800">{st.suffix}</span>
            </p>
            <p className="mt-2 text-[14px] text-ink-secondary">{st.label}</p>
          </div>
        ))}
      </div>
      <div
        data-h="knot"
        aria-hidden="true"
        className={cn('mt-6 h-28 w-[min(420px,80%)]', flow && 'hidden')}
      />
    </Panel>,
  ];

  return (
    <section id="advantages" aria-label="产品优势" className="relative">
      <div
        ref={trackRef}
        className="relative hidden lg:motion-safe:block"
        style={{ height: `calc(${dist}px + 100vh - 4rem)` }}
      >
        <div className="sticky top-16 h-[calc(100vh-4rem)] overflow-hidden">
          <canvas
            ref={canvasRef}
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 h-full w-full"
          />
          <div ref={railRef} className="relative flex h-full w-max will-change-transform">
            {panels(false)}
          </div>
        </div>
      </div>
      <div className="page space-y-4 py-24 lg:motion-safe:hidden">{panels(true)}</div>
    </section>
  );
}
