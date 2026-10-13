'use client';

import { useRef } from 'react';
import { useMotionValueEvent, useScroll } from 'motion/react';
import { KineticText } from '@/components/motion/KineticText';
import { cn } from '@/lib/cn';
import {
  SILK_LIGHT,
  approach,
  clamp01,
  drawRibbon,
  easeOut,
  range,
  setStyle,
  spline,
} from './silk/silk';
import { useSilkCanvas } from './silk/useSilkCanvas';

// 示例数据：评价内容为占位文案，上线前请替换为真实用户反馈
const FEATURED = [
  {
    before: '非科班出身，基础一直比较薄弱。简历押题',
    mark: '押中了真实面试里的大部分问题',
    after: '，也帮我把 Spring IOC 到 AOP 的知识串了起来。',
    user: '35+ 再出发',
    title: '社招 Java 开发',
  },
  {
    before: '追问环节让我',
    mark: '讲清技术细节的能力提升很多',
    after: '，Redis AOF 和优化方案都被一层层问到了。',
    user: 'Lex',
    title: '架构师',
  },
  {
    before: '系统设计一直是短板，报告里的建议帮我理清了思路，',
    mark: '现在能把方案讲清楚了',
    after: '。',
    user: '静心',
    title: '后端开发',
  },
];

const NOTES = [
  {
    text: '996 的节奏没时间约模拟面试，这里随时能练。系统设计和业务逻辑都练到了，终面很多题似曾相识。',
    user: 'smartbob',
    title: 'Go 开发',
  },
  { text: '比找人一对一辅导便宜得多，效果差不了太多，很值。', user: 'jackey', title: '后端开发' },
  {
    text: '从 Django ORM 优化到接口设计都被问到了，准备得很全面。',
    user: '莫然',
    title: 'Python 开发',
  },
];

/**
 * 用户反馈：编辑式排版。大字号的评价逐段从遮罩里展开，关键的一句被荧光笔划出来；
 * 旁注式的小评价反向漂移；一根丝线穿过整节，从每一句被划出的话下面经过。
 */
