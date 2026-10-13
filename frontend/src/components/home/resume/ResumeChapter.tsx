'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check } from 'lucide-react';
import { useMotionValueEvent, useScroll } from 'motion/react';
import { cn } from '@/lib/cn';
import {
  SILK_DARK,
  SILK_GLOW,
  approach,
  bezier,
  clamp01,
  drawKnot,
  drawRibbon,
  easeInOut,
  easeOut,
  lerp,
  range,
  setStyle,
} from '../silk/silk';
import { useSilkCanvas } from '../silk/useSilkCanvas';

/** 押题的五个真实步骤（有先后顺序，所以带序号）；at 是这一步在固定舞台里开始的滚动进度 */
const STEPS = [
  { title: '上传简历', text: '上传 PDF 简历，自动解析，不用手动填写项目经历。', at: 0 },
  { title: '信息拆解', text: '把一页简历拆成工作经历、项目经历和技能几块，逐段读取。', at: 0.16 },
  {
    title: '技能识别',
    text: 'Go、Redis、MySQL……项目里的每个技术点，都是面试官提问的线索。',
    at: 0.34,
  },
  { title: '问题生成', text: '把这些线索连起来，预测面试官最可能问的问题。', at: 0.52 },
  {
    title: '针对性练习',
    text: '每道题附考察重点、答题思路和可能的追问，练完直接进入模拟面试。',
    at: 0.74,
  },
];

/** 简历里会被识别出来的关键词，以及它们在知识网络里的位置（舞台百分比） */
const SKILLS = [
  { id: 'order', label: '订单系统', net: [57, 16] },
  { id: 'go', label: 'Go', net: [47, 38] },
  { id: 'hot', label: '高并发', net: [80, 28] },
  { id: 'redis', label: 'Redis', net: [72, 52] },
  { id: 'mysql', label: 'MySQL', net: [52, 64] },
  { id: 'mq', label: '消息队列', net: [86, 72] },
] as const;
type SkillId = (typeof SKILLS)[number]['id'];

const EDGES: [SkillId, SkillId][] = [
  ['order', 'hot'],
  ['order', 'go'],
  ['order', 'mysql'],
  ['hot', 'redis'],
  ['redis', 'mysql'],
  ['go', 'mq'],
  ['hot', 'mq'],
];

const QUESTIONS: { tag: string; text: string; from: SkillId[]; done: boolean }[] = [
  {
    tag: '项目',
    text: '订单系统的峰值 QPS 是多少，瓶颈在哪？',
    from: ['order', 'hot'],
    done: true,
  },
  { tag: '原理', text: 'Redis 缓存击穿和雪崩，分别怎么处理？', from: ['redis', 'hot'], done: true },
  { tag: '基础', text: 'MySQL 的间隙锁，解决了什么问题？', from: ['mysql'], done: false },
  { tag: '原理', text: '消息队列怎么保证消息不丢、不重复？', from: ['mq', 'go'], done: false },
];

const STICKY_TOP = 64;

/** 关键词在简历里的写法 */
function Kw({ id, children }: { id: SkillId; children: string }) {
  return (
    <span data-kw={id} className="mark text-ink" style={{ backgroundSize: '0% 100%' }}>
      {children}
    </span>
  );
}

