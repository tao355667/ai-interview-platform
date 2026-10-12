'use client';

import { useEffect, useState } from 'react';
import { Progress } from 'antd';

interface GeneratingProgressProps {
  /** 是否正在生成 */
  active: boolean;
  /** 预计耗时（秒），只用于估算进度条 */
  estimatedSeconds?: number;
}

/**
 * 押题生成中的进度反馈。接口是一次性返回的，这里按已用时间估算进度，最多走到 95%。
 */
export default function GeneratingProgress({
  active,
  estimatedSeconds = 60,
}: GeneratingProgressProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!active) {
      setElapsed(0);
      return;
    }
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [active]);

  if (!active) return null;

  const percent = Math.min(95, Math.round((elapsed / estimatedSeconds) * 90) + 5);
  const hint =
    elapsed < 15
      ? '正在解析简历内容'
      : elapsed < 40
        ? '正在结合岗位要求生成题目'
        : '正在整理参考答案和追问';

  return (
    <div
      className="rounded-card border border-brand-200 bg-brand-50 p-4"
      role="status"
      aria-live="polite"
    >
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="font-medium text-brand-800">{hint}</span>
        <span className="tabular-nums text-ink-secondary">已用时 {elapsed} 秒</span>
      </div>
      <Progress percent={percent} showInfo={false} size="small" status="active" />
      <p className="mt-2 text-xs text-ink-secondary">
        生成通常需要 1 分钟左右，请不要关闭或刷新页面，完成后会自动跳转到押题记录。
      </p>
    </div>
  );
}