export default function Testimonials() {
  const sectionRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rowRefs = useRef<(HTMLElement | null)[]>([]);
  const quoteRefs = useRef<(HTMLElement | null)[]>([]);
  const noteRefs = useRef<(HTMLElement | null)[]>([]);
  const markRefs = useRef<(HTMLElement | null)[]>([]);
  const smooth = useRef({ q: 0 });
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ['start end', 'end start'] });

  const { invalidate } = useSilkCanvas(
    canvasRef,
    ({ ctx, w, time, dt, reduced }) => {
      const s = smooth.current;
      const tq = scrollYProgress.get();
      s.q = reduced ? tq : approach(s.q, tq, 10, dt);
      const vh = window.innerHeight;
      const cr = ctx.canvas.getBoundingClientRect();

      // 读：每一行在视口里的位置、被划出的那句话的位置
      const rows = rowRefs.current.map((el) => el?.getBoundingClientRect());
      const marks = markRefs.current.map((el) => (el ? Array.from(el.getClientRects()) : []));
      const quotes = quoteRefs.current.map((el) => el?.getBoundingClientRect());

      // 写：遮罩展开、荧光笔、水平漂移
      const lines: DOMRect[][] = [];
      FEATURED.forEach((_, i) => {
        const r = rows[i];
        if (!r) return;
        const t = clamp01((vh * 0.92 - r.top) / (vh * 0.6));
        const reveal = reduced ? 1 : easeOut(range(t, 0, 0.55));
        const sweep = reduced ? 1 : range(t, 0.45, 0.85);
        // 水平错位只在宽屏上做，窄屏上文字已经贴着页边
        const dir = w >= 1024 ? (i % 2 ? -1 : 1) : 0;
        const quote = quoteRefs.current[i];
        if (quote) {
          setStyle(quote, {
            'clip-path': `inset(0 0 ${((1 - reveal) * 100).toFixed(2)}% 0)`,
            transform: reduced
              ? ''
              : `translate3d(${((0.5 - t) * 48 * dir).toFixed(1)}px, ${((1 - reveal) * 24).toFixed(1)}px, 0)`,
          });
        }
        const note = noteRefs.current[i];
        if (note && !reduced && dir) {
          setStyle(note, {
            transform: `translate3d(${((t - 0.5) * 36 * dir).toFixed(1)}px, ${((0.5 - t) * 40).toFixed(1)}px, 0)`,
          });
        }
        const mark = markRefs.current[i];
        if (mark) setStyle(mark, { 'background-size': `${(sweep * 100).toFixed(1)}% 100%` });
        lines.push(marks[i]);
      });

      // 丝线：沿正文左侧的页边下来，贴着行间空隙横穿到被划出的那句话下面，
      // 再从右侧页边离开，荡到下一条评价。全程不穿过文字
      const keys: number[] = [];
      const Y = (v: number) => v - cr.top;
      const X = (v: number) => v - cr.left;
      lines.forEach((rects, i) => {
        const q = quotes[i];
        if (!rects.length || !q) return;
        const u = rects.reduce((m, rc) => (rc.width > m.width ? rc : m), rects[0]);
        const uy = Y(u.bottom) + 9;
        if (i === 0) keys.push(-60, Y(q.top) - 200);
        else keys.push(X(q.left) + 120, Y(q.top) - 80);
        keys.push(X(q.left) - 30, Y(q.top) - 24);
        keys.push(X(q.left) - 34, uy);
        keys.push(X(u.left) - 10, uy, X(u.right) + 10, uy);
        keys.push(X(q.right) + 36, uy);
        keys.push(X(q.right) + 56, Y(q.bottom) + 70);
      });
      keys.push(w + 80, keys[keys.length - 1] + 120);
      if (keys.length < 6) return;
      const path = spline(keys, 420);
      const draw = reduced ? 1 : easeOut(range(s.q, 0.12, 0.72));
      drawRibbon(ctx, path, {
        palette: SILK_LIGHT,
        lanes: 10,
        width: 9,
        twist: 9,
        phase: time * 0.5,
        to: draw,
        taper: 0.04,
        taperStart: false,
        wobble: 0.8,
        alpha: 0.85,
        time,
      });
      return Math.abs(s.q - tq) > 0.0005;
    },
    { ambient: true, dprCap: 1.5 }
  );
  useMotionValueEvent(scrollYProgress, 'change', invalidate);

  return (
    <section
      ref={sectionRef}
      id="testimonials"
      aria-label="用户反馈"
      className="relative scroll-mt-16 overflow-hidden pb-12 pt-28 lg:pb-16 lg:pt-40"
    >
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full"
      />
      <div className="page relative">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="eyebrow">用户反馈</p>
            <KineticText
              as="h2"
              text="练过的人，这样说。"
              className="mt-4 block text-[clamp(2.25rem,4.6vw,4rem)] font-semibold leading-[1.12] tracking-[-0.03em] text-ink"
            />
          </div>
        </div>

        <div className="mt-20 space-y-24 lg:mt-28 lg:space-y-36">
          {FEATURED.map((f, i) => {
            const n = NOTES[i];
            return (
              <div
                key={f.user}
                ref={(el) => (rowRefs.current[i] = el)}
                className="grid gap-8 lg:grid-cols-12 lg:gap-10"
              >
                <figure
                  className={cn(
                    'relative lg:col-span-9',
                    i % 2 ? 'lg:col-start-4' : 'lg:col-start-1'
                  )}
                >
                  <span
                    aria-hidden="true"
                    className="absolute -left-2 -top-14 select-none text-[120px] font-semibold leading-none text-brand-700/60 lg:-left-16 lg:-top-10"
                  >
                    “
                  </span>
                  <blockquote
                    ref={(el) => (quoteRefs.current[i] = el)}
                    className="relative text-[clamp(1.5rem,2.7vw,2.5rem)] font-medium leading-[1.5] tracking-[-0.01em] text-ink"
                  >
                    {f.before}
                    <span
                      ref={(el) => (markRefs.current[i] = el)}
                      className="mark"
                      style={{ backgroundSize: '0% 100%' }}
                    >
                      {f.mark}
                    </span>
                    {f.after}
                  </blockquote>
                  <figcaption className="mt-6 flex items-center gap-3 text-[14px]">
                    <span className="h-px w-10 bg-ink/30" aria-hidden="true" />
                    <span className="font-medium text-ink">{f.user}</span>
                    <span className="text-ink-secondary">{f.title}</span>
                  </figcaption>
                </figure>
                <figure
                  ref={(el) => (noteRefs.current[i] = el)}
                  className={cn(
                    'border-l border-line-strong pl-5 lg:col-span-3 lg:row-start-1 lg:self-end',
                    i % 2 ? 'lg:col-start-1 lg:mb-32' : 'lg:col-start-10 lg:mb-40'
                  )}
                >
                  <blockquote className="text-[15px] leading-7 text-ink-secondary">
                    {n.text}
                  </blockquote>
                  <figcaption className="mt-3 text-[13px]">
                    <span className="font-medium text-ink">{n.user}</span>
                    <span className="ml-2 text-ink-muted">{n.title}</span>
                  </figcaption>
                </figure>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
