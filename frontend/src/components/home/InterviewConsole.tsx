'use client';

import { useEffect, useRef, useState } from 'react';
import { useInView, useReducedMotion } from 'motion/react';
import { AlertCircle, Check, Circle, Mic, Pause, Play, Sparkles } from 'lucide-react';
import { BorderBeam } from '@/components/motion/BorderBeam';
import { INTERVIEW_TYPES } from '@/config/interviewTypes';
import type { InterviewKind } from '@/config/interviewTypes';
import { cn } from '@/lib/cn';

interface Scene {
  kind: InterviewKind;
  asker: string;
  followUpAsker: string;
  question: string;
  answer: string;
  /** AI 从回答里发现的缺口 */
  gap: string;
  followUp: string;
  scores: { label: string; value: number }[];
  points: { text: string; hit: boolean }[];
}

const SCENES: Scene[] = [
  {
    kind: 'social',
    asker: '面试官',
    followUpAsker: '面试官 · 追问',
    question: '你在订单系统里用 Redis 做了缓存，数据库更新之后，缓存是怎么处理的？',
    answer: '先更新数据库，再删除缓存。删除失败的话通过消息队列重试，保证最终一致。',
    gap: '没有考虑并发读请求把旧值写回缓存',
    followUp: '如果删除缓存之前，有一个并发读请求把旧值又写回了缓存，你会怎么处理？',
    scores: [
      { label: '技术深度', value: 78 },
      { label: '表达结构', value: 85 },
      { label: '项目理解', value: 82 },
    ],
    points: [
      { text: '更新顺序', hit: true },
      { text: '失败重试', hit: true },
      { text: '并发脏数据', hit: false },
    ],
  },
  {
    kind: 'campus',
    asker: '面试官',
    followUpAsker: '面试官 · 追问',
    question: '说一下 TCP 三次握手的过程，为什么不是两次？',
    answer:
      '客户端发 SYN，服务端回 SYN+ACK，客户端再回 ACK。只握两次的话，服务端没法确认客户端能收到。',
    gap: '解释了双向确认，但没提到历史连接的问题',
    followUp: '如果一个延迟很久的旧 SYN 到达服务端，只握两次会出现什么问题？',
    scores: [
      { label: '基础知识', value: 84 },
      { label: '表达结构', value: 80 },
      { label: '举一反三', value: 66 },
    ],
    points: [
      { text: '握手流程', hit: true },
      { text: '双向确认', hit: true },
      { text: '历史连接', hit: false },
    ],
  },
  {
    kind: 'special',
    asker: '面试官 · Go 专项',
    followUpAsker: '面试官 · 追问',
    question: 'Go 的 GMP 调度模型里，P 起什么作用？',
    answer: 'P 是逻辑处理器，持有本地运行队列。M 必须绑定一个 P 才能执行 G。',
    gap: '没有说明 P 的数量限制和任务窃取',
    followUp: '当某个 P 的本地队列空了，调度器会怎么为它找活干？',
    scores: [
      { label: '原理掌握', value: 80 },
      { label: '细节准确', value: 74 },
      { label: '实践经验', value: 70 },
    ],
    points: [
      { text: '本地队列', hit: true },
      { text: 'M 绑定 P', hit: true },
      { text: '任务窃取', hit: false },
    ],
  },
  {
    kind: 'multi',
    asker: '主面试官',
    followUpAsker: '技术面试官 · 追问',
    question: '介绍一个你主导的项目，以及其中最难的一次技术决策。',
    answer: '我主导了支付对账系统的重构，把每天一次的全量对账改成了基于消息的实时对账。',
    gap: '实时对账的一致性保障还没展开',
    followUp: '消息重复或乱序到达时，你们怎么保证对账结果是正确的？',
    scores: [
      { label: '项目深度', value: 83 },
      { label: '技术决策', value: 76 },
      { label: '沟通表达', value: 88 },
    ],
    points: [
      { text: '项目背景', hit: true },
      { text: '决策取舍', hit: true },
      { text: '一致性保障', hit: false },
    ],
  },
];

// 时间轴（毫秒）：全部由一个计时器 t 推导，暂停时 t 停止增长
const TICK = 50;
const Q_CHAR = 32;
const A_CHAR = 26;
const F_CHAR = 32;
const GAP_AFTER_QUESTION = 500;
const ANALYZE = 1100;
const HOLD = 3200;

function timeline(scene: Scene) {
  const qEnd = scene.question.length * Q_CHAR;
  const aStart = qEnd + GAP_AFTER_QUESTION;
  const aEnd = aStart + scene.answer.length * A_CHAR;
  const analyzeEnd = aEnd + ANALYZE;
  const fStart = analyzeEnd + 700;
  const fEnd = fStart + scene.followUp.length * F_CHAR;
  return { qEnd, aStart, aEnd, analyzeEnd, fStart, fEnd, total: fEnd + HOLD };
}

