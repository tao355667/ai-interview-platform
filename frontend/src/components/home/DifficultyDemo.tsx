'use client';

import { useState } from 'react';
import { cn } from '@/lib/cn';

const LEVELS = [
  { key: 'easy', label: '入门', depth: 1, question: 'HTTP 和 HTTPS 有什么区别？' },
  { key: 'mid', label: '进阶', depth: 2, question: 'HTTPS 握手过程中，证书是怎么被校验的？' },
  {
    key: 'hard',
    label: '资深',
    depth: 3,
    question: '如果要在网关层统一做 TLS 卸载，你会考虑哪些风险？',
  },
];

/** 难度切换示意：选择不同难度，示例题和追问深度随之变化 */
export default function DifficultyDemo() {
  const [idx, setIdx] = useState(1);
  const level = LEVELS[idx];

  return (
    <div>
      <div
        className="inline-flex rounded-[10px] bg-canvas p-1"
        role="radiogroup"
        aria-label="选择难度"
      >
        {LEVELS.map((l, i) => (
          <button
            key={l.key}
            type="button"
            role="radio"
            aria-checked={i === idx}
            onClick={() => setIdx(i)}
            className={cn(
              'h-8 rounded-lg px-3.5 text-[13px] transition-[background-color,color,box-shadow] duration-150',
              i === idx
                ? 'bg-white font-medium text-ink shadow-xs'
                : 'text-ink-secondary hover:text-ink'
            )}
          >
            {l.label}
          </button>
        ))}
      </div>
      <p
        key={level.key}
        className="mt-5 min-h-[3.5rem] animate-fade-in text-[15px] leading-7 text-ink"
        aria-live="polite"
      >
        {level.question}
      </p>
      <div className="mt-3 flex items-center gap-2 text-xs text-ink-secondary">
        追问深度
        <span className="flex gap-1" aria-label={`${level.depth} 层`}>
          {[1, 2, 3].map((d) => (
            <span
              key={d}
              className={cn(
                'h-1.5 w-6 rounded-full transition-colors duration-200',
                d <= level.depth ? 'bg-brand-600' : 'bg-line'
              )}
            />
          ))}
        </span>
      </div>
    </div>
  );
}
