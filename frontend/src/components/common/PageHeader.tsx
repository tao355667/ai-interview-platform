import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** 标题上方的小字，例如面包屑或返回链接 */
  extra?: ReactNode;
  /** 右侧操作区 */
  actions?: ReactNode;
}

export default function PageHeader({ title, description, extra, actions }: PageHeaderProps) {
  return (
    <div className="mb-8 flex animate-rise flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {extra && <div className="mb-3 text-sm text-ink-secondary">{extra}</div>}
        <h1 className="text-balance text-[28px] font-semibold leading-tight tracking-tight text-ink sm:text-[32px]">
          {title}
        </h1>
        {description && (
          <p className="mt-2 max-w-2xl text-[15px] leading-7 text-ink-secondary">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
