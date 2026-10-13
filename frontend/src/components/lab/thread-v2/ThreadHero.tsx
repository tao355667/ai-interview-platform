'use client';

import Link from 'next/link';
import { ArrowRight, CornerDownLeft } from 'lucide-react';
import type { CSSProperties, FormEvent, KeyboardEvent } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { INTERVIEW_TYPES } from '@/config/interviewTypes';
import { cn } from '@/lib/cn';
import { createSim, createThreadRenderer, spawnBead } from './threadRenderer';
import type { ThreadSim } from './threadRenderer';
import { OPENING_QUESTION, SAMPLE_ANSWER, pickFollowUp, syllablesOf } from './script';
import s from './thread.module.css';

type Phase = 'idle' | 'listen' | 'think' | 'speak';
type Weights = [number, number, number, number];

const SHAPES: Record<Phase, Weights> = {
  idle: [1, 0, 0, 0],
  listen: [0, 1, 0, 0],
  think: [0, 0, 1, 0],
  speak: [0, 0, 0, 1],
};

const PHASE_LABEL: Record<Phase, string> = {
  idle: '面试官在等你开口',
  listen: '正在听你说',
  think: '正在想下一个问题',
  speak: '追问',
};

const STEPS: { phase: Phase; title: string; detail: string }[] = [
  { phase: 'listen', title: '倾听', detail: '听完你的回答' },
  { phase: 'think', title: '思考', detail: '对照简历和岗位' },
  { phase: 'speak', title: '追问', detail: '顺着你说的往下问' },
];

const STRANDS = ['你的回答', '你的简历', '岗位要求'];

const HEADLINE = ['答完这一题，', '面试官', '还会追问。'];
/** 标题阶梯缩进：每行向右下方的装置让出一步 */
const INDENT = ['', 'ml-[1em]', 'ml-[2em]'];

const NEXT_CARDS = [INTERVIEW_TYPES.social, INTERVIEW_TYPES.campus, INTERVIEW_TYPES.special];

/** 一个字沿导线从装置走到卡片（或反过来）所用的时间，秒 */
const TRAVEL = 0.75;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
/** 与帧率无关的指数趋近 */
const approach = (from: number, to: number, rate: number, dt: number) =>
  from + (to - from) * (1 - Math.exp(-rate * dt));

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return reduced;
}

/** 装置在不同屏宽下的位置和尺度 */
function layoutFor(w: number, h: number) {
  if (w >= 1024)
    return { cx: w * 0.71, cy: 64 + (h - 64) * 0.38, scale: Math.min(w * 0.21, h * 0.38) };
  if (w >= 640) return { cx: w * 0.6, cy: 64 + w * 0.24, scale: w * 0.26 };
  return { cx: w * 0.56, cy: 64 + w * 0.38, scale: w * 0.36 };
}

interface Speech {
  syl: { at: number; amp: number }[];
  start: number;
  /** 已发声的音节数 / 已出现在卡片上的字数 */
  emitted: number;
  shown: number;
  /** 是开场提问（保持丝带形态）还是追问（切换到声波形态） */
  opening: boolean;
}

