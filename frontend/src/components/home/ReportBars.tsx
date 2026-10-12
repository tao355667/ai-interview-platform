'use client';

import * as m from 'motion/react-m';

const DIMENSIONS = [
  { label: '技术深度', value: 78 },
  { label: '表达结构', value: 85 },
  { label: '项目理解', value: 82 },
  { label: '沟通表达', value: 88 },
];

/** 评估报告示意：各维度得分条，进入视口时依次填充 */
export default function ReportBars() {
  return (
    <ul className="space-y-3.5">
      {DIMENSIONS.map((d, i) => (
        <li key={d.label}>
          <div className="flex items-baseline justify-between text-[13px]">
            <span className="text-ink-secondary">{d.label}</span>
            <span className="tabular-nums text-ink">{d.value}</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-canvas">
            <m.div
              className="h-full rounded-full bg-brand-600"
              initial={{ width: '0%' }}
              whileInView={{ width: `${d.value}%` }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, delay: 0.1 + i * 0.08, ease: [0.2, 0.7, 0.2, 1] }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
