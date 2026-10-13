'use client';

import Link from 'next/link';
import { ArrowRight, CornerDownLeft } from 'lucide-react';
import type { CSSProperties, FormEvent, KeyboardEvent } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { SHIELD_SLOTS, createCrystalRenderer, createSim } from './hero/crystalRenderer';
import type { CrystalSim } from './hero/crystalRenderer';
import { OPENING_QUESTION, SAMPLE_ANSWER, pickFollowUp, syllablesOf } from './hero/script';
import s from './hero/hero.module.css';

type Phase = 'idle' | 'listen' | 'think' | 'speak';
type Weights = [number, number, number, number];

const SHAPES: Record<Phase, Weights> = {
  idle: [1, 0, 0, 0],
  listen: [0, 1, 0, 0],
  think: [0, 0, 1, 0],
  speak: [0, 0, 0, 1],
};

/** 每个状态下外壳的镂空程度、纹理流速、自转速度 */
const CAGE: Record<Phase, { open: number; flow: number; spin: number }> = {
  idle: { open: 0.3, flow: 0.22, spin: 0.12 },
  listen: { open: 0.18, flow: 0.1, spin: 0.05 },
  think: { open: 0.55, flow: 1.1, spin: 0.5 },
  speak: { open: 0.28, flow: 0.4, spin: 0.2 },
};

const PHASE_LABEL: Record<Phase, string> = {
  idle: '等你开口',
  listen: '正在听你说',
  think: '正在想下一个问题',
  speak: '正在追问',
};

const STEPS: { phase: Phase; title: string }[] = [
  { phase: 'listen', title: '倾听' },
  { phase: 'think', title: '思考' },
  { phase: 'speak', title: '追问' },
];

const STRANDS = ['你的回答', '你的简历', '岗位要求'];

// 占位数据：与首页统计保持一致，上线前替换为真实数字
const AVATARS = [
  { ch: '林', tone: 'bg-brand-100 text-brand-800' },
  { ch: '周', tone: 'bg-accent-100 text-accent-700' },
  { ch: '陈', tone: 'bg-violet-50 text-violet-600' },
];

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOutBack = (t: number) => {
  const c = 1.4;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};
/** 与帧率无关的指数趋近 */
const approach = (from: number, to: number, rate: number, dt: number) =>
  from + (to - from) * (1 - Math.exp(-rate * dt));

const delay = (d: number) => ({ '--d': d }) as CSSProperties;

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

interface Speech {
  syl: { at: number; amp: number }[];
  start: number;
  shown: number;
  /** 开场提问保持待命形态；追问切换到声波形态 */
  opening: boolean;
}

/**
 * 首屏：左边是标题和行动按钮，右边是「线索」装置——镂空金属外壳包着一颗透明水晶，
 * 三道丝线轨道环绕着它。右下的玻璃卡片可以直接作答，装置随之倾听、思考、追问。
 * 往下滚动时，轨道环断开、垂下来接到「四种面试模式」的卡片上（data-thread-anchor）。
 */