/** 示例简历：纸面上的内容会被扫描、拆开、把关键词拎出来 */
function ResumeDoc({ static: isStatic = false }: { static?: boolean }) {
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[17px] font-semibold text-ink">张同学</p>
          <p className="mt-0.5 text-[12px] text-ink-secondary">后端开发 · 3 年经验</p>
        </div>
        <span className="rounded border border-line bg-white px-1.5 py-0.5 text-[12px] text-ink-muted">
          示例简历
        </span>
      </div>
      {[
        {
          h: '工作经历',
          body: (
            <>
              某电商公司 · 后端开发 · 2022 至今。负责<Kw id="order">订单系统</Kw>的设计与开发，用{' '}
              <Kw id="go">Go</Kw> 重构下单链路，支撑大促期间的<Kw id="hot">高并发</Kw>流量。
            </>
          ),
        },
        {
          h: '项目经历',
          body: (
            <>
              订单中心重构：用 <Kw id="redis">Redis</Kw> 缓存热点数据，
              <Kw id="mq">消息队列</Kw>异步削峰，<Kw id="mysql">MySQL</Kw> 分库分表。
            </>
          ),
        },
        { h: '技能', body: <>Go · Redis · MySQL · Kafka · Docker</> },
      ].map((s) => (
        <div
          key={s.h}
          data-sec
          className={cn(
            'mt-3 rounded-lg border-l-2 border-transparent px-2.5 py-2',
            isStatic && 'border-brand-600 bg-brand-600/10'
          )}
        >
          <p className="text-[12px] font-medium text-ink">{s.h}</p>
          <p className="mt-1 text-[12px] leading-5 text-ink-secondary">{s.body}</p>
        </div>
      ))}
    </>
  );
}

/**
 * 简历押题：全站第二个视觉高潮。深色舞台被固定在视口里，滚动推进一段分析过程——
 * 简历落下 → 扫描拆解 → 关键词顺着丝线被拎出来 → 连成知识网络 → 网络里浮出面试题 → 排成练习清单。
 */
