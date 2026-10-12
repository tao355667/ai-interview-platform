'use client';

// 移植自 Magic UI Number Ticker（MIT License, Copyright (c) Magic UI）
// https://magicui.design/docs/components/number-ticker
import { useEffect, useRef } from 'react';
import { useInView, useMotionValue, useReducedMotion, useSpring } from 'motion/react';
import { cn } from '@/lib/cn';

interface NumberTickerProps {
  value: number;
  className?: string;
  /** 延迟（秒） */
  delay?: number;
  decimalPlaces?: number;
}

const format = (n: number, decimalPlaces: number) =>
  new Intl.NumberFormat('zh-CN', {
    minimumFractionDigits: decimalPlaces,
    maximumFractionDigits: decimalPlaces,
  }).format(Number(n.toFixed(decimalPlaces)));

/** 进入视口时从 0 滚动到目标数字；减弱动态效果时直接显示结果 */
export function NumberTicker({
  value,
  className,
  delay = 0,
  decimalPlaces = 0,
}: NumberTickerProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduceMotion = useReducedMotion();
  const motionValue = useMotionValue(0);
  const springValue = useSpring(motionValue, { damping: 60, stiffness: 100 });
  const isInView = useInView(ref, { once: true, margin: '0px' });

  useEffect(() => {
    if (!isInView) return;
    if (reduceMotion) {
      if (ref.current) ref.current.textContent = format(value, decimalPlaces);
      return;
    }
    const timer = setTimeout(() => motionValue.set(value), delay * 1000);
    return () => clearTimeout(timer);
  }, [isInView, reduceMotion, value, delay, decimalPlaces, motionValue]);

  useEffect(
    () =>
      springValue.on('change', (latest) => {
        if (ref.current) ref.current.textContent = format(latest, decimalPlaces);
      }),
    [springValue, decimalPlaces]
  );

  return (
    <span
      ref={ref}
      className={cn('inline-block tabular-nums', className)}
      aria-label={format(value, decimalPlaces)}
    >
      0
    </span>
  );
}
