'use client';

import { useState } from 'react';

const CLAMP_CLASS: Record<number, string> = {
  2: '[-webkit-line-clamp:2]',
  3: '[-webkit-line-clamp:3]',
  4: '[-webkit-line-clamp:4]',
  5: '[-webkit-line-clamp:5]',
};

/** 移动端长文本折叠，桌面端完整展示 */
export default function ExpandableText({
  content,
  className,
  lines = 3,
  threshold = 120,
}: {
  content: unknown;
  className?: string;
  lines?: number;
  threshold?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const value = content == null ? '' : String(content);

  if (!value) return null;

  const shouldClamp = value.length > threshold;
  const clampClass = CLAMP_CLASS[lines] || CLAMP_CLASS[3];

  return (
    <div className="min-w-0">
      <div
        className={[
          className || '',
          'whitespace-pre-wrap break-words [overflow-wrap:anywhere]',
          !expanded && shouldClamp
            ? `overflow-hidden [display:-webkit-box] [-webkit-box-orient:vertical] ${clampClass} sm:overflow-visible sm:[display:block] sm:[-webkit-line-clamp:unset]`
            : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {value}
      </div>
      {shouldClamp && (
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="mt-1 text-sm font-medium text-brand-800 transition-colors duration-150 hover:text-brand-900 sm:hidden"
        >
          {expanded ? '收起' : '展开全文'}
        </button>
      )}
    </div>
  );
}
