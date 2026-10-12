'use client';

import Link from 'next/link';
import { useRef } from 'react';
import { ArrowRight, FileText, ScanSearch, ListChecks, Target } from 'lucide-react';
import { AnimatedBeam } from '@/components/motion/AnimatedBeam';
import { Reveal } from '@/components/motion/Reveal';
import SectionHeading from './SectionHeading';

const SKILLS = ['Go', 'Redis', 'MySQL', '订单系统', '高并发', '消息队列'];

const PREDICTED = [
  { tag: '项目', text: '订单系统的峰值 QPS 是多少，瓶颈在哪？' },
  { tag: '原理', text: 'Redis 缓存击穿和雪崩分别怎么处理？' },
  { tag: '基础', text: 'MySQL 的间隙锁解决了什么问题？' },
];

function StepLabel({ n, children }: { n: number; children: string }) {
  return (
    <div className="mb-3 flex items-center gap-2 text-[13px] text-white/60">
      <span className="flex h-5 w-5 items-center justify-center rounded-full border border-white/20 text-xs tabular-nums text-white/80">
        {n}
      </span>
      {children}
    </div>
  );
}

const nodeClass =
  'relative z-[1] rounded-card border border-white/10 bg-forest-800 p-4 shadow-[0_1px_0_rgba(255,255,255,0.04)_inset]';

/** 简历押题流程：上传简历 → AI 分析 → 预测问题 → 针对性练习 */
export default function ResumePipeline() {
  const containerRef = useRef<HTMLDivElement>(null);
  const n1 = useRef<HTMLDivElement>(null);
  const n2 = useRef<HTMLDivElement>(null);
  const n3 = useRef<HTMLDivElement>(null);
  const n4 = useRef<HTMLDivElement>(null);
  const pairs = [
    [n1, n2],
    [n2, n3],
    [n3, n4],
  ] as const;

  return (
    <section id="resume-prediction" className="scroll-mt-20 page py-6">
      <div className="relative overflow-hidden rounded-[28px] bg-forest px-6 py-16 sm:px-10 lg:px-14">
        {/* 局部薄荷色光晕 */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-40 -top-40 h-[480px] w-[480px] rounded-full bg-[radial-gradient(closest-side,rgba(167,243,208,0.18),transparent)]"
        />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <SectionHeading
            inverted
            eyebrow="简历押题"
            title="把你的简历，变成一份押题清单"
            description="上传简历后，AI 会读出你的项目和技术栈，预测面试官最可能问的问题，再带你逐题练习。"
          />
          <Link
            href="/resume"
            className="link-btn link-btn-lg shrink-0 bg-white text-forest shadow-xs hover:-translate-y-px hover:bg-mint hover:text-forest"
          >
            上传简历押题
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>

        <div ref={containerRef} className="relative mt-14 grid gap-4 lg:grid-cols-4 lg:gap-6">
          <Reveal>
            <StepLabel n={1}>上传简历</StepLabel>
            <div ref={n1} className={nodeClass}>
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10 text-mint">
                  <FileText className="h-5 w-5" strokeWidth={1.75} />
                </span>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-white">张同学_后端开发.pdf</div>
                  <div className="text-xs text-white/50">2 页 · 已解析</div>
                </div>
              </div>
              <div className="mt-4 space-y-2" aria-hidden="true">
                <div className="h-1.5 w-full rounded-full bg-white/10" />
                <div className="h-1.5 w-4/5 rounded-full bg-white/10" />
                <div className="h-1.5 w-3/5 rounded-full bg-white/10" />
              </div>
            </div>
          </Reveal>

          <Reveal delay={0.08}>
            <StepLabel n={2}>AI 分析</StepLabel>
            <div ref={n2} className={nodeClass}>
              <div className="flex items-center gap-2 text-sm text-white">
                <ScanSearch className="h-4 w-4 text-mint" strokeWidth={1.75} />
                识别到的技术栈与经历
              </div>
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {SKILLS.map((s) => (
                  <li key={s} className="rounded-md bg-white/10 px-2 py-0.5 text-xs text-white/80">
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>

          <Reveal delay={0.16}>
            <StepLabel n={3}>预测问题</StepLabel>
            <div ref={n3} className={nodeClass}>
              <div className="flex items-center gap-2 text-sm text-white">
                <ListChecks className="h-4 w-4 text-mint" strokeWidth={1.75} />
                高频问题
              </div>
              <ul className="mt-3 space-y-2.5">
                {PREDICTED.map((q) => (
                  <li key={q.text} className="text-[13px] leading-5 text-white/80">
                    <span className="mr-1.5 rounded bg-brand-600/20 px-1.5 py-0.5 text-xs text-mint">
                      {q.tag}
                    </span>
                    {q.text}
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>

          <Reveal delay={0.24}>
            <StepLabel n={4}>针对性练习</StepLabel>
            <div ref={n4} className={nodeClass}>
              <div className="flex items-center gap-2 text-sm text-white">
                <Target className="h-4 w-4 text-mint" strokeWidth={1.75} />
                逐题练习
              </div>
              <p className="mt-3 text-[13px] leading-6 text-white/70">
                每道题附考察重点、答题思路和可能的追问，练完直接进入模拟面试。
              </p>
              <div className="mt-4 flex items-center gap-2 text-xs text-white/50">
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                  <span className="block h-full w-2/3 rounded-full bg-brand-600" />
                </span>
                <span className="tabular-nums">已练 8 / 12 题</span>
              </div>
            </div>
          </Reveal>

          {/* 连线层：绝对定位，不占网格位置；手机端竖排时不显示 */}
          <div className="pointer-events-none absolute inset-0 hidden lg:block">
            {pairs.map(([from, to], i) => (
              <AnimatedBeam
                key={i}
                containerRef={containerRef}
                fromRef={from}
                toRef={to}
                startXOffset={0}
                duration={3.2}
                delay={i * 0.4}
                pathColor="#FFFFFF"
                pathOpacity={0.1}
                gradientStartColor="#10BB83"
                gradientStopColor="#A7F3D0"
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
