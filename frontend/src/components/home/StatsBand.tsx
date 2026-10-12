import { NumberTicker } from '@/components/motion/NumberTicker';

// 示例数据：前两项为占位数字，上线前请替换为真实统计；后两项来自产品配置
const STATS: { value: number | string; suffix: string; label: string }[] = [
  { value: 86000, suffix: '+', label: '场模拟面试' },
  { value: 24000, suffix: '+', label: '位注册用户' },
  { value: 4, suffix: '', label: '种面试模式' },
  { value: '5–10', suffix: '', label: '道题 / 每场' },
];

export default function StatsBand() {
  return (
    <section className="page py-10">
      <dl className="grid grid-cols-2 gap-y-10 border-y border-line py-10 md:grid-cols-4 md:divide-x md:divide-line">
        {STATS.map((s) => (
          <div key={s.label} className="px-2 text-center md:px-6">
            <dd className="text-[40px] font-semibold leading-none tracking-tight text-ink">
              {typeof s.value === 'number' ? (
                <NumberTicker value={s.value} />
              ) : (
                <span className="tabular-nums">{s.value}</span>
              )}
              {s.suffix && <span className="text-brand-700">{s.suffix}</span>}
            </dd>
            <dt className="mt-3 text-sm text-ink-secondary">{s.label}</dt>
          </div>
        ))}
      </dl>
    </section>
  );
}