export default function ThreadHero() {
  const reduced = useReducedMotion();
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const cardLayerRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const portRef = useRef<HTMLSpanElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const simRef = useRef<ThreadSim>(createSim());
  const dirtyRef = useRef(true);
  const introStartRef = useRef(0);
  const introAskedRef = useRef(false);
  const morphDurRef = useRef(1.4);
  const phaseRef = useRef<Phase>('idle');
  const speechRef = useRef<Speech | null>(null);
  const eventsRef = useRef<{ at: number; fn: () => void }[]>([]);
  const timersRef = useRef<number[]>([]);
  const exciteTargetRef = useRef(0);
  const portGlowRef = useRef(0);
  const prevAnswerRef = useRef('');

  const [webgl, setWebgl] = useState(true);
  const [introKey, setIntroKey] = useState(0);
  const [phase, setPhase] = useState<Phase>('idle');
  const [asking, setAsking] = useState(true);
  const [question, setQuestion] = useState(OPENING_QUESTION);
  const [spoken, setSpoken] = useState(0);
  const [answer, setAnswer] = useState('');
  const [lastAnswer, setLastAnswer] = useState<string | null>(null);
  const [round, setRound] = useState(1);
  const [strands, setStrands] = useState(0);
  const [autoTyping, setAutoTyping] = useState(false);

  const later = (fn: () => void, ms: number) => {
    timersRef.current.push(window.setTimeout(fn, ms));
  };
  const clearTimers = () => {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
    eventsRef.current = [];
  };
  /** 按装置自己的时钟安排事件，保证光点到达和文字出现严格同步 */
  const at = useCallback((delay: number, fn: () => void) => {
    if (reducedRef.current || delay <= 0) fn();
    else eventsRef.current.push({ at: simRef.current.time + delay, fn });
  }, []);

  const conduitOn = () => simRef.current.conduit > 0.5 && !reducedRef.current;

  /** 切换形态：从当前的混合状态出发，线一根根迁移到新形态 */
  const go = useCallback((next: Phase, duration = 1.4) => {
    const sim = simRef.current;
    const k = sim.morph;
    sim.from = sim.from.map((f, i) => f + (sim.to[i] - f) * k) as Weights;
    sim.to = [...SHAPES[next]] as Weights;
    sim.morph = reducedRef.current ? 1 : 0;
    morphDurRef.current = duration;
    dirtyRef.current = true;
    phaseRef.current = next;
    setPhase(next);
  }, []);

  /** 耳蜗上的一次涟漪 */
  const ripple = useCallback(() => {
    const sim = simRef.current;
    sim.impulses.copyWithin(1, 0);
    sim.impulses[0] = sim.time;
    sim.energy = Math.min(1, sim.energy + 0.3);
    dirtyRef.current = true;
  }, []);

  /** 你打的一个字：从卡片沿导线走进装置，到达时耳蜗泛起涟漪 */
  const sendKeystroke = useCallback(() => {
    if (!conduitOn()) {
      ripple();
      return;
    }
    portGlowRef.current = 1;
    spawnBead(simRef.current, { u: Math.random(), t0: 1, t1: 0, dur: TRAVEL, conduit: true });
    at(TRAVEL, ripple);
  }, [at, ripple]);

  /** 面试官说话：每个字先在装置里发声，再化作光点沿导线落进卡片，落下时才显示 */
  const speak = useCallback(
    (text: string, opening = false) => {
      setQuestion(text);
      setAsking(opening);
      if (!opening) go('speak', 1.2);
      if (reducedRef.current) {
        setSpoken(text.length);
        speechRef.current = null;
        if (!opening) later(() => go('listen', 1.4), 1500);
        else setAsking(false);
        return;
      }
      setSpoken(0);
      speechRef.current = {
        syl: syllablesOf(text),
        start: simRef.current.time + (opening ? 0.2 : 0.9),
        emitted: 0,
        shown: 0,
        opening,
      };
    },
    [go]
  );

  const submit = useCallback(
    (text: string) => {
      const value = text.trim();
      if (!value) {
        inputRef.current?.focus();
        return;
      }
      clearTimers();
      speechRef.current = null;
      setAsking(false);
      setLastAnswer(value);
      setAnswer('');
      prevAnswerRef.current = '';
      setStrands(0);
      go('think', 1.9);
      later(() => setStrands(1), 500);
      later(() => setStrands(2), 1000);
      later(() => setStrands(3), 1500);
      later(() => {
        setRound((r) => r + 1);
        speak(pickFollowUp(value));
      }, 3200);
    },
    [go, speak]
  );

  const playSample = () => {
    if (autoTyping) return;
    clearTimers();
    setAutoTyping(true);
    if (phaseRef.current !== 'listen') go('listen', 1.4);
    const chars = Array.from(SAMPLE_ANSWER);
    let acc = '';
    chars.forEach((ch, i) => {
      later(
        () => {
          acc += ch;
          setAnswer(acc);
          prevAnswerRef.current = acc;
          sendKeystroke();
        },
        700 + i * 60
      );
    });
    later(
      () => {
        setAutoTyping(false);
        submit(SAMPLE_ANSWER);
      },
      700 + chars.length * 60 + 900
    );
  };

  const replayIntro = () => {
    clearTimers();
    speechRef.current = null;
    const sim = simRef.current;
    sim.reveal = 0;
    sim.unfurl = 0;
    sim.mouth[3] = 0;
    sim.from = [...SHAPES.idle] as Weights;
    sim.to = [...SHAPES.idle] as Weights;
    sim.morph = 1;
    phaseRef.current = 'idle';
    introAskedRef.current = false;
    setPhase('idle');
    setAsking(true);
    setQuestion(OPENING_QUESTION);
    setSpoken(0);
    setLastAnswer(null);
    setAnswer('');
    prevAnswerRef.current = '';
    setRound(1);
    setAutoTyping(false);
    introStartRef.current = performance.now();
    setIntroKey((k) => k + 1);
    window.scrollTo({ top: 0 });
  };

  // 渲染循环、指针、滚动
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const small = window.innerWidth < 768 || (navigator.hardwareConcurrency || 8) <= 4;
    const renderer = createThreadRenderer(
      canvas,
      small ? { fibers: 84, segments: 170 } : { fibers: 150, segments: 260 }
    );
    if (!renderer) {
      setWebgl(false);
      return;
    }
    const sim = simRef.current;
    let base = layoutFor(window.innerWidth, window.innerHeight);

    const resize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      renderer.resize(w, h, Math.min(window.devicePixelRatio || 1, 2));
      base = layoutFor(w, h);
      // 只有宽屏上卡片在装置正下方，才用导线把两者连起来
      sim.conduit = w >= 1024 ? 1 : 0;
      dirtyRef.current = true;
    };
    resize();
    window.addEventListener('resize', resize);

    const pointer = { x: 0, y: 0, inside: false, fresh: true };
    const onMove = (e: PointerEvent) => {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      pointer.inside = e.pointerType === 'mouse';
    };
    const onLeave = () => {
      pointer.inside = false;
      pointer.fresh = true;
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave);
    window.addEventListener('blur', onLeave);
    const onScroll = () => {
      dirtyRef.current = true;
    };
    window.addEventListener('scroll', onScroll, { passive: true });

    const anchorEls = Array.from(document.querySelectorAll<HTMLElement>('[data-thread-anchor]'));
    let last = performance.now();
    introStartRef.current = last;
    let nextGesture = 7;
    let nextThought = 0;
    let raf = 0;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const still = reducedRef.current;
      const w = window.innerWidth;
      const h = window.innerHeight;
      const y = window.scrollY;
      const el = (now - introStartRef.current) / 1000;

      // 对话卡片的顶边是导线的终点
      const card = formRef.current?.getBoundingClientRect();
      if (card) sim.mouth.set([card.left + card.width / 2, card.top + 1, card.width], 0);

      if (still) {
        // 减弱动态效果：固定在一帧静止画面，只在状态或布局变化时重绘
        sim.time = 8;
        sim.reveal = 1;
        sim.unfurl = 1;
        sim.mouth[3] = 1;
        sim.morph = 1;
        sim.hover = 0;
        if (!introAskedRef.current) {
          introAskedRef.current = true;
          setSpoken(OPENING_QUESTION.length);
          setAsking(false);
        }
      } else {
        sim.time += dt;
        sim.reveal = easeInOut(clamp01((el - 0.2) / 2));
        sim.unfurl = easeOut(clamp01((el - 1.6) / 1.8));
        sim.mouth[3] = easeInOut(clamp01((el - 2.5) / 1.1));
        sim.morph = Math.min(1, sim.morph + dt / morphDurRef.current);
        sim.energy *= Math.exp(-dt * 1.4);
        sim.excite = approach(sim.excite, exciteTargetRef.current, 4, dt);

        // 开场的最后一拍：导线接上卡片，面试官提出第一个问题
        if (!introAskedRef.current && el > 3.5) {
          introAskedRef.current = true;
          speak(OPENING_QUESTION, true);
        }

        // 鼠标：位置用临界阻尼平滑，速度再做一次低通，不会过冲
        if (pointer.inside) {
          if (pointer.fresh) {
            sim.mouse = [pointer.x, pointer.y];
            pointer.fresh = false;
          }
          const nx = approach(sim.mouse[0], pointer.x, 12, dt);
          const ny = approach(sim.mouse[1], pointer.y, 12, dt);
          const vx = (nx - sim.mouse[0]) / Math.max(dt, 1e-3);
          const vy = (ny - sim.mouse[1]) / Math.max(dt, 1e-3);
          sim.mouseVel = [
            approach(sim.mouseVel[0], vx, 5, dt),
            approach(sim.mouseVel[1], vy, 5, dt),
          ];
          const sp = Math.hypot(sim.mouseVel[0], sim.mouseVel[1]);
          if (sp > 1500)
            sim.mouseVel = [(sim.mouseVel[0] * 1500) / sp, (sim.mouseVel[1] * 1500) / sp];
          sim.mouse = [nx, ny];
        } else {
          sim.mouseVel = [approach(sim.mouseVel[0], 0, 5, dt), approach(sim.mouseVel[1], 0, 5, dt)];
        }
        sim.hover = approach(sim.hover, pointer.inside ? 1 : 0, 4, dt);

        // 到点的事件（光点到达、涟漪）
        if (eventsRef.current.length) {
          const due = eventsRef.current.filter((e) => e.at <= sim.time);
          if (due.length) {
            eventsRef.current = eventsRef.current.filter((e) => e.at > sim.time);
            due.forEach((e) => e.fn());
          }
        }

        // 说话：音节在装置里发声，同时化作光点沿导线落下，落到卡片时才显示这个字
        const sp = speechRef.current;
        if (sp) {
          const travel = conduitOn() ? TRAVEL : 0;
          while (sp.emitted < sp.syl.length && sim.time >= sp.start + sp.syl[sp.emitted].at) {
            const { amp } = sp.syl[sp.emitted];
            sim.syllables.copyWithin(2, 0, sim.syllables.length - 2);
            sim.syllables[0] = sim.time;
            sim.syllables[1] = amp * (sp.opening ? 0.7 : 1);
            if (amp > 0 && travel > 0) {
              spawnBead(sim, { u: Math.random(), t0: 0, t1: 1, dur: travel, conduit: true });
            }
            sp.emitted++;
          }
          let shownChanged = false;
          while (sp.shown < sp.syl.length && sim.time >= sp.start + sp.syl[sp.shown].at + travel) {
            sp.shown++;
            shownChanged = true;
          }
          if (shownChanged) {
            setSpoken(sp.shown);
            portGlowRef.current = 1;
          }
          if (sp.shown >= sp.syl.length) {
            speechRef.current = null;
            if (sp.opening) {
              setAsking(false);
            } else {
              later(() => {
                if (phaseRef.current === 'speak') go('listen', 1.5);
              }, 1800);
            }
          }
        }

        // 思考：光点沿编织的三股线流动，像念头在线索之间来回
        if (phaseRef.current === 'think' && sim.time > nextThought) {
          nextThought = sim.time + 0.11;
          spawnBead(sim, {
            u: Math.random(),
            t0: 0.04,
            t1: 0.96,
            dur: 1.5 + Math.random() * 0.6,
            conduit: false,
            size: 3.5,
          });
        }

        // 待命时偶尔做一个小动作，避免机械重复：波动、吸气，或从卡片传来一次心跳
        if (phaseRef.current === 'idle' && !speechRef.current && sim.time > nextGesture) {
          nextGesture = sim.time + 5.5 + Math.random() * 3;
          const r = Math.random();
          if (r < 0.4) sim.gesture = [sim.time, 0];
          else if (r < 0.7 || !conduitOn()) sim.gesture = [sim.time, 1];
          else {
            spawnBead(sim, { u: Math.random(), t0: 1, t1: 0, dur: 1.1, conduit: true, size: 4 });
            at(1.1, () => {
              sim.gesture = [sim.time, 0];
            });
          }
        }

        portGlowRef.current *= Math.exp(-dt * 3);
        if (portRef.current) portRef.current.style.opacity = String(portGlowRef.current * 0.9);
      }

      // 滚动：装置以半速上移（景深），线垂向下一章节的卡片
      const anchorsY: number[] = [];
      anchorEls.forEach((a, i) => {
        const r = a.getBoundingClientRect();
        sim.anchors[i * 4] = r.left + r.width / 2;
        sim.anchors[i * 4 + 1] = r.top;
        sim.anchors[i * 4 + 2] = r.width;
        anchorsY.push(r.top);
      });
      const firstAnchor = anchorsY.length ? Math.min(...anchorsY) : h;
      textLayerRef.current?.querySelectorAll('[data-shield]').forEach((node, i) => {
        const r = node.getBoundingClientRect();
        sim.shield.set(
          [r.left, r.top + r.height * 0.12, r.right, r.bottom - r.height * 0.08],
          i * 4
        );
      });
      sim.cx = base.cx;
      sim.cy = base.cy - y * (still ? 1 : 0.5);
      sim.scale = base.scale;
      if (still) {
        sim.scroll = 0;
        sim.fade = 1 - clamp01(y / (h * 0.7));
      } else {
        sim.scroll = clamp01(y / (h * 0.85));
        sim.fade = clamp01((firstAnchor + h * 0.05) / (h * 0.35));
        const attached = sim.scroll > 0.95 && sim.fade > 0.3;
        anchorEls.forEach((a) => {
          if (a.dataset.attached !== String(attached)) a.dataset.attached = String(attached);
        });
        if (textLayerRef.current) {
          textLayerRef.current.style.transform = `translate3d(0, ${-y * 0.28}px, 0)`;
          textLayerRef.current.style.opacity = String(1 - clamp01(y / (h * 0.75)));
        }
        if (cardLayerRef.current) {
          cardLayerRef.current.style.transform = `translate3d(0, ${-y * 0.12}px, 0)`;
        }
      }

      if (still && !dirtyRef.current) return;
      dirtyRef.current = false;
      renderer.render(sim);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('blur', onLeave);
      window.removeEventListener('scroll', onScroll);
      renderer.dispose();
    };
    // 回调都是稳定的 useCallback，渲染循环只在挂载时建立一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    dirtyRef.current = true;
    if (reduced && textLayerRef.current && cardLayerRef.current) {
      textLayerRef.current.style.transform = '';
      textLayerRef.current.style.opacity = '';
      cardLayerRef.current.style.transform = '';
    }
  }, [reduced]);

  useEffect(() => () => clearTimers(), []);

  // 停止输入一段时间后，面试官回到待命
  useEffect(() => {
    if (phase !== 'listen' || autoTyping) return;
    const id = window.setTimeout(() => {
      if (phaseRef.current === 'listen' && document.activeElement !== inputRef.current)
        go('idle', 1.8);
    }, 9000);
    return () => window.clearTimeout(id);
  }, [phase, answer, autoTyping, go]);

  const onInput = (value: string) => {
    // 只有新输入的字才沿导线送出去，删除不算
    const added = Math.max(0, Array.from(value).length - Array.from(prevAnswerRef.current).length);
    prevAnswerRef.current = value;
    setAnswer(value);
    for (let i = 0; i < Math.min(added, 4); i++) sendKeystroke();
    if (phaseRef.current === 'idle') go('listen', 1.5);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit(answer);
    }
    if (e.key === 'Escape') {
      inputRef.current?.blur();
      go('idle', 1.6);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit(answer);
  };

  /** 悬停在主要操作上时，装置收紧、导线变亮，像在期待你点击 */
  const anticipate = (level: number) => ({
    onMouseEnter: () => (exciteTargetRef.current = level),
    onMouseLeave: () => (exciteTargetRef.current = 0),
    onFocus: () => (exciteTargetRef.current = level),
    onBlur: () => (exciteTargetRef.current = 0),
  });

  const busy = phase === 'think' || phase === 'speak' || autoTyping;
  const activeStep = STEPS.findIndex((st) => st.phase === phase);
  const typing = (phase === 'speak' || asking) && spoken < question.length;
  const statusLabel = asking ? '正在提问' : PHASE_LABEL[phase];
  let charIndex = 0;

  return (
    <div className="relative isolate">
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 h-full w-full"
      />

      <section
        aria-label="首屏"
        className="relative z-10 min-h-[calc(100svh-64px)] overflow-x-clip"
      >
        <div className="page relative flex min-h-[calc(100svh-64px)] flex-col pb-10 pt-[80vw] sm:pt-[52vw] lg:pt-[8vh]">
          <div ref={textLayerRef} key={`t${introKey}`} className="relative will-change-transform">
            <p
              className={cn(s.rise, 'flex items-center gap-2 text-[13px] text-ink-secondary')}
              style={{ '--d': 150 } as CSSProperties}
            >
              <span className="font-mono text-brand-800">面策</span>
              <span className="h-px w-8 bg-line-strong" aria-hidden="true" />
              AI 模拟面试
            </p>

            <h1 className="mt-6 text-[clamp(2.75rem,6.4vw,6.5rem)] font-semibold leading-[1.06] tracking-[-0.035em] text-ink">
              {HEADLINE.map((line, li) => (
                <span key={line} data-shield className={cn(s.line, INDENT[li])}>
                  {Array.from(line).map((ch, ci) => {
                    const d = 380 + charIndex++ * 55 + li * 120;
                    const accent = li === 2 && (ci === 2 || ci === 3);
                    return (
                      <span
                        key={ci}
                        className={cn(s.char, accent && 'text-brand-700')}
                        style={{ '--d': d } as CSSProperties}
                      >
                        {ch}
                      </span>
                    );
                  })}
                </span>
              ))}
            </h1>

            <p
              className={cn(
                s.rise,
                'mt-8 max-w-[25em] text-[17px] leading-8 text-ink-secondary lg:ml-[0.4em]'
              )}
              style={{ '--d': 1500 } as CSSProperties}
            >
              它读过你的简历，会听完你的每一句回答，再顺着你说的继续往下问。结束后逐题告诉你，哪里答得好，哪里还差一点。
            </p>

            <div
              className={cn(s.rise, 'mt-9 flex flex-wrap items-center gap-3 lg:ml-[0.4em]')}
              style={{ '--d': 1700 } as CSSProperties}
            >
              <Link
                href="/interview/social"
                className="link-btn-primary link-btn-lg"
                {...anticipate(1)}
              >
                开始模拟面试
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link href="/resume" className="link-btn-default link-btn-lg" {...anticipate(0.5)}>
                用简历押题
              </Link>
            </div>
          </div>

          {/* 对话卡片：导线从装置落进它的顶边，字沿着导线来回 */}
          <div
            ref={cardLayerRef}
            className="relative mt-12 w-full max-w-[420px] will-change-transform lg:absolute lg:bottom-[7vh] lg:right-8 lg:mt-0"
          >
            <form
              ref={formRef}
              key={`c${introKey}`}
              onSubmit={onSubmit}
              onMouseEnter={() => (exciteTargetRef.current = 0.35)}
              onMouseLeave={() => (exciteTargetRef.current = 0)}
              className={cn(
                s.rise,
                'relative rounded-tile border border-line bg-white/90 p-5 shadow-card backdrop-blur-sm'
              )}
              style={{ '--d': 2300 } as CSSProperties}
            >
              {/* 导线的接口：有字经过时亮一下 */}
              <span
                ref={portRef}
                aria-hidden="true"
                className="pointer-events-none absolute -top-px left-1/2 h-[2px] w-1/2 -translate-x-1/2 bg-gradient-to-r from-transparent via-brand-600 to-transparent opacity-0"
              />
              <div className="flex items-center justify-between text-[13px] text-ink-secondary">
                <span className="tabular-nums">第 {round} 问 · 后端开发</span>
                <span className="flex items-center gap-2" aria-hidden="true">
                  <span className="relative flex h-2 w-2">
                    <span
                      className={cn(
                        'absolute inset-0 rounded-full bg-brand-600',
                        phase === 'listen' && s.pulse,
                        (phase === 'think' || asking) && s.pulseFast
                      )}
                    />
                    <span
                      className={cn(
                        'relative h-2 w-2 rounded-full',
                        phase === 'idle' && !asking ? 'bg-line-strong' : 'bg-brand-600'
                      )}
                    />
                  </span>
                  {statusLabel}
                </span>
              </div>

              {lastAnswer && (
                <p className="mt-4 line-clamp-1 border-l-2 border-line pl-3 text-[13px] text-ink-muted">
                  你：{lastAnswer}
                </p>
              )}

              <p className="mt-3 min-h-[3.5em] text-[17px] font-medium leading-7 text-ink">
                {question.slice(0, spoken)}
                {typing && (
                  <span
                    className="ml-0.5 inline-block h-[1.1em] w-[2px] translate-y-[3px] animate-caret bg-brand-600"
                    aria-hidden="true"
                  />
                )}
              </p>

              {phase === 'think' ? (
                <div className="mt-4 min-h-[76px]">
                  <p className="text-[13px] text-ink-secondary">把三条线索编在一起</p>
                  <ul className="mt-2.5 flex flex-wrap gap-2">
                    {STRANDS.slice(0, strands).map((st) => (
                      <li
                        key={st}
                        className={cn(
                          s.strand,
                          'rounded-full bg-brand-50 px-2.5 py-1 text-[13px] text-brand-800'
                        )}
                      >
                        {st}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <>
                  <label htmlFor="thread-answer" className="sr-only">
                    你的回答
                  </label>
                  <textarea
                    id="thread-answer"
                    ref={inputRef}
                    value={answer}
                    rows={2}
                    disabled={phase === 'speak'}
                    readOnly={autoTyping}
                    onChange={(e) => onInput(e.target.value)}
                    onFocus={() => phaseRef.current === 'idle' && go('listen', 1.5)}
                    onKeyDown={onKeyDown}
                    placeholder="在这里回答，按 Enter 提交"
                    className="mt-4 block w-full resize-none rounded-[10px] border border-line-strong bg-white px-3.5 py-2.5 text-base leading-6 text-ink outline-none transition-colors placeholder:text-ink-muted focus:border-brand-600 disabled:bg-canvas"
                  />
                </>
              )}

              <div className="mt-3 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={playSample}
                  disabled={busy}
                  className="h-11 rounded-[10px] px-2 text-[14px] text-brand-800 transition-colors hover:text-brand-900 disabled:text-ink-muted"
                >
                  用示例回答试试
                </button>
                <button
                  type="submit"
                  disabled={busy || !answer.trim()}
                  className="inline-flex h-11 items-center gap-2 rounded-[10px] bg-ink px-4 text-[14px] font-medium text-white transition-[background-color,opacity] hover:bg-ink/85 disabled:opacity-35"
                >
                  提交回答
                  <CornerDownLeft className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>

              <p className="sr-only" aria-live="polite">
                {!typing && (phase === 'speak' || spoken >= question.length)
                  ? `面试官${round > 1 ? '追问' : '提问'}：${question}`
                  : statusLabel}
              </p>
            </form>
          </div>

          {/* 倾听 → 思考 → 追问：真实的先后顺序 */}
          <ol
            key={`s${introKey}`}
            className={cn(s.rise, 'mt-auto hidden gap-10 pt-16 lg:flex')}
            style={{ '--d': 2600 } as CSSProperties}
          >
            {STEPS.map((st, i) => (
              <li key={st.phase} className="w-40">
                <div className="relative h-px bg-line-strong">
                  <span
                    className="absolute inset-y-0 left-0 bg-brand-600 transition-[width] duration-700"
                    style={{ width: activeStep >= i ? '100%' : '0%' }}
                  />
                </div>
                <p
                  className={cn(
                    'mt-3 text-[15px] font-medium transition-colors',
                    activeStep === i ? 'text-ink' : 'text-ink-muted'
                  )}
                >
                  {st.title}
                </p>
                <p className="mt-0.5 text-[13px] text-ink-secondary">{st.detail}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* 下一章：线从首屏垂下来，接到三张卡片上 */}
      <section aria-labelledby="next-title" className="relative z-10 pb-32 pt-[32vh]">
        <div className="page">
          <p className="eyebrow">三种面试</p>
          <h2 id="next-title" className="mt-3 max-w-xl text-title text-ink">
            同一位面试官，三种问法
          </h2>
          <div className="mt-14 grid gap-5 md:grid-cols-3">
            {NEXT_CARDS.map((t) => (
              <Link
                key={t.kind}
                href={t.href}
                data-thread-anchor
                className={cn(
                  s.port,
                  'surface-interactive group flex min-h-[200px] flex-col border-t-2 bg-white p-6'
                )}
              >
                <span
                  className={cn(
                    'grid h-10 w-10 place-items-center rounded-[10px] text-lg',
                    t.toneClass
                  )}
                >
                  {t.icon}
                </span>
                <span className="mt-auto pt-10 text-xl font-semibold text-ink">{t.label}</span>
                <span className="mt-2 text-[15px] leading-7 text-ink-secondary">
                  {t.description}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {!webgl && <p className="sr-only">当前浏览器不支持 WebGL，动态装置已隐藏。</p>}

      <PrototypeControls
        phase={phase}
        onPhase={(p) => {
          clearTimers();
          speechRef.current = null;
          setAutoTyping(false);
          setAsking(false);
          if (p === 'speak') {
            speak(pickFollowUp(lastAnswer ?? SAMPLE_ANSWER));
          } else {
            if (p === 'think') setStrands(3);
            setSpoken(question.length);
            go(p, p === 'think' ? 1.9 : 1.5);
          }
        }}
        onReplay={replayIntro}
      />
    </div>
  );
}

/** 原型调试条：直接切换各个状态，方便评估效果。正式版会去掉 */
function PrototypeControls({
  phase,
  onPhase,
  onReplay,
}: {
  phase: Phase;
  onPhase: (p: Phase) => void;
  onReplay: () => void;
}) {
  const items: { p: Phase; label: string }[] = [
    { p: 'idle', label: '待命' },
    { p: 'listen', label: '倾听' },
    { p: 'think', label: '思考' },
    { p: 'speak', label: '回应' },
  ];
  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-1 rounded-full border border-line bg-white/90 p-1 text-[13px] shadow-pop backdrop-blur">
      <span className="hidden px-2 text-ink-muted sm:inline">原型调试</span>
      {items.map((it) => (
        <button
          key={it.p}
          type="button"
          onClick={() => onPhase(it.p)}
          aria-pressed={phase === it.p}
          className={cn(
            'h-8 rounded-full px-3 transition-colors',
            phase === it.p
              ? 'bg-ink text-white'
              : 'text-ink-secondary hover:bg-canvas hover:text-ink'
          )}
        >
          {it.label}
        </button>
      ))}
      <button
        type="button"
        onClick={onReplay}
        className="h-8 rounded-full px-3 text-ink-secondary transition-colors hover:bg-canvas hover:text-ink"
      >
        重播开场
      </button>
    </div>
  );
}
