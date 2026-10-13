'use client';

import Link from 'next/link';
import { useId, useRef, useState } from 'react';
import { ArrowRight, Plus } from 'lucide-react';
import { useMotionValueEvent, useScroll } from 'motion/react';
import { KineticText } from '@/components/motion/KineticText';
import { cn } from '@/lib/cn';
import {
  SILK_GLOW,
  SILK_LIGHT,
  approach,
  easeInOut,
  hash,
  mix,
  range,
  ring,
  drawRibbon,
} from './silk/silk';
import { useSilkCanvas } from './silk/useSilkCanvas';
import type { SilkFrame } from './silk/useSilkCanvas';

const FAQ = [
  {
    q: '和直接用通用 AI 聊天工具练面试有什么区别？',
    a: '面策针对面试场景做了定制：有完整的面试流程、会根据回答追问，并且有统一的评估维度和报告，更接近真实面试官的要求。',
  },
  {
    q: '需要先上传简历吗？',
    a: '社招、校招和多人面试会围绕简历出题，需要先在个人中心上传 PDF 简历；专项面试只需选择技术栈，不需要简历。',
  },
  {
    q: '一场面试大概多久？',
    a: '每场 5–10 道题，一般 30 分钟左右。中途可以随时结束，系统会根据已作答的题目生成报告。',
  },
  {
    q: '支持语音作答吗？',
    a: '支持。面试中点击麦克风录音，识别结果会自动填入输入框，你可以修改后再发送。',
  },
];

