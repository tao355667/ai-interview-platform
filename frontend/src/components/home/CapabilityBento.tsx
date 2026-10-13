import type { ReactNode } from 'react';
import { Reveal } from '@/components/motion/Reveal';
import { cn } from '@/lib/cn';
import SectionHeading from './SectionHeading';
import ReportBars from './ReportBars';
import DifficultyDemo from './DifficultyDemo';

function Tile({
  title,
  description,
  children,
  className,
  delay = 0,
}: {
  title: string;
  description: string;
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <Reveal
      delay={delay}
      className={cn(
        'group flex flex-col rounded-tile border border-line bg-white p-6 shadow-card sm:p-7',
        className
      )}
    >
      <h3 className="text-lg font-semibold text-ink">{title}</h3>
      <p className="mt-2 max-w-md text-[15px] leading-7 text-ink-secondary">{description}</p>
      <div className="mt-6 flex flex-1 flex-col justify-end">{children}</div>
    </Reveal>
  );
}

/** 语音作答示意：悬停卡片时声波才开始跳动，平时保持静止 */
function VoiceDemo() {
  return (
    <div className="rounded-card border border-line bg-canvas p-4">
      <div className="flex h-10 items-center justify-center gap-[3px]" aria-hidden="true">
        {Array.from({ length: 28 }).map((_, i) => (
          <span
            key={i}
            className="w-[3px] origin-center animate-wave rounded-full bg-brand-600 [animation-play-state:paused] group-hover:[animation-play-state:running]"
            style={{ height: `${10 + ((i * 11) % 26)}px`, animationDelay: `${(i % 7) * 0.09}s` }}
          />
        ))}
      </div>
      <p className="mt-3 text-[13px] leading-6 text-ink-secondary">
        <span className="text-ink">“我们用的是先更新数据库、再删缓存的方案……”</span>
        <span className="ml-1 text-ink-muted">识别中</span>
      </p>
    </div>
  );
}

/** 面试记录示意：最近几场的综合得分走势 */
function ProgressDemo() {
  const scores = [62, 71, 68, 77, 80, 86];
  const w = 320;
  const h = 96;
  const pts = scores
    .map((s, i) => `${(i / (scores.length - 1)) * w},${h - ((s - 55) / 35) * h}`)
    .join(' ');
  return (
    <div className="grid gap-6 sm:grid-cols-[1fr_180px] sm:items-end">
      <figure>
        <svg
          viewBox={`0 0 ${w} ${h}`}
          className="h-28 w-full overflow-visible"
          role="img"
          aria-label="最近 6 场模拟面试得分从 62 分提升到 86 分"
        >
          <polyline
            points={pts}
            fill="none"
            stroke="#4D6A06"
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {scores.map((s, i) => (
            <circle
              key={i}
              cx={(i / (scores.length - 1)) * w}
              cy={h - ((s - 55) / 35) * h}
              r={i === scores.length - 1 ? 4.5 : 3}
              fill={i === scores.length - 1 ? '#BFEA2E' : '#FFFFFF'}
              stroke="#4D6A06"
              strokeWidth="2"
            />
          ))}
        </svg>
        <figcaption className="mt-2 flex justify-between text-xs text-ink-muted">
          <span>第 1 场</span>
          <span>第 6 场</span>
        </figcaption>
      </figure>
      <dl className="space-y-3 border-line sm:border-l sm:pl-6">
        <div>
          <dt className="text-xs text-ink-secondary">最近一场</dt>
          <dd className="text-2xl font-semibold tabular-nums text-ink">86</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-secondary">较第一场</dt>
          <dd className="text-sm font-medium tabular-nums text-brand-800">+24 分</dd>
        </div>
      </dl>
    </div>
  );
}

export default function CapabilityBento() {
  return (
    <section id="capabilities" className="scroll-mt-20 page py-24">
      <SectionHeading
        eyebrow="面试之后"
        title="不只是出题，还告诉你差在哪"
        description="每一次作答都会被记录和评估。你能看到自己卡在哪个维度，也能看到练习带来的变化。"
      />
      <div className="mt-12 grid gap-4 lg:grid-cols-6">
        <Tile
          className="lg:col-span-4"
          title="逐题点评的评估报告"
          description="面试结束后生成报告：综合得分、各维度表现，以及每道题的点评和改进建议。"
        >
          <div className="grid gap-6 rounded-card border border-line bg-canvas p-5 sm:grid-cols-[160px_1fr]">
            <div>
              <div className="text-xs text-ink-secondary">综合得分</div>
              <div className="mt-1 text-[44px] font-semibold leading-none tabular-nums text-ink">
                86<span className="ml-1 text-sm font-normal text-ink-muted">/ 100</span>
              </div>
              <p className="mt-4 text-[13px] leading-6 text-ink-secondary">
                第 3 题思路清晰，可补充延迟双删的适用场景。
              </p>
            </div>
            <ReportBars />
          </div>
        </Tile>
        <Tile
          className="lg:col-span-2"
          delay={0.06}
          title="开口说，也能答"
          description="点一下麦克风就能语音作答，识别结果填进输入框，确认后再发送。"
        >
          <VoiceDemo />
        </Tile>
        <Tile
          className="lg:col-span-2"
          delay={0.12}
          title="难度随你调"
          description="同一个知识点，难度越高，问得越深。"
        >
          <DifficultyDemo />
        </Tile>
        <Tile
          className="lg:col-span-4"
          delay={0.18}
          title="每一场都留有记录"
          description="历史面试、答题记录和报告都保存在个人中心，进步看得见。"
        >
          <ProgressDemo />
        </Tile>
      </div>
    </section>
  );
}
