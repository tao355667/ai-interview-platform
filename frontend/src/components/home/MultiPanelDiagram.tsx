'use client';

import { useRef } from 'react';
import { Code2, FolderKanban, UserRound, Users } from 'lucide-react';
import { AnimatedBeam } from '@/components/motion/AnimatedBeam';

const INTERVIEWERS = [
  { name: '主面试官', icon: Users },
  { name: '技术面试官', icon: Code2 },
  { name: '项目面试官', icon: FolderKanban },
];

/** 多人面试：三位面试官与候选人之间的流光连线 */
export default function MultiPanelDiagram() {
  const containerRef = useRef<HTMLDivElement>(null);
  const candidateRef = useRef<HTMLDivElement>(null);
  const r0 = useRef<HTMLDivElement>(null);
  const r1 = useRef<HTMLDivElement>(null);
  const r2 = useRef<HTMLDivElement>(null);
  const refs = [r0, r1, r2];

  return (
    <div
      ref={containerRef}
      className="relative flex items-center justify-between gap-6 py-2"
      aria-hidden="true"
    >
      <div className="flex flex-col gap-3">
        {INTERVIEWERS.map((it, i) => (
          <div
            key={it.name}
            ref={refs[i]}
            className="relative z-[1] flex items-center gap-2 rounded-xl border border-line bg-white px-3 py-2 text-[13px] text-ink shadow-xs"
          >
            <it.icon className="h-4 w-4 text-warning" strokeWidth={1.75} />
            {it.name}
          </div>
        ))}
      </div>
      <div
        ref={candidateRef}
        className="relative z-[1] flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-line bg-white shadow-card"
      >
        <UserRound className="h-6 w-6 text-ink-secondary" strokeWidth={1.75} />
      </div>
      {refs.map((ref, i) => (
        <AnimatedBeam
          key={i}
          containerRef={containerRef}
          fromRef={ref}
          toRef={candidateRef}
          curvature={(1 - i) * 30}
          duration={3.6}
          delay={i * 0.5}
          gradientStartColor="#B7791F"
          gradientStopColor="#F6D9A5"
        />
      ))}
    </div>
  );
}
