import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface SectionHeadingProps {
  eyebrow: string;
  title: ReactNode;
  description?: ReactNode;
  align?: 'left' | 'center';
  /** 深色区块里使用 */
  inverted?: boolean;
}

/**
 * 中文标题按“，”拆成短语，每个短语内部不换行，避免出现“多人面 / 试”这种拆词。
 * 只在短语之间换行；非字符串标题原样输出。
 */
export function phrases(title: ReactNode) {
  if (typeof title !== 'string') return title;
  const parts = title.split(/(?<=，)/);
  return parts.map((p, i) => (
    <span key={i} className="inline-block">
      {p}
    </span>
  ));
}

export default function SectionHeading({
  eyebrow,
  title,
  description,
  align = 'left',
  inverted = false,
}: SectionHeadingProps) {
  return (
    <div className={cn('max-w-2xl', align === 'center' && 'mx-auto text-center')}>
      <p className={cn('eyebrow', inverted && 'text-mint')}>{eyebrow}</p>
      <h2 className={cn('mt-3 text-balance text-title', inverted ? 'text-white' : 'text-ink')}>
        {phrases(title)}
      </h2>
      {description && (
        <p
          className={cn(
            'mt-4 text-balance text-base leading-7',
            inverted ? 'text-white/70' : 'text-ink-secondary'
          )}
        >
          {description}
        </p>
      )}
    </div>
  );
}