function Faq() {
  const [open, setOpen] = useState(0);
  const id = useId();
  return (
    <section
      aria-label="常见问题"
      className="page grid gap-12 py-24 lg:grid-cols-[minmax(0,380px)_1fr] lg:py-32"
    >
      <div>
        <p className="eyebrow">常见问题</p>
        <KineticText
          as="h2"
          text="开始之前。"
          className="mt-4 block text-[clamp(2.25rem,4vw,3.5rem)] font-semibold leading-[1.1] tracking-[-0.03em] text-ink"
        />
        <p className="mt-4 text-base leading-7 text-ink-secondary">
          还有其他问题，可以查看导航栏里的使用手册。
        </p>
      </div>
      <ul className="border-t border-line">
        {FAQ.map((f, i) => {
          const on = open === i;
          return (
            <li key={f.q} className="relative border-b border-line">
              {/* 展开的那一项，左侧有一根线画下来 */}
              <span
                aria-hidden="true"
                className={cn(
                  'absolute -left-5 top-5 bottom-5 w-[2px] origin-top rounded-full bg-brand-700 transition-transform duration-500 ease-out',
                  on ? 'scale-y-100' : 'scale-y-0'
                )}
              />
              <h3>
                <button
                  type="button"
                  id={`${id}-q${i}`}
                  aria-expanded={on}
                  aria-controls={`${id}-a${i}`}
                  onClick={() => setOpen(on ? -1 : i)}
                  className="group flex w-full items-center justify-between gap-6 py-6 text-left text-[17px] font-medium text-ink"
                >
                  {f.q}
                  <span
                    className={cn(
                      'grid h-8 w-8 shrink-0 place-items-center rounded-full border transition-[transform,background-color,border-color] duration-300',
                      on
                        ? 'rotate-45 border-brand-700 bg-brand-600'
                        : 'border-line-strong bg-white group-hover:border-ink/30'
                    )}
                  >
                    <Plus className="h-4 w-4 text-ink" aria-hidden="true" />
                  </span>
                </button>
              </h3>
              <div
                id={`${id}-a${i}`}
                role="region"
                aria-labelledby={`${id}-q${i}`}
                className={cn(
                  'grid transition-[grid-template-rows,opacity] duration-500 ease-out',
                  on ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                )}
              >
                <div className="overflow-hidden" aria-hidden={!on}>
                  <p className="max-w-2xl pb-6 text-[15px] leading-7 text-ink-secondary">{f.a}</p>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ---------------------------------- 终章 ---------------------------------- */

const N = 220;
const RINGS = [
  { rx: 0.48, ry: 0.17, rot: -0.14, lanes: 16, width: 22 },
  { rx: 0.42, ry: 0.23, rot: 0.18, lanes: 12, width: 16 },
  { rx: 0.54, ry: 0.12, rot: 0.04, lanes: 14, width: 18 },
];

/**
 * 终章：散落在页面上的丝线重新汇聚，绕成首屏那三道轨道环——这一次，环的中心是你自己的行动。
 * 后面一层画在文字后面，前面一层画在文字前面，环真的「绕」着标题。
 */
function Finale() {
  const sectionRef = useRef<HTMLElement>(null);
  const backRef = useRef<HTMLCanvasElement>(null);
  const frontRef = useRef<HTMLCanvasElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const smooth = useRef({ q: 0, back: 0, front: 0 });
  const bufs = useRef(
    RINGS.map(() => ({
      ring: new Float32Array(N * 2),
      depth: new Float32Array(N),
      side: new Float32Array(N),
      loose: new Float32Array(N * 2),
      out: new Float32Array(N * 2),
    }))
  );
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ['start end', 'end end'] });

  const paint =
    (side: -1 | 1, key: 'back' | 'front') =>
    ({ ctx, w, h, time, dt, reduced }: SilkFrame) => {
      const s = smooth.current;
      const tq = scrollYProgress.get();
      s[key] = reduced ? tq : approach(s[key], tq, 8, dt);
      const c = reduced ? 1 : easeInOut(range(s[key], 0.25, 0.85));
      // 窄屏上环压不住大标题，全部画在文字后面，并放大到超出屏幕两侧
      const narrow = w < 768;
      if (narrow && side < 0) return false;
      const cx = w / 2;
      const cy = h * 0.47;
      const base = narrow ? w * 1.7 : Math.min(w * 0.95, 1240);
      RINGS.forEach((r, k) => {
        const b = bufs.current[k];
        // 汇聚前：一根根松散的线横着飘过页面
        for (let i = 0; i < N; i++) {
          const t = i / (N - 1);
          const y0 = h * (0.18 + 0.3 * k) + Math.sin(t * 5 + k * 2 + time * 0.3) * h * 0.08;
          b.loose[i * 2] = -w * 0.15 + t * w * 1.3;
          b.loose[i * 2 + 1] = y0 + (hash(k + 3) - 0.5) * 40;
        }
        ring(
          cx,
          cy,
          base * r.rx * (0.9 + 0.1 * c),
          base * r.ry,
          r.rot + Math.sin(time * 0.15 + k) * 0.03,
          time * (0.05 + k * 0.02) + k * 2,
          N,
          b.ring,
          b.depth
        );
        mix(b.loose, b.ring, c, b.out);
        // 还没汇聚时不分前后，都画在后面一层
        for (let i = 0; i < N; i++) b.side[i] = c > 0.5 ? b.depth[i] : 1;
        const opts = {
          lanes: r.lanes,
          width: r.width * (0.6 + 0.4 * c),
          twist: 3 + k,
          phase: time * 0.4 + k,
          depth: b.side,
          side: narrow ? (0 as const) : side,
          alpha: narrow ? 0.55 : side < 0 ? 0.9 : 1,
          wobble: 1.2,
          time,
        };
        drawRibbon(ctx, b.out, {
          ...opts,
          palette: k === 1 ? SILK_GLOW : SILK_LIGHT,
          alpha: (k === 1 ? 0.55 : 1) * opts.alpha,
        });
      });
      return Math.abs(s[key] - tq) > 0.0005;
    };

  const back = useSilkCanvas(backRef, paint(1, 'back'), { ambient: true, dprCap: 1.5 });
  const front = useSilkCanvas(frontRef, paint(-1, 'front'), { ambient: true, dprCap: 1.5 });
  useMotionValueEvent(scrollYProgress, 'change', () => {
    back.invalidate();
    front.invalidate();
  });

  return (
    <section
      ref={sectionRef}
      aria-label="开始练习"
      className="relative isolate flex min-h-[86vh] items-center overflow-hidden py-28"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-[47%] -z-10 h-[520px] w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(191,234,46,0.28),transparent)]"
      />
      <canvas
        ref={backRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-[5] h-full w-full"
      />
      <div ref={titleRef} className="page relative text-center">
        <p className="eyebrow">准备好了就开始</p>
        <KineticText
          as="h2"
          text="下一场面试，从容一点。"
          stagger={40}
          className="mx-auto mt-5 block text-[clamp(2.75rem,7vw,6.75rem)] font-semibold leading-[1.04] tracking-[-0.045em] text-ink"
        />
        <p className="mx-auto mt-7 max-w-xl text-[17px] leading-8 text-ink-secondary">
          选一种面试模式，十分钟后你就会知道自己最该补哪一块。
        </p>
        <div className="relative z-10 mt-10 flex flex-wrap justify-center gap-3">
          <Link href="/interview/social" className="link-btn-primary link-btn-lg">
            开始模拟面试
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          <Link href="/resume" className="link-btn-default link-btn-lg">
            用简历押题
          </Link>
        </div>
      </div>
      <canvas
        ref={frontRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-[1] h-full w-full opacity-70"
      />
    </section>
  );
}

export default function FaqCta() {
  return (
    <>
      <Faq />
      <Finale />
    </>
  );
}
