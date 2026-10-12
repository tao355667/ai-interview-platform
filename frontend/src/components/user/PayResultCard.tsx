import type { ReactNode } from 'react';

interface PayResultCardProps {
  icon: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** 订单号、状态等明细 */
  details?: { label: string; value: ReactNode }[];
  note?: ReactNode;
  actions?: ReactNode;
}

/** 支付结果页（成功 / 取消）共用的居中卡片 */
export default function PayResultCard({
  icon,
  title,
  description,
  details,
  note,
  actions,
}: PayResultCardProps) {
  return (
    <div className="page py-16">
      <div className="surface mx-auto w-full max-w-md p-6 sm:p-8">
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 text-5xl leading-none" aria-hidden>
            {icon}
          </div>
          <h1 className="text-xl font-semibold text-ink">{title}</h1>
          {description && <p className="mt-2 text-sm text-ink-secondary">{description}</p>}
        </div>

        {details && details.length > 0 && (
          <dl className="mt-6 divide-y divide-line rounded-lg border border-line bg-canvas text-sm">
            {details.map((d) => (
              <div key={d.label} className="flex items-center justify-between gap-4 px-4 py-3">
                <dt className="shrink-0 text-ink-secondary">{d.label}</dt>
                <dd className="min-w-0 break-all text-right text-ink">{d.value}</dd>
              </div>
            ))}
          </dl>
        )}

        {note && <p className="mt-4 text-xs text-ink-secondary">{note}</p>}

        {actions && <div className="mt-6 flex flex-wrap justify-center gap-3">{actions}</div>}
      </div>
    </div>
  );
}
