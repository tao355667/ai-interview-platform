'use client';

import { useMemo, useState, useEffect, type ReactNode } from 'react';
import Link from 'next/link';
import { Button, Empty, Skeleton, message } from 'antd';
import {
  ArrowLeft,
  Book,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Lightbulb,
  Star,
} from 'lucide-react';
import { useParams } from 'next/navigation';
import { predictionService } from '@/services/api/prediction';
import { PredictionQuestion } from '@/types/prediction';
import PageHeader from '@/components/common/PageHeader';

const pad = (n: number) => String(n).padStart(2, '0');

function Section({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h3 className="mb-3 flex items-center gap-2 text-base font-semibold text-ink">
        <span className="text-brand-800">{icon}</span>
        {title}
      </h3>
      {children}
    </section>
  );
}

export default function PressDetailPage() {
  const params = useParams();
  const id = Number(params.id);
  const [loading, setLoading] = useState(true);
  const [questions, setQuestions] = useState<PredictionQuestion[]>([]);
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    if (!id) return;

    const fetchDetail = async () => {
      setLoading(true);
      try {
        const res = await predictionService.getPredictionDetail(id);
        setQuestions(res.questions || []);
      } catch (error) {
        console.error('Failed to fetch prediction detail:', error);
        message.error('获取押题详情失败');
      } finally {
        setLoading(false);
      }
    };

    fetchDetail();
  }, [id]);

  const current = useMemo(() => questions[selected] || null, [questions, selected]);

  const parsedFollowUps = useMemo(() => {
    if (!current?.follow_up) return [];
    try {
      const parsed = JSON.parse(current.follow_up);
      if (Array.isArray(parsed)) return parsed;
      return [current.follow_up];
    } catch (e) {
      return [current.follow_up];
    }
  }, [current]);

  const backLink = (
    <Link
      href="/user/press"
      className="inline-flex items-center gap-1 text-ink-secondary hover:text-brand-800"
    >
      <ArrowLeft className="h-[1em] w-[1em] shrink-0" aria-hidden="true" />
      返回押题记录
    </Link>
  );

  if (loading) {
    return (
      <div className="page py-10">
        <PageHeader title="押题详情" extra={backLink} />
        <div className="grid grid-cols-1 gap-6 md:grid-cols-12">
          <div className="surface p-4 md:col-span-4 lg:col-span-3">
            <Skeleton active title={false} paragraph={{ rows: 8 }} />
          </div>
          <div className="surface p-6 md:col-span-8 lg:col-span-9">
            <Skeleton active paragraph={{ rows: 10 }} />
          </div>
        </div>
      </div>
    );
  }

  if (!current) {
    return (
      <div className="page py-10">
        <PageHeader title="押题详情" extra={backLink} />
        <div className="surface py-12">
          <Empty description="没有找到这份押题的内容">
            <Link href="/resume">
              <Button type="primary">去押题</Button>
            </Link>
          </Empty>
        </div>
      </div>
    );
  }

  return (
    <div className="page py-10">
      <PageHeader
        title="押题详情"
        description={
          <>
            共 <span className="tabular-nums">{questions.length}</span>{' '}
            道题，包含考察重点、答题思路和参考答案
          </>
        }
        extra={backLink}
      />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-12">
        {/* 题目列表 */}
        <aside className="surface overflow-hidden md:col-span-4 md:self-start lg:col-span-3">
          <div className="border-b border-line px-4 py-3 text-sm font-medium text-ink">
            题目列表
          </div>
          <ol className="max-h-[calc(100vh-240px)] overflow-y-auto py-1">
            {questions.map((item, index) => {
              const active = index === selected;
              return (
                <li key={item.id ?? index}>
                  <button
                    type="button"
                    onClick={() => setSelected(index)}
                    aria-current={active ? 'true' : undefined}
                    className={`flex w-full gap-2 border-l-2 px-4 py-2.5 text-left text-sm transition-colors duration-150 ${
                      active
                        ? 'border-brand-700 bg-brand-50 text-brand-800'
                        : 'border-transparent text-ink hover:bg-canvas'
                    }`}
                  >
                    <span
                      className={`shrink-0 tabular-nums ${active ? 'text-brand-800' : 'text-ink-secondary'}`}
                    >
                      {pad(index + 1)}
                    </span>
                    <span className="line-clamp-2">{item.question}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </aside>

        {/* 题目详情 */}
        <article className="surface p-6 md:col-span-8 lg:col-span-9">
          <div className="flex gap-3">
            <span className="shrink-0 text-xl font-semibold tabular-nums text-brand-800">
              {pad(selected + 1)}
            </span>
            <h2 className="text-xl font-semibold leading-8 text-ink">{current.question}</h2>
          </div>

          <div className="mt-6 space-y-8 border-t border-line pt-6">
            <Section icon={<Star className="h-4 w-4" aria-hidden="true" />} title="考察重点">
              <div className="rounded-lg bg-brand-50 px-4 py-3 text-[15px] leading-7 text-ink">
                {current.focus}
              </div>
            </Section>

            <Section icon={<CircleCheck className="h-4 w-4" aria-hidden="true" />} title="答题思路">
              <div className="whitespace-pre-wrap text-[15px] leading-7 text-ink">
                {current.thinking_path}
              </div>
            </Section>

            <Section icon={<Book className="h-4 w-4" aria-hidden="true" />} title="参考答案">
              <div className="whitespace-pre-wrap rounded-lg border border-line bg-canvas px-4 py-3 text-[15px] leading-7 text-ink">
                {current.reference_answer}
              </div>
            </Section>

            {parsedFollowUps.length > 0 && (
              <Section
                icon={<Lightbulb className="h-4 w-4" aria-hidden="true" />}
                title="可能的追问"
              >
                <ol className="divide-y divide-line rounded-lg border border-line">
                  {parsedFollowUps.map((t: any, i: number) => (
                    <li key={i} className="flex gap-3 px-4 py-3 text-[15px] leading-7 text-ink">
                      <span className="shrink-0 tabular-nums text-brand-800">{pad(i + 1)}</span>
                      <span>{t}</span>
                    </li>
                  ))}
                </ol>
              </Section>
            )}
          </div>

          <div className="mt-8 flex items-center justify-between border-t border-line pt-4">
            <Button
              icon={<ChevronLeft className="h-4 w-4" aria-hidden="true" />}
              disabled={selected === 0}
              onClick={() => setSelected((s) => Math.max(0, s - 1))}
            >
              上一题
            </Button>
            <span className="text-sm tabular-nums text-ink-secondary">
              {selected + 1} / {questions.length}
            </span>
            <Button
              disabled={selected >= questions.length - 1}
              onClick={() => setSelected((s) => Math.min(questions.length - 1, s + 1))}
            >
              下一题
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </article>
      </div>
    </div>
  );
}
