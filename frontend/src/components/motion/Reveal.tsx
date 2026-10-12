'use client';

import * as m from 'motion/react-m';
import type { ReactNode } from 'react';

const EASE_OUT = [0.2, 0.7, 0.2, 1] as const;

interface RevealProps {
  children: ReactNode;
  className?: string;
  /** 延迟（秒），用于同一区块内的错峰出现 */
  delay?: number;
  as?: 'div' | 'li' | 'section';
}

/** 进入视口时淡入并上移 8px，只播放一次 */
export function Reveal({ children, className, delay = 0, as = 'div' }: RevealProps) {
  const Comp = m[as];
  return (
    <Comp
      className={className}
      initial={{ opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -80px 0px' }}
      transition={{ duration: 0.45, delay, ease: EASE_OUT }}
    >
      {children}
    </Comp>
  );
}
