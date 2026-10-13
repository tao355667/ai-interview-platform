'use client';

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ElementType } from 'react';
import { cn } from '@/lib/cn';

interface KineticTextProps {
  text: string;
  as?: ElementType;
  className?: string;
  /** 每个字之间的错峰（毫秒） */
  stagger?: number;
  delay?: number;
  /** 立即播放（用于切换内容时重新挂载），否则进入视口时播放 */
  immediate?: boolean;
}

/**
 * 动态文字：每个字从下方的遮罩里升起来。中文按“，”拆成短语，短语内部不换行。
 * 只播一次；减弱动态效果时由 globals.css 统一关闭过渡，文字直接显示。
 */
export function KineticText({
  text,
  as: Tag = 'span',
  className,
  stagger = 28,
  delay = 0,
  immediate = false,
}: KineticTextProps) {
  const ref = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (immediate) {
      const id = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(id);
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px -12% 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [immediate]);

  let i = 0;
  const parts = text.split(/(?<=[，。？])/);
  return (
    <Tag
      ref={ref}
      className={cn('kinetic', className)}
      data-in={shown || undefined}
      aria-label={text}
    >
      {parts.map((p, pi) => (
        <span key={pi} className="inline-block whitespace-nowrap" aria-hidden="true">
          {Array.from(p).map((ch, ci) => (
            <span key={ci} className="kinetic-mask">
              <span
                className="kinetic-ch"
                style={{ '--d': `${delay + i++ * stagger}ms` } as CSSProperties}
              >
                {ch === ' ' ? '\u00A0' : ch}
              </span>
            </span>
          ))}
        </span>
      ))}
    </Tag>
  );
}
