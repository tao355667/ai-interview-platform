'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Button, Empty, Progress, Skeleton, message } from 'antd';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Bot, Download } from 'lucide-react';
import apiClient from '@/services/api/client';
import { useAuth } from '@/hooks/useAuth';
import { USER_API, INTERVIEW_API } from '@/config/api';
import { colors } from '@/theme/tokens';
import PageHeader from '@/components/common/PageHeader';
import ExpandableText from '@/components/records/ExpandableText';
import InterviewTypeTag from '@/components/records/InterviewTypeTag';
import {
  difficultyLabel,
  formatDateTime,
  formatDuration,
  scoreLevel,
  SCORE_LEVEL_LABEL,
  SCORE_TEXT_CLASS,
  type ScoreLevel,
} from '@/components/records/recordMeta';

const SCORE_STROKE: Record<ScoreLevel, string> = {
  success: colors.success,
  warning: colors.warning,
  danger: colors.danger,
};

const BackLink = () => (
  <Link
    href="/user/interviews"
    className="inline-flex items-center gap-1 text-ink-secondary transition-colors duration-150 hover:text-brand-800"
  >
    <ArrowLeft className="h-[1em] w-[1em] shrink-0" aria-hidden="true" />
    返回面试记录
  </Link>
);

function Section({
  title,
  extra,
  children,
}: {
  title: string;
  extra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="surface p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
        {extra}
      </div>
      {children}
    </section>
  );
}

function toScore(value: unknown): number | null {
  const n = Number(value);
  return value != null && value !== '' && Number.isFinite(n) ? n : null;
}