export default function ResumeChapter() {
  const trackRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const regionRef = useRef<HTMLDivElement>(null);
  const docRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLDivElement>(null);
  const pctRef = useRef<HTMLSpanElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLSpanElement>(null);
  const railRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const [active, setActive] = useState(0);
  const activeRef = useRef(0);
  const smooth = useRef({ p: 0, enter: 0 });
  const els = useRef<{
    nodes: HTMLElement[];
    kws: Record<string, HTMLElement>;
    secs: HTMLElement[];
    cards: HTMLElement[];
    checks: HTMLElement[];
  } | null>(null);

  const { scrollYProgress } = useScroll({
    target: trackRef,
    offset: [`start ${STICKY_TOP}px`, 'end end'],
  });
  const { scrollYProgress: enterProgress } = useScroll({
    target: trackRef,
    offset: ['start end', `start ${STICKY_TOP}px`],
  });

  useEffect(() => {
    const region = regionRef.current;
    const doc = docRef.current;
    if (!region || !doc) return;
    const kws: Record<string, HTMLElement> = {};
    doc.querySelectorAll<HTMLElement>('[data-kw]').forEach((el) => (kws[el.dataset.kw!] = el));
    els.current = {
      nodes: Array.from(region.querySelectorAll<HTMLElement>('[data-node]')),
      kws,
      secs: Array.from(doc.querySelectorAll<HTMLElement>('[data-sec]')),
      cards: Array.from(region.querySelectorAll<HTMLElement>('[data-card]')),
      checks: Array.from(region.querySelectorAll<HTMLElement>('[data-check]')),
    };
  }, []);

  const { invalidate } = useSilkCanvas(
    canvasRef,
    ({ ctx, w, h, time, dt, reduced }) => {
      const E = els.current;
      const region = regionRef.current;
      const doc = docRef.current;
      const panel = panelRef.current;
      if (!E || !region || !doc || !panel) return;
      const s = smooth.current;
      const tp = scrollYProgress.get();
      const te = enterProgress.get();
      s.p = reduced ? tp : approach(s.p, tp, 10, dt);
      s.enter = reduced ? te : approach(s.enter, te, 12, dt);
      const p = s.p;

      // 深色舞台的遮罩：进入时从圆角卡片展开成整屏，离开时再收回去
      const open = easeInOut(range(s.enter, 0.2, 1)) * (1 - easeInOut(range(p, 0.95, 1)));
      const side = (1 - open) * Math.max(20, (w - 1200) / 2 + 32);
      const vert = (1 - open) * 24;
      panel.style.clipPath = `inset(${vert.toFixed(1)}px ${side.toFixed(1)}px ${vert.toFixed(1)}px ${side.toFixed(1)}px round ${(28 * (1 - open) + 0.01).toFixed(1)}px)`;

      // ---- 读：舞台、简历和关键词的位置 ----
      const cr = ctx.canvas.getBoundingClientRect();
      const rr = region.getBoundingClientRect();
      const ox = rr.left - cr.left;
      const oy = rr.top - cr.top;
      const rw = rr.width;
      const rh = rr.height;
      const dr = doc.getBoundingClientRect();
      const docBox = { x: dr.left - cr.left, y: dr.top - cr.top, w: dr.width, h: dr.height };
      const kwPos: Record<string, [number, number]> = {};
      for (const k in E.kws) {
        const r = E.kws[k].getBoundingClientRect();
        kwPos[k] = [r.left - cr.left + r.width / 2, r.top - cr.top + r.height / 2];
      }
      const nodeSize = E.nodes.map((n) => [n.offsetWidth, n.offsetHeight]);
      const cardSize = E.cards.map((n) => [n.offsetWidth, n.offsetHeight]);

      // ---- 各阶段进度 ----
      const rise = easeOut(range(p, 0, 0.08));
      const upload = range(p, 0.02, 0.14);
      const scan = range(p, 0.17, 0.32);
      const split = easeInOut(range(p, 0.2, 0.32));
      const recede = easeInOut(range(p, 0.52, 0.62));
      const shift = easeInOut(range(p, 0.53, 0.64));
      const gather = easeInOut(range(p, 0.75, 0.84));

      // ---- 写：简历、关键词、题目 ----
      // 读完之后简历退场：向左后方转走、淡出，把舞台留给知识网络
      setStyle(doc, { opacity: String(rise * (1 - recede)) });
      setStyle(doc, {
        transform: `perspective(1400px) rotateY(${lerp(14, 38, recede).toFixed(2)}deg) translate3d(${(-recede * 160).toFixed(1)}px, ${((1 - rise) * 60).toFixed(1)}px, 0) scale(${lerp(1, 0.8, recede).toFixed(3)})`,
      });
      E.secs.forEach((el, i) => {
        const passed = clamp01((scan * 1.15 - (i + 0.6) / E.secs.length) * 6);
        setStyle(el, {
          transform: `translate3d(0, ${(i * 10 * split).toFixed(1)}px, 0)`,
          'background-color': `rgba(191, 234, 46, ${(0.13 * passed).toFixed(3)})`,
          'border-left-color': `rgba(156, 196, 26, ${passed.toFixed(3)})`,
        });
      });
      if (fileRef.current) {
        setStyle(fileRef.current, { opacity: String(rise * (1 - range(p, 0.15, 0.2))) });
      }
      if (pctRef.current) {
        const pct = Math.round(upload * 100);
        const label = pct >= 100 ? '已解析 · 2 页' : `解析中 ${pct}%`;
        if (pctRef.current.textContent !== label) pctRef.current.textContent = label;
      }

      // 关键词：在简历里被划亮 → 顺着弧线飞到网络位置 → 网络整体左移 → 收拢
      const center = [ox + rw * 0.26, oy + rh * 0.46];
      const nodePos: Record<string, [number, number]> = {};
      const lifts: number[] = [];
      SKILLS.forEach((sk, i) => {
        const t0 = 0.35 + i * 0.022;
        const hl = range(p, t0 - 0.03, t0);
        const lift = easeInOut(range(p, t0, t0 + 0.07));
        lifts.push(lift);
        const kw = E.kws[sk.id];
        if (kw) setStyle(kw, { 'background-size': `${(hl * 100).toFixed(1)}% 100%` });
        const [kx, ky] = kwPos[sk.id] ?? [0, 0];
        const netX = ox + (rw * (sk.net[0] - 40 * shift)) / 100;
        const netY = oy + (rh * sk.net[1]) / 100;
        // 弧线：先往上拎，再落到位置上
        const ax = lerp(kx, netX, lift);
        const ay = lerp(ky, netY, lift) - Math.sin(lift * Math.PI) * 70;
        const gx = lerp(ax, center[0] + (netX - center[0]) * 0.55, gather);
        const gy = lerp(ay, center[1] + (netY - center[1]) * 0.55, gather);
        nodePos[sk.id] = [gx, gy];
        const el = E.nodes[i];
        const [nw, nh] = nodeSize[i];
        setStyle(el, {
          opacity: String(lift > 0.001 ? Math.min(1, lift * 4) * (1 - gather * 0.45) : 0),
          transform: `translate3d(${(gx - ox - nw / 2).toFixed(1)}px, ${(gy - oy - nh / 2).toFixed(1)}px, 0) scale(${lerp(0.7, 1, Math.min(1, lift * 2)).toFixed(3)})`,
        });
      });

      // 题目：从网络旁边浮出，再排进练习清单
      const cardPos: [number, number][] = [];
      QUESTIONS.forEach((q, i) => {
        const appear = easeOut(range(p, 0.6 + i * 0.03, 0.66 + i * 0.03));
        const x0 = rw * 0.6;
        const y0 = rh * (0.1 + i * 0.2);
        const x1 = rw * 0.5;
        const y1 = rh * (0.2 + i * 0.15);
        const x = lerp(x0, x1, gather) + (1 - appear) * 30;
        const y = lerp(y0, y1, gather);
        cardPos.push([ox + x, oy + y + cardSize[i][1] / 2]);
        const el = E.cards[i];
        setStyle(el, {
          opacity: String(appear),
          transform: `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`,
        });
        const check = E.checks[i];
        if (check) {
          const c = q.done ? easeOut(range(p, 0.84 + i * 0.025, 0.88 + i * 0.025)) : 0;
          setStyle(check, {
            opacity: String(c),
            transform: `scale(${lerp(0.4, 1, c).toFixed(3)})`,
          });
        }
      });
      if (listRef.current) {
        setStyle(listRef.current, {
          opacity: String(gather),
          transform: `translate3d(0, ${((1 - gather) * 16).toFixed(1)}px, 0)`,
        });
      }
      if (progressRef.current) {
        setStyle(progressRef.current, {
          transform: `scaleX(${lerp(0, 8 / 12, easeOut(range(p, 0.84, 0.93))).toFixed(3)})`,
        });
      }

      // 步骤导轨
      railRefs.current.forEach((el, i) => {
        if (!el) return;
        const end = STEPS[i + 1]?.at ?? 0.94;
        setStyle(el, { transform: `scaleY(${range(p, STEPS[i].at, end).toFixed(3)})` });
      });
      let next = 0;
      STEPS.forEach((st, i) => {
        if (p >= st.at - 0.005) next = i;
      });
      if (next !== activeRef.current) {
        activeRef.current = next;
        setActive(next);
      }

      // ---- 画丝线 ----
      const phase = time * 0.6;
      // 1. 上传：一束线从舞台上方垂下来，接住简历
      if (upload > 0 && scan < 1) {
        const top = [docBox.x + docBox.w * 0.5, -20];
        const path = bezier(
          top[0] + 120,
          top[1],
          top[0] + 120,
          docBox.y * 0.5,
          top[0],
          docBox.y - 60,
          top[0],
          docBox.y + 4,
          90
        );
        drawRibbon(ctx, path, {
          palette: SILK_DARK,
          lanes: 12,
          width: 14,
          twist: 1.4,
          phase,
          to: easeOut(upload),
          taper: 0.15,
          taperStart: false,
          alpha: 1 - range(p, 0.18, 0.26),
          wobble: 1,
          time,
        });
      }
      // 2. 扫描：一道发光的丝带从上往下扫过简历
      if (scan > 0 && scan < 1) {
        const y = docBox.y + docBox.h * (0.06 + scan * 0.9);
        const g = ctx.createLinearGradient(0, y - 90, 0, y);
        g.addColorStop(0, 'rgba(191,234,46,0)');
        g.addColorStop(1, 'rgba(191,234,46,0.16)');
        ctx.fillStyle = g;
        ctx.fillRect(docBox.x, y - 90, docBox.w, 90);
        const path = bezier(
          docBox.x - 40,
          y + 6,
          docBox.x + docBox.w * 0.3,
          y - 4,
          docBox.x + docBox.w * 0.7,
          y + 4,
          docBox.x + docBox.w + 40,
          y - 6,
          80
        );
        const fade = Math.min(1, scan * 8, (1 - scan) * 8);
        drawRibbon(ctx, path, {
          palette: SILK_GLOW,
          lanes: 10,
          width: 8,
          twist: 2.5,
          phase: phase * 2,
          taper: 0.2,
          alpha: fade,
          time,
        });
      }
      // 3. 关键词从简历里被拎出来时，身后拖着一根线
      const docFade = 1 - recede;
      SKILLS.forEach((sk, i) => {
        const lift = lifts[i];
        if (lift <= 0.001) return;
        const [kx, ky] = kwPos[sk.id];
        const [nx, ny] = nodePos[sk.id];
        const path = bezier(kx, ky, kx + 40, ky - 80, nx - 80, ny, nx, ny, 70);
        drawRibbon(ctx, path, {
          palette: SILK_DARK,
          lanes: 8,
          width: 7,
          twist: 1.2,
          phase: phase + i,
          to: Math.min(1, lift * 1.4),
          taper: 0.18,
          alpha: docFade * (1 - gather * 0.6),
          time,
        });
      });
      // 4. 关键词之间连成知识网络
      EDGES.forEach(([a, b], i) => {
        const weave = easeInOut(range(p, 0.55 + i * 0.016, 0.62 + i * 0.016));
        if (weave <= 0.001) return;
        const [x0, y0] = nodePos[a];
        const [x1, y1] = nodePos[b];
        const mx = (x0 + x1) / 2 + (y1 - y0) * 0.18;
        const my = (y0 + y1) / 2 - (x1 - x0) * 0.18;
        const path = bezier(x0, y0, mx, my, mx, my, x1, y1, 60);
        drawRibbon(ctx, path, {
          palette: SILK_DARK,
          lanes: 10,
          width: 10,
          twist: 1.6,
          phase: phase + i * 0.8,
          to: weave,
          taper: 0.22,
          alpha: 0.9 - gather * 0.4,
          wobble: 0.8,
          time,
        });
      });
      // 5. 每道题从它的来源关键词那里引出一根线
      QUESTIONS.forEach((q, i) => {
        const appear = range(p, 0.6 + i * 0.03, 0.67 + i * 0.03);
        if (appear <= 0.001) return;
        const [cx, cy] = cardPos[i];
        q.from.forEach((id, j) => {
          const [nx, ny] = nodePos[id];
          const path = bezier(nx, ny, lerp(nx, cx, 0.5), ny, lerp(nx, cx, 0.5), cy, cx - 4, cy, 70);
          drawRibbon(ctx, path, {
            palette: j === 0 ? SILK_GLOW : SILK_DARK,
            lanes: j === 0 ? 7 : 6,
            width: 7,
            twist: 1.3,
            phase: phase + i + j,
            to: easeOut(appear),
            taper: 0.2,
            alpha: j === 0 ? 0.75 : 0.6,
            time,
          });
        });
        if (appear > 0.95) drawKnot(ctx, cx - 4, cy, 3, '#BFEA2E', '#0F1F17', 1);
      });
      // 网络节点：小小的结
      SKILLS.forEach((sk, i) => {
        if (lifts[i] < 0.99) return;
        const [x, y] = nodePos[sk.id];
        drawKnot(ctx, x, y, 2.5, '#D9F58A', '#0F1F17', 0.5 * (1 - gather));
      });

      return Math.abs(s.p - tp) > 0.0004 || Math.abs(s.enter - te) > 0.001;
    },
    { ambient: true, dprCap: 1.5 }
  );

  useMotionValueEvent(scrollYProgress, 'change', invalidate);
  useMotionValueEvent(enterProgress, 'change', invalidate);

  return (
    <section id="resume-prediction" aria-label="简历押题" className="relative scroll-mt-16">
      <ul className="sr-only" aria-label="示例：根据简历预测的面试题">
        {QUESTIONS.map((q) => (
          <li key={q.text}>{q.text}</li>
        ))}
      </ul>
      {/* 桌面端：固定的深色舞台 */}
      <div ref={trackRef} className="relative hidden h-[520vh] lg:motion-safe:block">
        <div className="sticky top-16 h-[calc(100vh-4rem)]">
          <div ref={panelRef} className="absolute inset-0 overflow-hidden bg-forest">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-40 -top-40 h-[560px] w-[560px] rounded-full bg-[radial-gradient(closest-side,rgba(217,245,138,0.14),transparent)]"
            />
            <canvas
              ref={canvasRef}
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 h-full w-full"
            />
            <div className="page relative grid h-full grid-cols-[minmax(0,360px)_1fr] gap-12">
              <div className="flex flex-col justify-center pb-8">
                <p className="eyebrow text-mint">简历押题</p>
                <h2 className="mt-3 text-balance text-[clamp(2rem,3.2vw,2.75rem)] font-semibold leading-[1.18] tracking-[-0.02em] text-white">
                  <span className="inline-block">把你的简历，</span>
                  <span className="inline-block">变成一份押题清单</span>
                </h2>
                <ol className="mt-10 space-y-1">
                  {STEPS.map((st, i) => (
                    <li
                      key={st.title}
                      aria-current={active === i ? 'step' : undefined}
                      className="flex gap-4"
                    >
                      <span className="relative mt-1.5 w-[2px] shrink-0 overflow-hidden rounded-full bg-white/10">
                        <span
                          ref={(el) => (railRefs.current[i] = el)}
                          className="absolute inset-0 origin-top bg-brand-600"
                          style={{ transform: 'scaleY(0)' }}
                        />
                      </span>
                      <div className="py-1.5">
                        <p
                          className={cn(
                            'flex items-baseline gap-2.5 text-[15px] transition-colors duration-300',
                            active === i
                              ? 'font-medium text-white'
                              : active > i
                                ? 'text-white/60'
                                : 'text-white/40'
                          )}
                        >
                          <span className="tabular-nums text-[13px] text-mint/80">{i + 1}</span>
                          {st.title}
                        </p>
                        <div
                          className={cn(
                            'grid transition-[grid-template-rows,opacity] duration-500 ease-out',
                            active === i
                              ? 'grid-rows-[1fr] opacity-100'
                              : 'grid-rows-[0fr] opacity-0'
                          )}
                        >
                          <p className="overflow-hidden text-[14px] leading-6 text-white/65">
                            <span className="block pt-1.5">{st.text}</span>
                          </p>
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
                <Link
                  href="/resume"
                  className="link-btn link-btn-lg mt-10 w-fit bg-white text-forest shadow-xs hover:-translate-y-px hover:bg-mint hover:text-forest"
                >
                  上传简历押题
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>

              <div ref={regionRef} className="relative h-full" aria-hidden="true">
                {/* 上传中的文件 */}
                <div
                  ref={fileRef}
                  className="absolute left-[2%] top-[5%] flex items-center gap-2 rounded-full border border-white/10 bg-white/5 py-1.5 pl-3 pr-3.5 text-[13px] text-white/80 opacity-0"
                >
                  张同学_后端开发.pdf
                  <span ref={pctRef} className="tabular-nums text-mint">
                    解析中 0%
                  </span>
                </div>
                {/* 简历本体 */}
                <div
                  ref={docRef}
                  className="absolute left-[2%] top-[12%] w-[330px] origin-left rounded-[14px] bg-canvas p-5 opacity-0 shadow-[0_40px_90px_-30px_rgba(0,0,0,0.7)]"
                >
                  <ResumeDoc />
                </div>
                {/* 练习清单的框 */}
                <div
                  ref={listRef}
                  className="absolute left-[46%] right-0 top-[8%] h-[80%] rounded-[20px] border border-white/10 bg-white/[0.03] p-5 opacity-0"
                >
                  <div className="flex items-center justify-between text-[13px] text-white/70">
                    <span>押题清单 · 12 题</span>
                    <span className="text-white/45">示例</span>
                  </div>
                  <div className="absolute inset-x-5 bottom-5 flex items-center gap-3 text-[13px] text-white/60">
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                      <span
                        ref={progressRef}
                        className="block h-full origin-left rounded-full bg-brand-600"
                        style={{ transform: 'scaleX(0)' }}
                      />
                    </span>
                    <span className="tabular-nums">已练 8 / 12 题</span>
                  </div>
                </div>
                {/* 关键词节点 */}
                {SKILLS.map((sk) => (
                  <span
                    key={sk.id}
                    data-node
                    className="absolute left-0 top-0 whitespace-nowrap rounded-full border border-brand-700 bg-brand-600 px-3 py-1 text-[14px] font-medium text-ink opacity-0 shadow-[0_0_0_6px_rgba(191,234,46,0.12)]"
                  >
                    {sk.label}
                  </span>
                ))}
                {/* 预测出的题目 */}
                {QUESTIONS.map((q, i) => (
                  <div
                    key={q.text}
                    data-card
                    className="absolute left-0 top-0 flex w-[min(320px,46%)] items-start gap-3 rounded-xl border border-white/10 bg-forest-800/95 p-3.5 opacity-0 shadow-[0_20px_50px_-24px_rgba(0,0,0,0.8)]"
                  >
                    <span className="mt-0.5 shrink-0 rounded bg-brand-600/20 px-1.5 py-0.5 text-xs text-mint">
                      {q.tag}
                    </span>
                    <span className="flex-1 text-[14px] leading-6 text-white/90">{q.text}</span>
                    <span
                      data-check
                      className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand-600 text-ink opacity-0"
                    >
                      <Check className="h-3 w-3" strokeWidth={3} />
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 手机端 / 减弱动态效果：同样的五步，静态排列 */}
      <div className="page py-6 lg:motion-safe:hidden">
        <div className="relative overflow-hidden rounded-[28px] bg-forest px-6 py-12 sm:px-10">
          <p className="eyebrow text-mint">简历押题</p>
          <h2 className="mt-3 text-[clamp(1.75rem,6vw,2.5rem)] font-semibold leading-tight text-white">
            <span className="inline-block">把你的简历，</span>
            <span className="inline-block">变成一份押题清单</span>
          </h2>
          <ol className="mt-8 space-y-6">
            {STEPS.map((st, i) => (
              <li key={st.title}>
                <p className="flex items-baseline gap-2.5 text-[15px] font-medium text-white">
                  <span className="tabular-nums text-[13px] text-mint">{i + 1}</span>
                  {st.title}
                </p>
                <p className="mt-1 text-[14px] leading-6 text-white/65">{st.text}</p>
                {i === 1 && (
                  <div className="mt-4 max-w-[340px] rounded-[14px] bg-canvas p-4 [&_[data-kw]]:![background-size:100%_100%]">
                    <ResumeDoc static />
                  </div>
                )}
                {i === 2 && (
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {SKILLS.map((sk) => (
                      <li
                        key={sk.id}
                        className="rounded-full bg-brand-600 px-3 py-1 text-[13px] font-medium text-ink"
                      >
                        {sk.label}
                      </li>
                    ))}
                  </ul>
                )}
                {i === 3 && (
                  <ul className="mt-3 space-y-2">
                    {QUESTIONS.map((q) => (
                      <li
                        key={q.text}
                        className="flex gap-2 rounded-xl border border-white/10 bg-forest-800 p-3 text-[14px] leading-6 text-white/90"
                      >
                        <span className="mt-0.5 h-fit shrink-0 rounded bg-brand-600/20 px-1.5 py-0.5 text-xs text-mint">
                          {q.tag}
                        </span>
                        {q.text}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
          <Link
            href="/resume"
            className="link-btn link-btn-lg mt-10 w-fit bg-white text-forest shadow-xs hover:bg-mint hover:text-forest"
          >
            上传简历押题
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}
