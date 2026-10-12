'use client';

import { useEffect, useMemo, useState } from 'react';
import { Select, Empty, Button, message, Pagination, Skeleton } from 'antd';
import { RotateCw } from 'lucide-react';
import { useRouter } from 'next/navigation';

import Link from 'next/link';
import apiClient from '@/services/api/client';
import { INTERVIEW_API } from '@/config/api';
import PageHeader from '@/components/common/PageHeader';
import InterviewTypeTag from '@/components/records/InterviewTypeTag';
import StatusTag from '@/components/records/StatusTag';
import {
  difficultyLabel,
  domainLabel,
  formatDateTime,
  resolveInterviewType,
  scoreLevel,
  SCORE_TEXT_CLASS,
} from '@/components/records/recordMeta';

const QUOTES = [
  '面试是双向选择，保持自信，展示最好的自己。',
  '每一次面试都是成长的机会，无论结果如何。',
  '相信你的准备，你比自己想象的更好。',
  '保持冷静，好机会往往在不经意间出现。',
  '失败只是暂时的，坚持下去，成功就在前方。',
  '充分准备，保持积极，你一定可以。',
  '每一个 offer 的背后，都是无数次的努力和尝试。',
  '面试官也是未来的同事，像朋友一样交流。',
  '努力不会辜负坚持的人。',
  '沉着冷静，你的潜力超乎想象。',
];

const FILTER_OPTIONS = [
  { value: 'all', label: '全部类型' },
  { value: 'comprehensive', label: '简历面试' },
  { value: 'experienced', label: '社招简历面试' },
  { value: 'campus', label: '校招简历面试' },
];

function recordTitle(it: any): string {
  const meta = resolveInterviewType(it.type, it.domain);
  if (it.companyName) {
    const role = it.title || it.positionName;
    return role ? `${it.companyName} · ${role}` : it.companyName;
  }
  if (it.title) return it.title;
  if (it.positionName) return it.positionName;
  if (meta?.kind === 'special' && it.domain) return `${domainLabel(it.domain)} 专项面试`;
  return meta?.label || '未命名面试';
}

