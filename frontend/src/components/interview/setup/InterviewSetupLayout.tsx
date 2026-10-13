'use client';

import type { ReactNode } from 'react';
import { Button } from 'antd';
import { CircleCheck, Clock } from 'lucide-react';
import { INTERVIEW_TYPES, type InterviewKind } from '@/config/interviewTypes';

/** 配置表单的 id，提交按钮通过 form 属性关联，表单内回车也能提交 */
export const SETUP_FORM_ID = 'interview-setup-form';

export interface SetupGuide {
  /** 考察重点 */
  focus: { title: string; desc: string }[];
  /** 预计时长，例如“约 30–60 分钟” */
  duration: string;
  /** 注意事项 */
  tips: string[];
}

export interface SetupSubmit {
  label: string;
  loading?: boolean;
  disabled?: boolean;
  /** 按钮旁的补充说明 */
  hint?: ReactNode;
}

interface InterviewSetupLayoutProps {
  kind: InterviewKind;
  /** 默认取 interviewTypes 中的 label */
  title?: ReactNode;
  /** 默认取 interviewTypes 中的 description */
  description?: ReactNode;
  /** 表单卡片标题，默认“面试配置” */
  formTitle?: ReactNode;
  guide: SetupGuide;
  /** 不传则不显示提交按钮（例如缺少简历时） */
  submit?: SetupSubmit;
  children: ReactNode;
}

export default function InterviewSetupLayout({
  kind,
  title,
  description,
  formTitle = '面试配置',
  guide,
  submit,
  children,
}: InterviewSetupLayoutProps) {
  const meta = INTERVIEW_TYPES[kind];

  return (
    <div className="page py-10">
      <header className="mb-8 flex animate-rise items-center gap-4">
        <span
          aria-hidden="true"
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-[22px] ${meta.toneClass}`}
        >
          {meta.icon}
        </span>
        <div className="min-w-0">
          <h1 className="text-[28px] font-semibold leading-tight tracking-tight text-ink sm:text-[32px]">
            {title ?? meta.label}
          </h1>
          <p className="mt-1.5 text-[15px] text-ink-secondary">{description ?? meta.description}</p>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="surface p-5 sm:p-6 lg:col-span-2">
          <h2 className="mb-5 text-base font-semibold text-ink">{formTitle}</h2>
          {children}
          {submit && (
            <div className="mt-2 flex flex-col gap-3 border-t border-line pt-5 sm:flex-row sm:items-center">
              <Button
                type="primary"
                size="large"
                htmlType="submit"
                form={SETUP_FORM_ID}
                loading={submit.loading}
                disabled={submit.disabled}
                className="w-full sm:w-auto"
              >
                {submit.label}
              </Button>
              {submit.hint && <p className="text-sm text-ink-secondary">{submit.hint}</p>}
            </div>
          )}
        </section>

        <aside className="flex flex-col gap-6">
          <section className="surface p-5">
            <h2 className="text-base font-semibold text-ink">面试说明</h2>
            <ul className="mt-4 space-y-3">
              {guide.focus.map((item) => (
                <li key={item.title} className="flex gap-3">
                  <CircleCheck
                    className="h-[1em] w-[1em] shrink-0 mt-1 text-brand-800"
                    aria-hidden="true"
                  />
                  <div>
                    <div className="text-sm font-medium text-ink">{item.title}</div>
                    <div className="text-sm text-ink-secondary">{item.desc}</div>
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex items-center gap-2 border-t border-line pt-4 text-sm text-ink-secondary">
              <Clock className="h-[1em] w-[1em] shrink-0" aria-hidden="true" />
              <span>预计时长</span>
              <span className="font-medium text-ink tabular-nums">{guide.duration}</span>
            </div>
          </section>

          <section className="surface p-5">
            <h2 className="text-base font-semibold text-ink">注意事项</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-ink-secondary">
              {guide.tips.map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