export default function Hero({ debug = false }: { debug?: boolean }) {
  const reduced = useReducedMotion();
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const simRef = useRef<CrystalSim>(createSim());
  const dirtyRef = useRef(true);
  const introStartRef = useRef(0);
  const introAskedRef = useRef(false);
  const morphDurRef = useRef(1.4);
  const phaseRef = useRef<Phase>('idle');
  const speechRef = useRef<Speech | null>(null);
  const timersRef = useRef<number[]>([]);
  const exciteTargetRef = useRef(0);
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
  };

  /** 切换形态：轨道环一根根迁移到新形态，核心平滑过渡 */
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

  /** 你打的每个字都在水晶表面激起一道朝向卡片的涟漪 */
  const ripple = useCallback(() => {
    const sim = simRef.current;
    sim.impulses.copyWithin(1, 0);
    sim.impulses[0] = sim.time;
    sim.energy = Math.min(1, sim.energy + 0.3);
    dirtyRef.current = true;
  }, []);

  /** 面试官说话：每个字在水晶里发一次声，同时逐字出现在卡片上 */
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
        start: simRef.current.time + (opening ? 0.1 : 0.9),
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
    speechRef.current = null;
    setAsking(false);
    setSpoken(question.length);
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
          ripple();
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
    sim.grow = 0;
    sim.open = 0;
    sim.from = [...SHAPES.idle] as Weights;
    sim.to = [...SHAPES.idle] as Weights;
    sim.w = [...SHAPES.idle] as Weights;
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
    let coreScale = small ? 1 : Math.min(window.devicePixelRatio || 1, 1.5);
    const renderer = createCrystalRenderer(
      canvas,
      small ? { fibers: 96, segments: 160, coreScale } : { fibers: 150, segments: 220, coreScale }
    );
    if (!renderer) {
      setWebgl(false);
      return;
    }
    const sim = simRef.current;

    const resize = () => {
      renderer.resize(
        window.innerWidth,
        window.innerHeight,
        Math.min(window.devicePixelRatio || 1, 2)
      );
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

    const anchorEls = Array.from(
      document.querySelectorAll<HTMLElement>('[data-thread-anchor]')
    ).slice(0, 3);
    let last = performance.now();
    introStartRef.current = last;
    let slowFrames = 0;
    let raf = 0;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const rawDt = (now - last) / 1000;
      const dt = Math.min(0.05, rawDt);
      last = now;
      const still = reducedRef.current;
      const h = window.innerHeight;
      const y = window.scrollY;
      const el = (now - introStartRef.current) / 1000;
      const ph = phaseRef.current;

      // 帧率不够时降低核心的渲染分辨率（线条不受影响）
      if (!still && rawDt > 0.024 && el > 4) {
        if (++slowFrames > 40 && coreScale > 0.6) {
          coreScale = Math.max(0.6, coreScale - 0.25);
          renderer.setCoreScale(coreScale);
          slowFrames = 0;
        }
      } else slowFrames = Math.max(0, slowFrames - 1);

      // 核心的位置和尺度由页面上的占位元素决定，CSS 负责排版
      const stage = stageRef.current?.getBoundingClientRect();
      if (stage) {
        sim.cx = stage.left + stage.width / 2;
        sim.cy = stage.top + stage.height / 2 + (still ? 0 : y * 0.3);
        sim.scale = stage.width / 2 / 0.95;
      }
      const card = formRef.current?.getBoundingClientRect();
      if (card) sim.listenFrom = [card.left + card.width / 2, card.top];

      const cage = CAGE[ph];
      if (still) {
        // 减弱动态效果：固定在一帧静止画面，只在状态或布局变化时重绘
        sim.time = 6;
        sim.reveal = 1;
        sim.grow = 1;
        sim.morph = 1;
        sim.w = [...sim.to] as Weights;
        sim.open = cage.open;
        sim.hover = 0;
        if (!introAskedRef.current) {
          introAskedRef.current = true;
          setSpoken(OPENING_QUESTION.length);
          setAsking(false);
        }
      } else {
        sim.time += dt;
        // 开场：水晶从一滴长出来 → 外壳织出镂空 → 轨道环画出 → 面试官提出第一个问题
        sim.grow = easeOutBack(clamp01((el - 0.5) / 1.3)) * (1 - 0.35 * clamp01(y / h));
        sim.reveal = easeInOut(clamp01((el - 1.2) / 1.8));
        const openIntro = easeInOut(clamp01((el - 0.9) / 1.6));
        sim.open = approach(sim.open, cage.open * openIntro, 3, dt);
        sim.cageFlow += cage.flow * dt;
        sim.cageSpin += cage.spin * dt;
        sim.morph = Math.min(1, sim.morph + dt / morphDurRef.current);
        sim.w = sim.w.map((v, i) => approach(v, sim.to[i], 2.6, dt)) as Weights;
        sim.energy *= Math.exp(-dt * 1.4);
        sim.excite = approach(sim.excite, exciteTargetRef.current, 4, dt);

        if (!introAskedRef.current && el > 2.8) {
          introAskedRef.current = true;
          speak(OPENING_QUESTION, true);
        }

        // 鼠标：位置用临界阻尼平滑，速度再做一次低通，不会过冲
        if (pointer.inside) {
          if (pointer.fresh) {
            sim.mouse = [pointer.x, pointer.y];
            pointer.fresh = false;
          }
          const nx = approach(sim.mouse[0], pointer.x, 10, dt);
          const ny = approach(sim.mouse[1], pointer.y, 10, dt);
          const vx = (nx - sim.mouse[0]) / Math.max(dt, 1e-3);
          const vy = (ny - sim.mouse[1]) / Math.max(dt, 1e-3);
          let mvx = approach(sim.mouseVel[0], vx, 5, dt);
          let mvy = approach(sim.mouseVel[1], vy, 5, dt);
          const speed = Math.hypot(mvx, mvy);
          if (speed > 1500) {
            mvx = (mvx * 1500) / speed;
            mvy = (mvy * 1500) / speed;
          }
          sim.mouseVel = [mvx, mvy];
          sim.mouse = [nx, ny];
        } else {
          sim.mouseVel = [approach(sim.mouseVel[0], 0, 5, dt), approach(sim.mouseVel[1], 0, 5, dt)];
        }
        sim.hover = approach(sim.hover, pointer.inside ? 1 : 0, 3, dt);

        // 说话：每个字在水晶里发一次声，同时出现在卡片上
        const sp = speechRef.current;
        if (sp) {
          let changed = false;
          while (sp.shown < sp.syl.length && sim.time >= sp.start + sp.syl[sp.shown].at) {
            const { amp } = sp.syl[sp.shown];
            sim.syllables.copyWithin(2, 0, sim.syllables.length - 2);
            sim.syllables[0] = sim.time;
            sim.syllables[1] = amp * (sp.opening ? 0.7 : 1);
            sp.shown++;
            changed = true;
          }
          if (changed) setSpoken(sp.shown);
          if (sp.shown >= sp.syl.length) {
            speechRef.current = null;
            if (sp.opening) setAsking(false);
            else
              later(() => {
                if (phaseRef.current === 'speak') go('listen', 1.5);
              }, 1800);
          }
        }
      }

      // 滚动：环断开、垂向下一节的卡片
      const anchorsY: number[] = [];
      anchorEls.forEach((a, i) => {
        const r = a.getBoundingClientRect();
        sim.anchors[i * 4] = r.left + r.width / 2;
        sim.anchors[i * 4 + 1] = r.top;
        sim.anchors[i * 4 + 2] = r.width;
        anchorsY.push(r.top);
      });
      const firstAnchor = anchorsY.length ? Math.min(...anchorsY) : h * 2;
      sim.shield.fill(-1e4);
      textRef.current?.querySelectorAll('[data-shield]').forEach((node, i) => {
        if (i >= SHIELD_SLOTS) return;
        const r = node.getBoundingClientRect();
        sim.shield.set([r.left, r.top, r.right, r.bottom], i * 4);
      });
      if (still || anchorEls.length < 3) {
        sim.scroll = 0;
        sim.fade = 1 - clamp01(y / (h * 0.8));
      } else {
        sim.scroll = clamp01(y / (h * 0.9));
        sim.fade = clamp01((firstAnchor + h * 0.05) / (h * 0.35));
        const attached = sim.scroll > 0.95 && sim.fade > 0.3;
        anchorEls.forEach((a) => {
          if (a.dataset.attached !== String(attached)) a.dataset.attached = String(attached);
        });
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
  }, [reduced, phase]);

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
    // 只有新输入的字才激起涟漪，删除不算
    const added = Math.max(0, Array.from(value).length - Array.from(prevAnswerRef.current).length);
    prevAnswerRef.current = value;
    setAnswer(value);
    if (added > 0) ripple();
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

  /** 悬停在主按钮上时，水晶微微膨胀、轨道环亮起来，像在期待你点击 */
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

  return (
    <section aria-label="首屏" className="relative isolate overflow-x-clip">
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-[5] h-full w-full"
      />

      <div
        key={introKey}
        className="page relative flex min-h-[calc(100svh-64px)] flex-col justify-center gap-8 pb-14 pt-4 lg:min-h-[max(660px,calc(100svh-64px))] lg:py-10"
        style={{ '--stage': 'min(41vw, 64vh)' } as CSSProperties}
      >
        {/* 装置的占位：WebGL 按它的位置和大小渲染。背后一团荧光、脚下一片投影，把它「放」在页面上 */}
        <div
          ref={stageRef}
          aria-hidden="true"
          className="pointer-events-none relative order-first mx-auto aspect-square w-[min(94vw,520px)] lg:absolute lg:right-[-6%] lg:top-[calc(50%-var(--stage)/2)] lg:order-none lg:mx-0 lg:w-[var(--stage)]"
        >
          <div className="absolute inset-[10%] rounded-full bg-[radial-gradient(closest-side,rgba(191,234,46,0.32),rgba(191,234,46,0.1)_55%,transparent)] blur-2xl" />
          <div className="absolute bottom-[5%] left-[30%] h-[6%] w-[40%] rounded-[50%] bg-ink/15 blur-xl" />
          {/* 状态标签贴在装置旁边，是它自己的「名牌」 */}
          <div
            className={cn(
              s.rise,
              'absolute left-[4%] top-[12%] z-10 hidden items-center gap-2 rounded-full border border-white/70 bg-white/70 py-1.5 pl-2.5 pr-3.5 text-[13px] text-ink shadow-glass backdrop-blur-md sm:flex'
            )}
            style={delay(1700)}
          >
            <span className="relative flex h-2 w-2">
              <span
                className={cn(
                  'absolute inset-0 rounded-full bg-brand-600',
                  phase === 'listen' && s.pulse,
                  (phase === 'think' || asking) && s.pulseFast
                )}
              />
              <span className="relative h-2 w-2 rounded-full bg-brand-700" />
            </span>
            <span className="text-ink-secondary">面试官</span>
            {statusLabel}
          </div>
        </div>

        {/* 文字在最前面；线条从后面经过时会自动变淡 */}
        <div ref={textRef} className="relative z-10 lg:-mt-[4vh] lg:w-[54%]">
          <p
            data-shield
            className={cn(
              s.rise,
              'inline-flex items-center gap-2 rounded-full border border-line bg-white/70 px-3 py-1 text-[13px] text-ink-secondary backdrop-blur'
            )}
            style={delay(100)}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-brand-700" aria-hidden="true" />
            AI 模拟面试 · 读过你简历的面试官
          </p>

          <h1 className="mt-6 text-[clamp(2.75rem,5.4vw,5.25rem)] font-semibold leading-[1.1] tracking-[-0.03em] text-ink">
            <span className={s.lineMask}>
              <span data-shield className={cn(s.lineInner, 'w-fit')} style={delay(200)}>
                答完这一题，
              </span>
            </span>
            <span className={s.lineMask}>
              <span data-shield className={cn(s.lineInner, 'w-fit')} style={delay(320)}>
                面试官还会
                <span className="mark animate-mark" style={{ animationDelay: '950ms' }}>
                  追问
                </span>
                。
              </span>
            </span>
          </h1>

          <p
            data-shield
            className={cn(s.rise, 'mt-6 max-w-[27em] text-[17px] leading-8 text-ink-secondary')}
            style={delay(800)}
          >
            它读过你的简历，会听完你的每一句回答，再顺着你说的继续往下问。结束后逐题告诉你，哪里答得好，哪里还差一点。
          </p>

          <div
            data-shield
            className={cn(s.rise, 'mt-8 flex w-fit flex-wrap items-center gap-3')}
            style={delay(950)}
          >
            <Link
              href="/interview/social"
              className="link-btn-primary link-btn-lg"
              {...anticipate(1)}
            >
              开始模拟面试
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link href="/resume" className="link-btn-default link-btn-lg" {...anticipate(0.4)}>
              用简历押题
            </Link>
          </div>

          <div
            data-shield
            className={cn(s.rise, 'mt-10 flex w-fit items-center gap-3')}
            style={delay(1100)}
          >
            <div className="flex -space-x-2" aria-hidden="true">
              {AVATARS.map((a) => (
                <span
                  key={a.ch}
                  className={cn(
                    'grid h-8 w-8 place-items-center rounded-full text-[12px] font-medium ring-2 ring-canvas',
                    a.tone
                  )}
                >
                  {a.ch}
                </span>
              ))}
            </div>
            <p className="text-[13px] leading-5 text-ink-secondary">
              <span className="text-[15px] font-semibold tabular-nums text-ink">86,000+</span>
              <br />
              场模拟面试已在这里完成
            </p>
          </div>
        </div>

        {/* 玻璃对话卡片：压在水晶的右下缘，透过它能看到后面的装置 */}
        <div className="relative z-20 w-full max-w-[420px] lg:absolute lg:bottom-[6vh] lg:right-[-2%] lg:w-[360px]">
          <form
            ref={formRef}
            onSubmit={onSubmit}
            className={cn(
              s.rise,
              'rounded-[22px] border border-white/70 bg-white/60 p-5 shadow-glass backdrop-blur-xl'
            )}
            style={delay(1900)}
          >
            <div className="flex items-center justify-between text-[13px] text-ink-secondary">
              <span className="tabular-nums">第 {round} 问 · 后端开发</span>
              <ol className="flex items-center gap-1" aria-label="面试官的工作方式">
                {STEPS.map((st, i) => (
                  <li
                    key={st.phase}
                    aria-current={activeStep === i ? 'step' : undefined}
                    className={cn(
                      'rounded-md px-1.5 py-0.5 text-[12px] transition-colors duration-300',
                      activeStep === i ? 'bg-brand-600 text-ink' : 'text-ink-muted'
                    )}
                  >
                    {st.title}
                  </li>
                ))}
              </ol>
            </div>

            {lastAnswer && (
              <p className="mt-3 line-clamp-1 border-l-2 border-brand-600 pl-3 text-[13px] text-ink-secondary">
                你：{lastAnswer}
              </p>
            )}

            <p className="mt-2.5 min-h-[3.5em] text-[16px] font-medium leading-7 text-ink">
              {question.slice(0, spoken)}
              {typing && (
                <span
                  className="ml-0.5 inline-block h-[1.1em] w-[2px] translate-y-[3px] animate-caret bg-ink"
                  aria-hidden="true"
                />
              )}
            </p>

            {phase === 'think' ? (
              <div className="mt-3 min-h-[68px]">
                <p className="text-[13px] text-ink-secondary">把三条线索编在一起</p>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {STRANDS.slice(0, strands).map((st) => (
                    <li
                      key={st}
                      className={cn(
                        s.strand,
                        'rounded-full bg-brand-100 px-2.5 py-1 text-[13px] text-brand-800'
                      )}
                    >
                      {st}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <>
                <label htmlFor="hero-answer" className="sr-only">
                  你的回答
                </label>
                <textarea
                  id="hero-answer"
                  ref={inputRef}
                  value={answer}
                  rows={2}
                  disabled={phase === 'speak'}
                  readOnly={autoTyping}
                  onChange={(e) => onInput(e.target.value)}
                  onFocus={() => phaseRef.current === 'idle' && go('listen', 1.5)}
                  onKeyDown={onKeyDown}
                  placeholder="在这里回答，按 Enter 提交"
                  className="mt-3 block w-full resize-none rounded-[12px] border border-white/80 bg-white/70 px-3.5 py-2.5 text-base leading-6 text-ink outline-none transition-colors placeholder:text-ink-muted focus:border-brand-800 focus:bg-white disabled:opacity-60"
                />
              </>
            )}

            <div className="mt-3 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={playSample}
                disabled={busy}
                className="h-11 rounded-[10px] px-1 text-[14px] font-medium text-brand-800 transition-colors hover:text-brand-900 disabled:text-ink-muted"
              >
                用示例回答试试
              </button>
              <button
                type="submit"
                disabled={busy || !answer.trim()}
                className="inline-flex h-11 items-center gap-2 rounded-full bg-ink px-4 text-[14px] font-medium text-white transition-[background-color,opacity] hover:bg-ink/85 disabled:opacity-35"
              >
                提交回答
                <CornerDownLeft className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <p className="sr-only" aria-live="polite">
              {!typing && (phase === 'speak' || spoken >= question.length)
                ? `面试官${round > 1 ? '追问' : '提问'}：${question}`
                : `面试官${statusLabel}`}
            </p>
          </form>
        </div>
      </div>

      {!webgl && <p className="sr-only">当前浏览器不支持 WebGL，动态装置已隐藏。</p>}

      {debug && (
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
      )}
    </section>
  );
}

/** 调试条：直接切换各个状态，只在 /lab/hero 上显示 */
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
    <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full border border-line bg-white/90 p-1 text-[13px] shadow-pop backdrop-blur">
      <span className="hidden px-2 text-ink-muted sm:inline">调试</span>
      {items.map((it) => (
        <button
          key={it.p}
          type="button"
          onClick={() => onPhase(it.p)}
          aria-pressed={phase === it.p}
          className={cn(
            'h-8 whitespace-nowrap rounded-full px-2.5 transition-colors sm:px-3',
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
        className="h-8 whitespace-nowrap rounded-full px-2.5 text-ink-secondary transition-colors hover:bg-canvas hover:text-ink sm:px-3"
      >
        重播开场
      </button>
    </div>
  );
}
