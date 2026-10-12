'use client';

import type { PointerEvent, ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface SpotlightProps {
  children: ReactNode;
  className?: string;
}

/**
 * 光标跟随柔光卡片（思路参考 React Bits 的 Spotlight Card）。
 * 只写入两个 CSS 变量，光效本身由 globals.css 中的 .spotlight 实现，不依赖动画库。
 */
export function Spotlight({ children, className }: SpotlightProps) {
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--mx', `${e.clientX - rect.left}px`);
    e.currentTarget.style.setProperty('--my', `${e.clientY - rect.top}px`);
  };

  return (
    <div className={cn('spotlight', className)} onPointerMove={onPointerMove}>
      {children}
    </div>
  );
}