const chars = (text: string, elapsed: number, perChar: number) =>
  text.slice(0, Math.max(0, Math.min(text.length, Math.floor(elapsed / perChar))));

function Caret() {
  return (
    <span
      aria-hidden="true"
      className="ml-0.5 inline-block h-[1.1em] w-[2px] translate-y-[3px] animate-caret bg-brand-600"
    />
  );
}

function Waveform({ active }: { active: boolean }) {
  return (
    <span className="flex h-5 items-center gap-[3px]" aria-hidden="true">
      {Array.from({ length: 14 }).map((_, i) => (
        <span
          key={i}
          className={cn(
            'w-[3px] origin-center rounded-full transition-colors duration-300',
            active ? 'animate-wave bg-brand-600' : 'bg-line-strong'
          )}
          style={{
            height: `${8 + ((i * 7) % 12)}px`,
            animationDelay: `${(i % 5) * 0.11}s`,
            transform: active ? undefined : 'scaleY(0.35)',
          }}
        />
      ))}
    </span>
  );
}

export default function InterviewConsole() {
  const rootRef = useRef<HTMLDivElement>(null);
  const inView = useInView(rootRef, { amount: 0.3 });
  const reduceMotion = useReducedMotion();
  const [sceneIdx, setSceneIdx] = useState(0);
  const [t, setT] = useState(0);
  const [paused, setPaused] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);

  const scene = SCENES[sceneIdx];
  const tl = timeline(scene);
  // 减弱动态效果时直接显示每个场景的最终状态，不自动轮播
  const time = reduceMotion ? tl.fEnd : t;
  const playing = !reduceMotion && !paused && inView && pageVisible;

  useEffect(() => {
    const onVisibility = () => setPageVisible(!document.hidden);
    onVisibility();
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setT((prev) => prev + TICK), TICK);
    return () => clearInterval(id);
  }, [playing]);

  // 一个场景播完，切到下一种面试
  useEffect(() => {
    if (t >= tl.total) {
      setSceneIdx((i) => (i + 1) % SCENES.length);
      setT(0);
    }
  }, [t, tl.total]);

  const selectScene = (idx: number) => {
    setSceneIdx(idx);
    setT(0);
  };

  const question = chars(scene.question, time, Q_CHAR);
  const answer = chars(scene.answer, time - tl.aStart, A_CHAR);
  const followUp = chars(scene.followUp, time - tl.fStart, F_CHAR);
  const answering = time >= tl.aStart && time < tl.aEnd;
  const analyzing = time >= tl.aEnd && time < tl.analyzeEnd;
  const evaluated = time >= tl.analyzeEnd;
  const meta = INTERVIEW_TYPES[scene.kind];

  const status =
    time < tl.qEnd
      ? '面试官提问中'
      : time < tl.aStart
        ? '等待作答'
        : answering
          ? '正在作答'
          : analyzing
            ? 'AI 正在分析回答'
            : time < tl.fStart
              ? '已发现回答缺口'
              : time < tl.fEnd
                ? '面试官追问中'
                : '等待作答';

  return (
    <div
      ref={rootRef}
      role="region"
      aria-label="AI 模拟面试演示"
      className="relative overflow-hidden rounded-tile border border-line bg-white text-left shadow-console"
    >
      {!reduceMotion && <BorderBeam size={220} duration={12} />}

      {/* 顶栏：模式切换 + 进度 */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
        <div
          className="flex items-center gap-1 rounded-[10px] bg-canvas p-1"
          role="group"
          aria-label="切换面试类型"
        >
          {SCENES.map((s, i) => {
            const m = INTERVIEW_TYPES[s.kind];
            const active = i === sceneIdx;
            return (
              <button
                key={s.kind}
                type="button"
                aria-pressed={active}
                onClick={() => selectScene(i)}
                className={cn(
                  'inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] transition-[background-color,color,box-shadow] duration-150 sm:px-3',
                  active
                    ? 'bg-white font-medium text-ink shadow-xs'
                    : 'text-ink-secondary hover:text-ink'
                )}
              >
                <span className={cn('text-sm', active ? 'text-brand-700' : '')}>{m.icon}</span>
                {m.shortLabel}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-3 text-xs text-ink-secondary">
          <span className="hidden tabular-nums sm:inline">第 3 / 10 题</span>
          <span className="hidden h-3 w-px bg-line sm:inline-block" aria-hidden="true" />
          <span className="inline-flex items-center gap-1.5">
            <span
              className={cn('h-1.5 w-1.5 rounded-full', playing ? 'bg-brand-600' : 'bg-ink-muted')}
            />
            {status}
          </span>
          {!reduceMotion && (
            <button
              type="button"
              onClick={() => setPaused((p) => !p)}
              aria-label={paused ? '继续播放演示' : '暂停演示'}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-secondary transition-colors duration-150 hover:bg-canvas hover:text-ink"
            >
              {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>
      </div>

      <div className="grid md:grid-cols-[1fr_280px]">
        {/* 对话区 */}
        <div
          className="min-h-[340px] space-y-5 bg-canvas/60 px-4 py-5 sm:px-6 sm:py-6"
          aria-hidden="true"
        >
          <div>
            <div className="mb-1.5 flex items-center gap-1.5 text-xs text-ink-secondary">
              <span
                className={cn(
                  'flex h-5 w-5 items-center justify-center rounded-md text-[11px]',
                  meta.toneClass
                )}
              >
                {meta.icon}
              </span>
              {scene.asker}
            </div>
            <div className="max-w-[92%] rounded-card rounded-tl-md border border-line bg-white px-4 py-3 text-[15px] leading-7 text-ink">
              {question}
              {time < tl.qEnd && <Caret />}
            </div>
          </div>

          {time >= tl.aStart && (
            <div className="flex flex-col items-end">
              <div className="mb-1.5 text-xs text-ink-secondary">我</div>
              <div className="max-w-[88%] rounded-card rounded-tr-md bg-brand-50 px-4 py-3 text-[15px] leading-7 text-ink">
                {answer}
                {answering && <Caret />}
              </div>
            </div>
          )}

          {analyzing && (
            <div className="flex items-center gap-2 text-[13px] text-ink-secondary">
              <Sparkles className="h-3.5 w-3.5 text-brand-700" />
              正在对照考察要点分析回答
              <span className="flex gap-0.5">
                {[0, 1, 2].map((d) => (
                  <span
                    key={d}
                    className="h-1 w-1 animate-dot rounded-full bg-ink-secondary"
                    style={{ animationDelay: `${d * 0.16}s` }}
                  />
                ))}
              </span>
            </div>
          )}

          {evaluated && (
            <div className="animate-fade-in space-y-5">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-warning/30 bg-warning-soft px-3 py-1 text-[13px] text-warning">
                <AlertCircle className="h-3.5 w-3.5" />
                发现缺口：{scene.gap}
              </div>
              {time >= tl.fStart && (
                <div>
                  <div className="mb-1.5 text-xs font-medium text-brand-800">
                    {scene.followUpAsker}
                  </div>
                  <div className="max-w-[92%] rounded-card rounded-tl-md border border-brand-200 bg-white px-4 py-3 text-[15px] leading-7 text-ink">
                    {followUp}
                    {time < tl.fEnd && <Caret />}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 实时评估 */}
        <aside
          className="border-t border-line px-5 py-5 md:border-l md:border-t-0"
          aria-hidden="true"
        >
          <div className="text-[13px] font-medium text-ink">本题评估</div>
          <ul className="mt-4 space-y-4">
            {scene.scores.map((s) => (
              <li key={s.label}>
                <div className="flex items-baseline justify-between text-[13px]">
                  <span className="text-ink-secondary">{s.label}</span>
                  <span className="tabular-nums text-ink">{evaluated ? s.value : '–'}</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-canvas">
                  <div
                    className="h-full rounded-full bg-brand-600 transition-[width] duration-700 ease-out"
                    style={{ width: evaluated ? `${s.value}%` : '0%' }}
                  />
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-6 text-[13px] font-medium text-ink">考察要点</div>
          <ul className="mt-3 space-y-2 text-[13px]">
            {scene.points.map((p) => (
              <li key={p.text} className="flex items-center gap-2">
                {!evaluated ? (
                  <Circle className="h-3.5 w-3.5 text-line-strong" />
                ) : p.hit ? (
                  <Check className="h-3.5 w-3.5 text-brand-700" />
                ) : (
                  <AlertCircle className="h-3.5 w-3.5 text-warning" />
                )}
                <span className={evaluated && !p.hit ? 'text-warning' : 'text-ink-secondary'}>
                  {p.text}
                </span>
              </li>
            ))}
          </ul>
        </aside>
      </div>

      {/* 输入栏 */}
      <div
        className="flex items-center justify-between gap-4 border-t border-line px-4 py-3 sm:px-5"
        aria-hidden="true"
      >
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={cn(
              'flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors duration-300',
              answering ? 'bg-brand-600 text-white' : 'bg-canvas text-ink-secondary'
            )}
          >
            <Mic className="h-4 w-4" />
          </span>
          <Waveform active={answering && playing} />
          <span className="truncate text-xs text-ink-secondary">
            {answering ? '语音作答中，识别结果实时填入' : '支持语音或文字作答'}
          </span>
        </div>
        <span className="hidden shrink-0 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white shadow-btn sm:inline">
          发送
        </span>
      </div>
    </div>
  );
}
