import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowRight, CornerDownRight } from 'lucide-react';
import { Spotlight } from '@/components/motion/Spotlight';
import { Reveal } from '@/components/motion/Reveal';
import { INTERVIEW_TYPES } from '@/config/interviewTypes';
import type { InterviewKind } from '@/config/interviewTypes';
import { cn } from '@/lib/cn';
import SectionHeading from './SectionHeading';
import MultiPanelDiagram from './MultiPanelDiagram';

function ModeCard({
  kind,
  className,
  children,
  cta,
  anchor = false,
}: {
  kind: InterviewKind;
  className?: string;
  children?: ReactNode;
  cta: string;
  /** 首屏的轨道环滚动时会垂下来接到这张卡片上 */
  anchor?: boolean;
}) {
  const t = INTERVIEW_TYPES[kind];
  return (
    <Spotlight className={cn('rounded-tile', className)}>
      <Link
        href={t.href}
        data-thread-anchor={anchor || undefined}
        className="thread-port group flex h-full flex-col rounded-tile border border-line bg-white p-6 shadow-card transition-[box-shadow,transform,border-color] duration-200 hover:-translate-y-px hover:shadow-card-hover sm:p-7"
      >
        <span
          className={cn(
            'flex h-10 w-10 items-center justify-center rounded-xl text-lg',
            t.toneClass
          )}
        >
          {t.icon}
        </span>
        <h3 className="mt-5 text-xl font-semibold text-ink">{t.label}</h3>
        <p className="mt-2 text-[15px] leading-7 text-ink-secondary">{t.description}</p>
        {children && <div className="mt-6 flex flex-1 flex-col justify-end">{children}</div>}
        <span className="mt-6 inline-flex items-center gap-1 text-sm font-medium text-brand-800">
          {cta}
          <ArrowRight
            className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </span>
      </Link>
    </Spotlight>
  );
}

function Chips({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-wrap gap-2" aria-label="练习内容">
      {items.map((c) => (
        <li
          key={c}
          className="rounded-lg border border-line bg-canvas px-2.5 py-1 text-[13px] text-ink-secondary"
        >
          {c}
        </li>
      ))}
    </ul>
  );
}

/** 社招卡片里的追问链：同一个话题被一层层问深。面板撑满大卡片的剩余高度 */
function FollowUpChain() {
  const steps = [
    { who: '面试官', text: '订单缓存是怎么和数据库保持一致的？' },
    { who: '追问', text: '删除缓存失败了怎么办？' },
    { who: '再追问', text: '重试期间读到旧数据，业务能接受吗？' },
  ];
  return (
    <div className="flex flex-1 flex-col justify-between gap-6 rounded-card border border-line bg-canvas/70 p-5">
      <ol className="space-y-3" aria-label="追问示例">
        {steps.map((s, i) => (
          <li key={s.who} className="flex items-start gap-2" style={{ paddingLeft: `${i * 24}px` }}>
            {i > 0 && (
              <CornerDownRight
                className="mt-2.5 h-4 w-4 shrink-0 text-line-strong"
                aria-hidden="true"
              />
            )}
            <div
              className={cn(
                'rounded-xl border px-3.5 py-2.5 text-sm leading-6 shadow-xs',
                i === 0 ? 'border-line bg-white text-ink' : 'border-brand-200 bg-white text-ink'
              )}
            >
              <span
                className={cn(
                  'mr-2 text-xs font-medium',
                  i === 0 ? 'text-ink-secondary' : 'text-brand-800'
                )}
              >
                {s.who}
              </span>
              {s.text}
            </div>
          </li>
        ))}
      </ol>
      <div className="flex items-center justify-between gap-4 border-t border-line pt-4 text-xs text-ink-secondary">
        <span className="whitespace-nowrap">同一个话题，追问到第 3 层</span>
        <span className="flex shrink-0 gap-1" aria-hidden="true">
          {[1, 2, 3].map((d) => (
            <span key={d} className="h-1.5 w-5 rounded-full bg-brand-600 sm:w-8" />
          ))}
        </span>
      </div>
    </div>
  );
}

export default function ModeBento() {
  return (
    <section id="modes" className="page relative scroll-mt-20 py-24">
      <SectionHeading
        eyebrow="四种面试模式"
        title="从校招基础到多人面试，按你的阶段来练"
        description="每种模式的出题方向和追问深度都不一样。不确定选哪个，就从社招简历面试开始。"
      />
      <div className="mt-12 grid gap-4 lg:grid-cols-3">
        <Reveal className="lg:col-span-2 lg:row-span-2">
          <ModeCard kind="social" cta="开始社招面试" className="h-full" anchor>
            <FollowUpChain />
          </ModeCard>
        </Reveal>
        <Reveal delay={0.06}>
          <ModeCard kind="campus" cta="开始校招面试" className="h-full" anchor>
            <Chips items={['计算机网络', '操作系统', '数据结构', '项目经历']} />
          </ModeCard>
        </Reveal>
        <Reveal delay={0.12}>
          <ModeCard kind="special" cta="选择技术栈" className="h-full" anchor>
            <Chips items={['Go', 'Java', 'Redis', 'MySQL', '系统设计']} />
          </ModeCard>
        </Reveal>
        <Reveal delay={0.18} className="lg:col-span-3">
          <Spotlight className="rounded-tile">
            <Link
              href={INTERVIEW_TYPES.multi.href}
              className="group grid gap-8 rounded-tile border border-line bg-white p-6 shadow-card transition-[box-shadow,transform] duration-200 hover:-translate-y-px hover:shadow-card-hover sm:p-7 md:grid-cols-[1fr_minmax(0,420px)] md:items-center"
            >
              <div>
                <span
                  className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-xl text-lg',
                    INTERVIEW_TYPES.multi.toneClass
                  )}
                >
                  {INTERVIEW_TYPES.multi.icon}
                </span>
                <h3 className="mt-5 text-xl font-semibold text-ink">
                  {INTERVIEW_TYPES.multi.label}
                </h3>
                <p className="mt-2 max-w-md text-[15px] leading-7 text-ink-secondary">
                  三位面试官同时在场：主面试官把控节奏，技术面试官深挖原理，项目面试官追问业务细节。还原大厂多面试官的压力场景。
                </p>
                <span className="mt-6 inline-flex items-center gap-1 text-sm font-medium text-brand-800">
                  开始多人面试
                  <ArrowRight
                    className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </span>
              </div>
              <MultiPanelDiagram />
            </Link>
          </Spotlight>
        </Reveal>
      </div>
    </section>
  );
}