export default function InterviewResultDetailPage() {
  const params = useParams() as any;
  const id = Number(params?.id || 0);
  const { user, login } = useAuth();

  const [loading, setLoading] = useState(true);
  const [interviewInfo, setInterviewInfo] = useState<any>(null);
  const [evaluation, setEvaluation] = useState<any>(null);
  const [answerRecords, setAnswerRecords] = useState<any[]>([]);

  const fetchData = async () => {
    if (!id) return;
    setLoading(true);
    try {
      // 0. Fetch User Profile if missing
      if (!user) {
        try {
          const userRes: any = await apiClient.get(USER_API.GET_PROFILE);
          if (userRes && userRes.username) {
            login({
              id: String(userRes.id),
              name: userRes.username,
              email: userRes.email,
              avatar: userRes.avatar,
            });
          }
        } catch (e) {
          console.error('Failed to fetch user profile', e);
        }
      }

      // 1. Fetch Interview Info (from list)
      const listRes: any = await apiClient.get(INTERVIEW_API.GET_RECORDS, {
        params: { page: 1, page_size: 1000 },
      });
      const listData = listRes?.records || [];
      const info = listData.find((item: any) => item.id === id);
      setInterviewInfo(info);

      // 2. Fetch Evaluation Report
      const evalRes: any = await apiClient.get(INTERVIEW_API.GET_EVALUATION, {
        params: { report_id: id },
      });
      setEvaluation(evalRes);

      // 3. Fetch Answer Records
      const recordRes: any = await apiClient.get(INTERVIEW_API.GET_ANSWER_RECORD, {
        params: { report_id: id },
      });
      if (recordRes && recordRes.records) {
        setAnswerRecords(recordRes.records);
      } else if (Array.isArray(recordRes)) {
        setAnswerRecords(recordRes);
      } else {
        setAnswerRecords(recordRes?.records || []);
      }
    } catch (e: any) {
      console.error(e);
      message.error('评估报告加载失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) {
    return (
      <div className="page py-10">
        <PageHeader title="评估报告" extra={<BackLink />} />
        <div className="space-y-4">
          <div className="surface p-6">
            <Skeleton active paragraph={{ rows: 3 }} />
          </div>
          <div className="surface p-6">
            <Skeleton active paragraph={{ rows: 5 }} />
          </div>
        </div>
      </div>
    );
  }

  if (!evaluation) {
    return (
      <div className="page py-10">
        <PageHeader title="评估报告" extra={<BackLink />} />
        <div className="surface px-6 py-12">
          <Empty
            description={
              <div className="space-y-1">
                <div className="text-base font-medium text-ink">暂无评估报告</div>
                <div className="text-ink-secondary">
                  面试可能仍在进行中，或报告正在生成，请稍后再来查看
                </div>
              </div>
            }
          >
            <Link
              href="/user/interviews"
              className="inline-flex h-9 items-center rounded bg-brand-600 px-4 text-sm font-medium text-ink transition-colors duration-150 hover:bg-brand-500 hover:text-ink"
            >
              返回面试记录
            </Link>
          </Empty>
        </div>
      </div>
    );
  }

  const score = toScore(evaluation.score);
  const level = score != null ? scoreLevel(score) : null;
  const dimensions: any[] = evaluation.dimensions || [];

  const infoItems: { label: string; value: ReactNode }[] = [
    { label: '候选人', value: user?.name || '未知用户' },
    { label: '公司', value: interviewInfo?.company_name || '未填写' },
    { label: '岗位', value: interviewInfo?.position_name || '未填写' },
    { label: '难度', value: difficultyLabel(interviewInfo?.difficulty) || '未知' },
    { label: '用时', value: formatDuration(interviewInfo?.duration) || '未知' },
    { label: '面试时间', value: formatDateTime(interviewInfo?.created_at) || '未知' },
  ];

  return (
    <div className="page py-10">
      <PageHeader
        title="评估报告"
        description="回顾本场面试表现，查看各维度得分与逐题点评"
        extra={<BackLink />}
        actions={
          <>
            <Button icon={<Download className="h-4 w-4" aria-hidden="true" />}>下载报告</Button>
            <Button icon={<Bot className="h-4 w-4" aria-hidden="true" />}>AI 改进建议</Button>
          </>
        }
      />

      <div className="space-y-4">
        {/* 概览：总分 + 基本信息 */}
        <section className="surface grid gap-6 p-5 sm:p-6 md:grid-cols-[220px_1fr] md:gap-8">
          <div className="border-line md:border-r md:pr-8">
            <div className="text-sm text-ink-secondary">综合得分</div>
            <div className="mt-1 flex items-baseline gap-1">
              <span
                className={`text-[32px] font-semibold leading-tight tabular-nums ${
                  level ? SCORE_TEXT_CLASS[level] : 'text-ink'
                }`}
              >
                {score ?? '–'}
              </span>
              <span className="text-sm text-ink-secondary">/ 100</span>
            </div>
            {level && (
              <div className={`mt-1 text-sm font-medium ${SCORE_TEXT_CLASS[level]}`}>
                {SCORE_LEVEL_LABEL[level]}
              </div>
            )}
            {score != null && (
              <Progress
                className="mt-3"
                percent={Math.max(0, Math.min(100, score))}
                showInfo={false}
                strokeColor={level ? SCORE_STROKE[level] : undefined}
                size="small"
              />
            )}
          </div>

          <div className="min-w-0">
            <div className="mb-3">
              <InterviewTypeTag type={interviewInfo?.type} domain={interviewInfo?.domain} full />
            </div>
            <dl className="grid grid-cols-1 gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
              {infoItems.map((item) => (
                <div key={item.label} className="flex min-w-0 gap-3">
                  <dt className="w-16 shrink-0 text-ink-secondary">{item.label}</dt>
                  <dd className="min-w-0 break-words text-ink [overflow-wrap:anywhere]">
                    {item.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* 总评 */}
        {evaluation.comment && (
          <Section title="总评">
            <ExpandableText
              content={evaluation.comment}
              lines={5}
              threshold={160}
              className="max-w-3xl text-[15px] leading-7 text-ink"
            />
          </Section>
        )}

        {/* 各维度得分 */}
        <Section title="各维度得分">
          {dimensions.length > 0 ? (
            <ul className="divide-y divide-line">
              {dimensions.map((d: any, i: number) => {
                const dScore = toScore(d.score);
                const dLevel = dScore != null ? scoreLevel(dScore) : null;
                return (
                  <li key={i} className="py-4 first:pt-0 last:pb-0">
                    <div className="flex items-center justify-between gap-4">
                      <span className="min-w-0 break-words font-medium text-ink [overflow-wrap:anywhere]">
                        {d.dimension_name}
                      </span>
                      <span className="shrink-0 text-ink-secondary">
                        <span
                          className={`text-base font-semibold tabular-nums ${
                            dLevel ? SCORE_TEXT_CLASS[dLevel] : 'text-ink'
                          }`}
                        >
                          {dScore ?? '–'}
                        </span>
                        <span className="ml-1 text-xs">/ 100</span>
                      </span>
                    </div>
                    <Progress
                      percent={dScore != null ? Math.max(0, Math.min(100, dScore)) : 0}
                      showInfo={false}
                      strokeColor={dLevel ? SCORE_STROKE[dLevel] : undefined}
                      size="small"
                      className="mb-0"
                    />
                    {d.evaluation && (
                      <ExpandableText
                        content={d.evaluation}
                        lines={3}
                        threshold={120}
                        className="mt-1 max-w-3xl text-sm leading-6 text-ink-secondary"
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无维度评分" />
          )}
        </Section>

        {/* 逐题点评 */}
        <Section
          title="逐题点评"
          extra={
            answerRecords.length > 0 ? (
              <span className="text-sm text-ink-secondary">共 {answerRecords.length} 题</span>
            ) : undefined
          }
        >
          {answerRecords && answerRecords.length > 0 ? (
            <ol className="divide-y divide-line">
              {answerRecords.map((rec: any, index) => {
                const c = rec.comment;
                const commentRows = c
                  ? [
                      { label: '考察要点', val: c.key_points },
                      { label: '亮点', val: c.strengths, color: 'text-success' },
                      { label: '不足', val: c.weaknesses, color: 'text-danger' },
                      { label: '改进建议', val: c.suggestion },
                      { label: '答题思路', val: c.thinking },
                      { label: '参考答案', val: c.reference },
                    ].filter((item) => item.val)
                  : [];
                return (
                  <li key={index} className="py-6 first:pt-0 last:pb-0">
                    <div className="mb-4 flex items-start gap-3">
                      <span className="mt-0.5 inline-flex h-6 min-w-[24px] shrink-0 items-center justify-center rounded bg-brand-50 px-1.5 text-xs font-semibold tabular-nums text-brand-800">
                        {rec.order ?? index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <ExpandableText
                          content={rec.content}
                          lines={2}
                          threshold={80}
                          className="max-w-3xl text-base font-medium leading-7 text-ink"
                        />
                      </div>
                      {c && toScore(c.score) != null && (
                        <span className="shrink-0 text-sm text-ink-secondary">
                          <span className="text-base font-semibold tabular-nums text-ink">
                            {c.score}
                          </span>{' '}
                          分
                        </span>
                      )}
                    </div>

                    <div className="space-y-4 sm:pl-9">
                      {rec.message?.map((m: any, mIdx: number) => (
                        <div key={mIdx} className="max-w-3xl space-y-3">
                          {m.question && (
                            <div>
                              <div className="mb-1 text-xs font-medium text-ink-secondary">
                                面试官
                              </div>
                              <ExpandableText
                                content={m.question}
                                lines={3}
                                threshold={100}
                                className="text-[15px] leading-7 text-ink"
                              />
                            </div>
                          )}
                          <div className="rounded-lg border border-line bg-canvas px-4 py-3">
                            <div className="mb-1 text-xs font-medium text-brand-800">我的回答</div>
                            {m.answer ? (
                              <ExpandableText
                                content={m.answer}
                                lines={4}
                                threshold={140}
                                className="text-[15px] leading-7 text-ink"
                              />
                            ) : (
                              <div className="text-[15px] leading-7 text-ink-muted">未作答</div>
                            )}
                          </div>
                        </div>
                      ))}

                      {c && (
                        <div className="max-w-3xl rounded-lg border border-brand-200 px-4 py-4">
                          <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                            <span className="inline-flex items-center gap-1.5 font-medium text-brand-800">
                              <Bot className="h-[1em] w-[1em] shrink-0" aria-hidden="true" />
                              AI 点评
                            </span>
                            {c.difficulty && (
                              <span className="text-ink-secondary">
                                难度：{difficultyLabel(c.difficulty)}
                              </span>
                            )}
                          </div>
                          {commentRows.length > 0 && (
                            <dl className="space-y-3">
                              {commentRows.map((item) => (
                                <div
                                  key={item.label}
                                  className="flex flex-col gap-1 sm:flex-row sm:gap-4"
                                >
                                  <dt className="shrink-0 text-sm font-medium text-ink-secondary sm:w-16">
                                    {item.label}
                                  </dt>
                                  <dd className="min-w-0 flex-1">
                                    <ExpandableText
                                      content={item.val}
                                      lines={4}
                                      threshold={140}
                                      className={`text-[15px] leading-7 ${item.color || 'text-ink'}`}
                                    />
                                  </dd>
                                </div>
                              ))}
                            </dl>
                          )}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无答题记录" />
          )}
        </Section>
      </div>
    </div>
  );
}
