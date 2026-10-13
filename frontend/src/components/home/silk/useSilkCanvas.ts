'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { setSilkQuality } from './silk';

export interface SilkFrame {
  ctx: CanvasRenderingContext2D;
  /** 画布的 CSS 尺寸 */
  w: number;
  h: number;
  /** 累计时间（秒）；减弱动态效果时固定不动 */
  time: number;
  dt: number;
  reduced: boolean;
}

interface Options {
  /** 是否有持续的环境动画（丝线缓慢扭转）。没有的话只在 invalidate() 后重画 */
  ambient?: boolean;
  /** 像素密度上限：整屏大画布用 1.5，小画布用 2 */
  dprCap?: number;
}

/** 系统是否开启了「减弱动态效果」 */
export function useReducedMotion() {
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

/**
 * 丝线画布的生命周期：按像素密度设置尺寸、跟随容器缩放、只在可见时运行动画循环、卸载时清理。
 *
 * draw 返回 true 表示「还没稳定」（例如平滑追赶滚动进度），会继续请求下一帧。
 * 不可见（滚出视口或被 display:none 隐藏）时完全不画，也不占用主线程。
 */
export function useSilkCanvas(
  ref: RefObject<HTMLCanvasElement>,
  draw: (f: SilkFrame) => boolean | void,
  { ambient = false, dprCap = 2 }: Options = {}
) {
  const drawRef = useRef(draw);
  drawRef.current = draw;
  const reduced = useReducedMotion();
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;
  const dirtyRef = useRef(true);
  const wakeRef = useRef<() => void>(() => {});

  const invalidate = useCallback(() => {
    dirtyRef.current = true;
    wakeRef.current();
  }, []);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let w = 0;
    let h = 0;
    let visible = false;
    let raf = 0;
    let last = 0;
    let time = 0;
    let settling = false;
    let odd = false;
    // 自适应画质：这块画布自己的绘制耗时超出预算时，先降像素密度，再减细线根数
    const LEVELS = [
      { dpr: dprCap, lanes: 1 },
      { dpr: Math.min(dprCap, 1.25), lanes: 0.75 },
      { dpr: 1, lanes: 0.55 },
    ];
    let level = 0;
    let cost = 0;
    let samples = 0;

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      w = r.width;
      h = r.height;
      const dpr = Math.min(window.devicePixelRatio || 1, LEVELS[level].dpr);
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      dirtyRef.current = true;
    };

    const frame = (now: number) => {
      raf = 0;
      if (!visible || w < 2 || h < 2) return;
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;
      const still = reducedRef.current;
      const live = ambient && !still;
      if (!live && !dirtyRef.current && !settling) {
        last = 0;
        return;
      }
      if (!still) time += dt;
      // 只有环境动画（没有滚动、没有在追赶）时降到 30fps：丝线转得很慢，看不出差别，主线程空出一半
      odd = !odd;
      if (live && !dirtyRef.current && !settling && odd) {
        raf = requestAnimationFrame(frame);
        return;
      }
      dirtyRef.current = false;
      ctx.clearRect(0, 0, w, h);
      setSilkQuality(LEVELS[level].lanes);
      const t0 = performance.now();
      settling =
        drawRef.current({ ctx, w, h, time: still ? 4 : time, dt, reduced: still }) === true;
      const spent = performance.now() - t0;
      cost = samples ? cost * 0.92 + spent * 0.08 : spent;
      if (++samples > 45 && cost > 6 && level < LEVELS.length - 1) {
        level++;
        samples = 0;
        resize();
      }
      if (live || settling || dirtyRef.current) raf = requestAnimationFrame(frame);
      else last = 0;
    };

    const wake = () => {
      if (!raf && visible) raf = requestAnimationFrame(frame);
    };
    wakeRef.current = wake;

    const ro = new ResizeObserver(() => {
      resize();
      wake();
    });
    ro.observe(canvas);
    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        if (visible) {
          dirtyRef.current = true;
          wake();
        }
      },
      { rootMargin: '120px 0px' }
    );
    io.observe(canvas);
    resize();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      wakeRef.current = () => {};
    };
  }, [ref, ambient, dprCap]);

  // 切换减弱动态效果后重画一帧
  useEffect(() => {
    invalidate();
  }, [reduced, invalidate]);

  return { invalidate, reduced };
}