export default function InterviewRecordsPage() {
  const router = useRouter();
  const [quote, setQuote] = useState('');
  const [filter, setFilter] = useState('all');

  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1); // 前端分页当前页
  const pageSize = 6; // 前端分页：每页显示6条

  const refreshQuote = () => {
    const random = QUOTES[Math.floor(Math.random() * QUOTES.length)];
    setQuote(random);
  };

  useEffect(() => {
    refreshQuote();
  }, []);

  const fetchList = async () => {
    setLoading(true);
    try {
      // 一次性获取所有数据，然后在前端分页
      const res: any = await apiClient.get(INTERVIEW_API.GET_RECORDS, {
        params: { page: 1, page_size: 1000 },
      });
      const data = res?.data || res;
      const items = (data?.records || []).map((it: any) => ({
        id: it.id,
        userId: it.user_id,
        title: it.title,
        type: it.type,
        difficulty: it.difficulty,
        domain: it.domain,
        companyName: it.company_name,
        positionName: it.position_name,
        score: it.score,
        status: it.status,
        createdAt: it.created_at,
        updatedAt: it.updated_at,
      }));
      setList(items);
    } catch (e: any) {
      message.error(e?.response?.data?.message || '面试记录加载失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const completedCount = useMemo(
    () => list.filter((it) => it.status === 'completed').length,
    [list]
  );
  const totalCount = useMemo(() => list.length, [list]);

  const filteredList = useMemo(() => {
    let filtered = list;

    // 根据类型筛选
    if (filter !== 'all') {
      if (filter === 'comprehensive') {
        filtered = filtered.filter((it) => it.type === 'comprehensive');
      } else if (filter === 'experienced' || filter === 'campus') {
        filtered = filtered.filter((it) => it.domain === filter);
      }
    }

    return filtered;
  }, [list, filter]);

  // 前端分页展示的数据
  const paginatedList = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return filteredList.slice(startIndex, endIndex);
  }, [filteredList, currentPage, pageSize]);

  // 处理筛选变化时重置页码
  useEffect(() => {
    setCurrentPage(1);
  }, [filter]);

  // 处理分页变化
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="page py-10">
      <PageHeader
        title="面试记录"
        description="查看历史面试、评估报告与详细反馈"
        actions={
          <Button type="primary" onClick={() => router.push('/interview/social')}>
            开始面试
          </Button>
        }
      />

      {/* 概览 + 筛选 */}
      <div className="surface mb-4 flex flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:gap-8">
          <dl className="flex shrink-0 items-center gap-8">
            <div>
              <dt className="text-xs text-ink-secondary">面试总数</dt>
              <dd className="mt-0.5 text-2xl font-semibold tabular-nums text-ink">
                {loading ? '–' : totalCount}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink-secondary">已完成</dt>
              <dd className="mt-0.5 text-2xl font-semibold tabular-nums text-brand-800">
                {loading ? '–' : completedCount}
              </dd>
            </div>
          </dl>
          <div className="flex min-w-0 items-center gap-1 border-line text-sm text-ink-secondary sm:border-l sm:pl-8">
            <span className="min-w-0">{quote}</span>
            <Button
              type="text"
              size="small"
              icon={<RotateCw className="h-4 w-4" aria-hidden="true" />}
              onClick={refreshQuote}
              aria-label="换一句"
              title="换一句"
            />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <label htmlFor="record-filter" className="text-sm text-ink-secondary">
            类型
          </label>
          <Select
            id="record-filter"
            value={filter}
            onChange={setFilter}
            style={{ width: 160 }}
            options={FILTER_OPTIONS}
          />
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="surface p-5">
              <Skeleton active title={{ width: '40%' }} paragraph={{ rows: 1, width: '70%' }} />
            </div>
          ))}
        </div>
      ) : filteredList.length === 0 ? (
        <div className="surface px-6 py-12">
          <Empty
            description={
              <span className="text-ink-secondary">
                {list.length === 0
                  ? '还没有面试记录，完成一场模拟面试后会在这里看到评估报告'
                  : '没有符合筛选条件的面试记录'}
              </span>
            }
          >
            <Button type="primary" onClick={() => router.push('/interview/social')}>
              开始面试
            </Button>
          </Empty>
        </div>
      ) : (
        <>
          <ul className="space-y-3">
            {paginatedList.map((it: any) => {
              const meta = resolveInterviewType(it.type, it.domain);
              const createdTime = formatDateTime(it.createdAt);
              const metaParts = [
                meta ? null : domainLabel(it.domain),
                difficultyLabel(it.difficulty),
              ].filter(Boolean);
              const score = typeof it.score === 'number' ? it.score : Number(it.score);
              const hasScore = it.score != null && it.score !== '' && Number.isFinite(score);
              const title = recordTitle(it);

              return (
                <li
                  key={it.id}
                  className="surface-interactive flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:gap-6 sm:p-5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      <InterviewTypeTag type={it.type} domain={it.domain} />
                      <StatusTag status={it.status} />
                    </div>
                    <h3 className="truncate text-base font-medium text-ink" title={title}>
                      {title}
                    </h3>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-secondary">
                      {createdTime && <span className="tabular-nums">{createdTime}</span>}
                      {metaParts.map((p) => (
                        <span key={p as string}>{p}</span>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-6 sm:justify-end">
                    <div className="w-16 text-left sm:text-right">
                      <div className="text-xs text-ink-secondary">得分</div>
                      {hasScore ? (
                        <div
                          className={`text-xl font-semibold tabular-nums ${SCORE_TEXT_CLASS[scoreLevel(score)]}`}
                        >
                          {score}
                        </div>
                      ) : (
                        <div className="text-xl font-semibold text-ink-muted">–</div>
                      )}
                    </div>
                    <Link
                      href={`/user/interviews/results/${it.id}`}
                      className="inline-flex h-9 shrink-0 items-center rounded border border-line-strong bg-white px-4 text-sm font-medium text-ink transition-colors duration-150 hover:border-brand-600 hover:text-brand-800"
                    >
                      查看报告
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>

          {/* 分页组件 */}
          {filteredList.length > pageSize && (
            <div className="mt-6 flex justify-center">
              <Pagination
                current={currentPage}
                total={filteredList.length}
                pageSize={pageSize}
                onChange={handlePageChange}
                showSizeChanger={false}
                showTotal={(total) => <span className="text-ink-secondary">共 {total} 条记录</span>}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
